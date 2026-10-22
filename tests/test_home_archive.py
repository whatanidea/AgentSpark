from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from azure.cosmos import exceptions
from fastapi.testclient import TestClient

from app.api import routes
from app.database.cosmos_client import DatabaseClient
from app.database.decision_archive import LocalDecisionArchive, decode_record, timestamp
from app.main import app
from app.security.auth import Principal, principal_context
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse, WorkflowNotFound
from app.utils.models import HumanReview, WorkflowIntelligence, WorkflowState


@contextmanager
def owner(identity):
    token = principal_context.set(Principal(identity, identity))
    try:
        yield
    finally:
        principal_context.reset(token)


class ArchiveFixture:
    def setUp(self):
        directory = TemporaryDirectory(prefix="agentspark-archive-test-")
        self.addCleanup(directory.cleanup)
        self.path = str(Path(directory.name) / "decisions.sqlite3")
        environment = patch.dict(os.environ, {"DEMO_ARCHIVE_PATH": self.path, "DECISION_ARCHIVE_RETENTION_DAYS": "30"})
        environment.start()
        self.addCleanup(environment.stop)
        self.database = DatabaseClient()

    def pending(self, session=None):
        state = WorkflowState(
            session_id=session or str(uuid4()), owner_id=principal_context.get().owner_id,
            status="awaiting_human_review", analysis_id=str(uuid4()),
            workflow_intelligence=WorkflowIntelligence(workflow_name="Invoice Approval"),
            governance={"decision": "HUMAN_REVIEW_REQUIRED", "reason": "Review required."},
            chat_history=[{"role": "user", "content": "Private transcript alice@example.com"}],
        )
        self.database.save_workflow_state(state)
        return state

    def decide(self, state, decision="approve"):
        state.status = "completed" if decision == "approve" else "rejected"
        state.human_review = HumanReview(analysis_id=state.analysis_id, decision=decision,
                                        reviewer="Fictional reviewer", note="Checked; contact alice@example.com.",
                                        reviewed_at=datetime.now(timezone.utc))
        self.database.save_workflow_state(state)
        return self.database.get_decision(state.session_id, state.analysis_id)

class DecisionArchiveTests(ArchiveFixture, unittest.TestCase):
    def test_decision_survives_a_real_process_restart_without_full_chat(self):
        state = self.pending()
        record = self.decide(state)
        serialized = record.model_dump_json()
        self.assertNotIn("Private transcript", serialized)
        self.assertNotIn("alice@example.com", serialized)
        self.assertNotIn("chat_history", serialized)
        result = subprocess.run([sys.executable, "-B", "-c",
            "from app.database.cosmos_client import DatabaseClient; "
            f"r=DatabaseClient().get_decision({state.session_id!r}, {state.analysis_id!r}); "
            "print(r.home.status, r.details['human_review']['reviewer'])"],
            capture_output=True, text=True, env=dict(os.environ, AGENTSENSE_MODE="demo"), timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("approved Fictional reviewer", result.stdout)

    def test_pending_is_not_archived_and_final_record_is_not_refreshed_by_later_saves(self):
        state = self.pending()
        self.assertEqual(self.database.archive.page("local-demo", "all", "", 10), [])
        first = self.decide(state)
        state = self.database.get_workflow_state(state.session_id)
        self.database.save_workflow_state(state)
        second = self.database.get_decision(state.session_id, state.analysis_id)
        self.assertEqual(first, second)
        expires = datetime.fromisoformat(first.home.expires_at)
        created = datetime.fromisoformat(first.home.updated_at)
        self.assertEqual(expires - created, timedelta(days=30))
        self.assertEqual(first.ttl, 30 * 86400)

    def test_reanalysis_preserves_prior_review_and_creates_distinct_decision_versions(self):
        state = self.pending()
        original = self.decide(state)
        state.invalidate_analysis()
        self.database.save_workflow_state(state)
        state.analysis_id = str(uuid4())
        state.status = "awaiting_human_review"
        self.database.save_workflow_state(state)
        second = self.decide(state, "reject")
        self.assertNotEqual(original.home.analysis_id, second.home.analysis_id)
        self.assertEqual(self.database.get_decision(state.session_id, original.home.analysis_id), original)
        self.assertEqual(len(self.database.list_home()["items"]), 2)
        self.assertEqual(len(self.database.list_home("approved")["items"]), 1)
        self.assertEqual(len(self.database.list_home("rejected")["items"]), 1)

    def test_stale_reviewer_cannot_create_a_conflicting_archived_decision(self):
        state = self.pending()
        stale = self.database.get_workflow_state(state.session_id)
        self.decide(state)
        with self.assertRaises(ConcurrentUpdate):
            self.decide(stale, "reject")
        self.assertEqual(len(self.database.archive.page("local-demo", "all", "", 10)), 1)

    def test_archive_failure_does_not_commit_demo_approval_or_mark_it_recorded(self):
        state = self.pending()
        original_etag = state._etag
        with patch.object(self.database.archive, "put", side_effect=DependencyUnavailable("decision_archive")):
            with self.assertRaises(DependencyUnavailable):
                self.decide(state)
        persisted = self.database.get_workflow_state(state.session_id)
        self.assertEqual(persisted.status, "awaiting_human_review")
        self.assertEqual(persisted._etag, original_etag)
        self.assertIsNone(state.decision_recorded_at)

    def test_owner_isolation_applies_to_listing_detail_and_cascade_delete(self):
        with owner("owner-a"):
            state = self.pending()
            record = self.decide(state)
        with owner("owner-b"):
            self.assertEqual(self.database.list_home()["items"], [])
            with self.assertRaises(WorkflowNotFound):
                self.database.get_decision(state.session_id, record.home.analysis_id)
            with self.assertRaises(WorkflowNotFound):
                self.database.delete_archived_workflow(state.session_id, record.home.analysis_id)
        with owner("owner-a"):
            self.assertEqual(len(self.database.list_home()["items"]), 1)

    def test_delete_active_workflow_removes_every_archived_version(self):
        state = self.pending()
        original = self.decide(state)
        state.invalidate_analysis()
        self.database.save_workflow_state(state)
        self.database.delete_workflow_state(state.session_id)
        self.assertEqual(self.database.list_home()["items"], [])
        with self.assertRaises(WorkflowNotFound):
            self.database.get_decision(state.session_id, original.home.analysis_id)

    def test_expired_or_missing_active_session_does_not_remove_access_to_archive(self):
        state = self.pending()
        record = self.decide(state)
        self.database.mock_db.clear()
        self.assertEqual(self.database.get_decision(state.session_id, state.analysis_id), record)
        self.database.delete_archived_workflow(state.session_id, state.analysis_id)
        with self.assertRaises(WorkflowNotFound):
            self.database.get_decision(state.session_id, state.analysis_id)

    def test_archive_delete_does_not_remove_another_owners_reused_session_id(self):
        with owner("owner-a"):
            state = self.pending()
            record = self.decide(state)
        self.database.mock_db.clear()
        with owner("owner-b"):
            other = self.pending(state.session_id)
        with owner("owner-a"):
            self.database.delete_archived_workflow(state.session_id, record.home.analysis_id)
        with owner("owner-b"):
            self.assertEqual(self.database.get_workflow_state(other.session_id)._etag, other._etag)

    def test_expired_archive_is_purged_and_not_returned(self):
        state = self.pending()
        self.decide(state)
        with self.database.archive.connection() as connection:
            connection.execute("UPDATE decisions SET expires=?", (timestamp(datetime.now(timezone.utc) - timedelta(seconds=1)),))
        with self.assertRaises(WorkflowNotFound):
            self.database.get_decision(state.session_id, state.analysis_id)
        self.assertEqual(self.database.list_home()["items"], [])

    def test_home_keyset_pages_are_bounded_and_do_not_repeat_drafts(self):
        ids = set()
        for _ in range(5):
            state = WorkflowState(session_id=str(uuid4()))
            self.database.save_workflow_state(state)
            ids.add(state.session_id)
        seen = []
        cursor = ""
        while True:
            page = self.database.list_home("draft", cursor, 2)
            self.assertLessEqual(len(page["items"]), 2)
            seen.extend(item["session_id"] for item in page["items"])
            if not page["next_cursor"]:
                break
            cursor = page["next_cursor"]
        self.assertEqual(set(seen), ids)
        self.assertEqual(len(seen), 5)

    def test_invalid_retention_and_corrupt_records_fail_explicitly(self):
        for days in ("0", "-1", "3651", "unknown"):
            with patch.dict(os.environ, {"DECISION_ARCHIVE_RETENTION_DAYS": days}), self.assertRaises(ValueError):
                LocalDecisionArchive()
        state = self.pending()
        self.decide(state)
        with self.database.archive.connection() as connection:
            connection.execute("UPDATE decisions SET record='not-json'")
        with self.assertLogs("app.database.decision_archive", level="ERROR"), self.assertRaises(InvalidDependencyResponse):
            self.database.get_decision(state.session_id, state.analysis_id)

    def test_personal_home_api_validates_filters_and_archive_detail_has_no_owner(self):
        state = self.pending()
        self.decide(state)
        with patch.object(routes, "db_client", self.database):
            client = TestClient(app)
            response = client.get("/api/v1/home?status=approved&limit=1")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["items"][0]["session_id"], state.session_id)
            detail = client.get(f"/api/v1/decisions/{state.session_id}/{state.analysis_id}")
            self.assertEqual(detail.status_code, 200)
            self.assertNotIn("owner_id", detail.text)
            self.assertNotIn("chat_history", detail.text)
            for query in ("status=unknown", "limit=0", "limit=101", "cursor=bad%20cursor"):
                self.assertEqual(client.get(f"/api/v1/home?{query}").status_code, 422)

    def test_inconsistent_snapshot_metadata_fails_explicitly(self):
        record = self.decide(self.pending())
        for changes in ({"id": "decision-wrong"}, {"session_id": str(uuid4())}, {"ttl": 0},
                        {"home": {**record.home.model_dump(), "status": "draft"}}):
            with self.subTest(changes=changes):
                with self.assertLogs("app.database.decision_archive", level="ERROR"), self.assertRaises(InvalidDependencyResponse):
                    decode_record({**record.model_dump(), **changes})

    def test_unwritable_archive_fails_readiness_without_transient_fallback(self):
        self.decide(self.pending())
        with patch.dict(os.environ, {"DEMO_ARCHIVE_PATH": str(Path(self.path) / "child.sqlite3")}):
            with self.assertLogs("app.database.decision_archive", level="ERROR"), self.assertRaises(DependencyUnavailable):
                LocalDecisionArchive().check_ready()


class CosmosDecisionContractTests(ArchiveFixture, unittest.TestCase):
    def live(self):
        self.database.use_mock = False
        self.database.container = Mock()
        return self.database.container

    def test_final_write_batches_conditional_session_and_archive_in_same_partition(self):
        state = self.pending()
        container = self.live()
        state.status = "completed"
        def response(operations, partition_key):
            return [{"resourceBody": {**operations[0][1][1], "_etag": "next-version"}}, {}]
        container.execute_item_batch.side_effect = response
        previous = state._etag
        self.database.save_workflow_state(state)
        operations = container.execute_item_batch.call_args.args[0]
        self.assertEqual(operations[0][0], "replace")
        self.assertEqual(operations[0][2], {"if_match_etag": previous})
        self.assertEqual(operations[1][0], "create")
        self.assertEqual(operations[1][1][0]["session_id"], state.session_id)
        self.assertEqual(operations[1][1][0]["document_type"], "decision_archive")
        self.assertEqual(container.execute_item_batch.call_args.kwargs["partition_key"], state.session_id)
        self.assertEqual(state._etag, "next-version")
        self.assertIsNotNone(state.decision_recorded_at)
        container.upsert_item.assert_not_called()

    def test_failed_atomic_batch_is_a_conflict_and_does_not_set_archive_marker(self):
        state = self.pending()
        container = self.live()
        state.status = "completed"
        container.execute_item_batch.side_effect = exceptions.CosmosBatchOperationError(
            error_index=0, operation_responses=[], status_code=412, headers={}, message="conflict")
        with self.assertRaises(ConcurrentUpdate):
            self.database.save_workflow_state(state)
        self.assertIsNone(state.decision_recorded_at)

    def test_home_query_is_owner_filtered_projected_and_keyset_paged(self):
        container = self.live()
        container.query_items.return_value = []
        self.assertEqual(self.database.list_home("approved", "", 20)["items"], [])
        call = container.query_items.call_args_list[0].kwargs
        self.assertIn("SELECT TOP 21 c.home, c.owner_id", call["query"])
        self.assertIn("c.owner_id = @owner", call["query"])
        self.assertIn("c.home.sort_key < @cursor", call["query"])
        self.assertNotIn("OFFSET", call["query"])
        self.assertIn({"name": "@owner", "value": "local-demo"}, call["parameters"])

    def test_cascade_deletion_uses_bounded_same_partition_batches_and_session_etag(self):
        state = self.pending()
        container = self.live()
        container.read_item.return_value = {**state.model_dump(mode="json"), "_etag": "v1"}
        container.query_items.side_effect = [
            [{"id": f"decision-{index}", "_etag": str(index)} for index in range(99)],
            [{"id": "decision-last", "_etag": "last"}], [],
        ]
        self.database.delete_workflow_state(state.session_id)
        self.assertEqual(container.execute_item_batch.call_count, 2)
        self.assertEqual(len(container.execute_item_batch.call_args_list[0].args[0]), 99)
        self.assertEqual(container.delete_item.call_args.kwargs["etag"], "v1")
        for call in container.query_items.call_args_list:
            self.assertEqual(call.kwargs["partition_key"], state.session_id)
            self.assertIn({"name": "@owner", "value": "local-demo"}, call.kwargs["parameters"])

    def test_cascade_batch_conflict_does_not_delete_active_session(self):
        state = self.pending()
        container = self.live()
        container.read_item.return_value = {**state.model_dump(mode="json"), "_etag": "v1"}
        container.query_items.return_value = [{"id": "decision-test", "_etag": "v2"}]
        container.execute_item_batch.side_effect = exceptions.CosmosBatchOperationError(
            error_index=0, operation_responses=[], status_code=412, headers={}, message="conflict")
        with self.assertRaises(ConcurrentUpdate):
            self.database.delete_workflow_state(state.session_id)
        container.delete_item.assert_not_called()
