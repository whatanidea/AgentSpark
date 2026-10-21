import os
import unittest
from unittest.mock import Mock, patch

os.environ["AGENTSENSE_MODE"] = "demo"

from azure.core import MatchConditions
from azure.core.exceptions import ServiceRequestError
from azure.cosmos import exceptions

from app.database.cosmos_client import DatabaseClient
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse, WorkflowNotFound
from app.utils.models import WorkflowState


class DemoPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.database = DatabaseClient()

    def test_missing_session_requires_explicit_creation(self):
        with self.assertRaises(WorkflowNotFound):
            self.database.get_workflow_state("missing")
        state = self.database.get_workflow_state("missing", create_if_missing=True)
        self.assertIsNone(state._etag)
        self.assertNotIn("missing", self.database.mock_db)

    def test_two_new_creates_cannot_overwrite_each_other(self):
        first = WorkflowState(session_id="new-session")
        second = WorkflowState(session_id="new-session")
        self.database.save_workflow_state(first)
        with self.assertRaises(ConcurrentUpdate):
            self.database.save_workflow_state(second)

    def test_stale_writer_is_rejected_and_fresh_updates_work(self):
        initial = WorkflowState(session_id="existing-session")
        self.database.save_workflow_state(initial)
        first = self.database.get_workflow_state(initial.session_id)
        stale = self.database.get_workflow_state(initial.session_id)
        old_etag = first._etag
        first.enterprise_context.business_domain = "First writer"
        self.database.save_workflow_state(first)
        self.assertNotEqual(first._etag, old_etag)
        stale.enterprise_context.business_domain = "Stale writer"
        with self.assertRaises(ConcurrentUpdate):
            self.database.save_workflow_state(stale)
        self.assertEqual(self.database.get_workflow_state(initial.session_id).enterprise_context.business_domain,
                         "First writer")
        self.database.save_workflow_state(first)
        self.assertNotIn("_etag", first.model_dump())

    def test_unsaved_changes_do_not_mutate_stored_documents(self):
        state = WorkflowState(session_id="isolation", chat_history=[{"role": "user", "content": "Original"}])
        self.database.save_workflow_state(state)
        state.chat_history[0]["content"] = "Unsaved"
        loaded = self.database.get_workflow_state(state.session_id)
        self.assertEqual(loaded.chat_history[0]["content"], "Original")
        loaded.chat_history[0]["content"] = "Also unsaved"
        self.assertEqual(self.database.get_workflow_state(state.session_id).chat_history[0]["content"], "Original")

    def test_deleted_session_is_not_recreated_by_stale_writer(self):
        state = WorkflowState(session_id="deleted")
        self.database.save_workflow_state(state)
        self.database.mock_db.pop(state.session_id)
        with self.assertRaises(ConcurrentUpdate):
            self.database.save_workflow_state(state)

    def test_malformed_persisted_document_is_not_treated_as_missing(self):
        self.database.mock_db["invalid"] = {"session_id": "invalid"}
        with self.assertLogs("app.database.cosmos_client", level="ERROR"):
            with self.assertRaises(InvalidDependencyResponse):
                self.database.get_workflow_state("invalid")


class CosmosPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.database = DatabaseClient()
        self.database.use_mock = False
        self.database.container = Mock()
        self.document = {"id": "cosmos-session", "session_id": "cosmos-session", "_etag": "version-1"}

    def test_create_and_replace_use_conditional_writes(self):
        state = WorkflowState(session_id="cosmos-session")
        self.database.container.create_item.return_value = self.document
        self.database.save_workflow_state(state)
        self.database.container.create_item.assert_called_once()
        self.database.container.replace_item.assert_not_called()
        self.database.container.replace_item.return_value = {**self.document, "_etag": "version-2"}
        self.database.save_workflow_state(state)
        call = self.database.container.replace_item.call_args.kwargs
        self.assertEqual(call["etag"], "version-1")
        self.assertEqual(call["match_condition"], MatchConditions.IfNotModified)
        self.assertNotIn("_etag", call["body"])
        self.assertEqual(state._etag, "version-2")

    def test_read_retains_etag_for_next_write(self):
        self.database.container.read_item.return_value = self.document
        state = self.database.get_workflow_state("cosmos-session")
        self.assertEqual(state._etag, "version-1")
        self.assertNotIn("_etag", state.model_dump(mode="json"))

    def test_missing_item_and_connection_failure_are_distinct(self):
        self.database.container.read_item.side_effect = exceptions.CosmosResourceNotFoundError(
            status_code=404, message="missing")
        with self.assertRaises(WorkflowNotFound):
            self.database.get_workflow_state("cosmos-session")
        self.assertIsNone(self.database.get_workflow_state("cosmos-session", create_if_missing=True)._etag)
        self.database.container.read_item.side_effect = ServiceRequestError("sensitive-internal-detail")
        with self.assertLogs("app.database.cosmos_client", level="ERROR"):
            with self.assertRaises(DependencyUnavailable) as error:
                self.database.get_workflow_state("cosmos-session", create_if_missing=True)
        self.assertNotIn("sensitive-internal-detail", str(error.exception))
        self.assertFalse(self.database.use_mock)
        self.assertEqual(self.database.mock_db, {})

    def test_readiness_failure_does_not_switch_to_demo(self):
        self.database.container.read.side_effect = ServiceRequestError("unavailable")
        with self.assertLogs("app.database.cosmos_client", level="ERROR"):
            with self.assertRaises(DependencyUnavailable):
                self.database.check_ready()
        self.assertFalse(self.database.use_mock)

    def test_missing_container_is_not_reported_as_a_missing_session(self):
        self.database.container.read_item.side_effect = exceptions.CosmosResourceNotFoundError(
            status_code=404, message="not found")
        self.database.container.read.side_effect = exceptions.CosmosResourceNotFoundError(
            status_code=404, message="container not found")
        with self.assertLogs("app.database.cosmos_client", level="ERROR"):
            with self.assertRaises(DependencyUnavailable):
                self.database.get_workflow_state("cosmos-session", create_if_missing=True)

    def test_cosmos_write_conflicts_map_to_domain_conflicts(self):
        for status in (409, 412, 404):
            with self.subTest(status=status):
                state = WorkflowState(session_id="cosmos-session")
                state._etag = "version-1"
                self.database.container.replace_item.side_effect = exceptions.CosmosHttpResponseError(
                    status_code=status, message="conflict")
                with self.assertRaises(ConcurrentUpdate):
                    self.database.save_workflow_state(state)

    def test_create_collision_is_not_an_upsert(self):
        self.database.container.create_item.side_effect = exceptions.CosmosResourceExistsError(
            status_code=409, message="exists")
        with self.assertRaises(ConcurrentUpdate):
            self.database.save_workflow_state(WorkflowState(session_id="cosmos-session"))
        self.database.container.upsert_item.assert_not_called()

    def test_failed_create_is_not_success_or_demo_storage(self):
        self.database.container.create_item.side_effect = ServiceRequestError("unavailable")
        with self.assertLogs("app.database.cosmos_client", level="ERROR"):
            with self.assertRaises(DependencyUnavailable):
                self.database.save_workflow_state(WorkflowState(session_id="cosmos-session"))
        self.assertEqual(self.database.mock_db, {})

    def test_live_client_is_lazy_and_reused_without_provisioning(self):
        self.database.container = None
        with patch("app.database.cosmos_client.require_config", return_value=["https://example.documents.azure.com", "key"]), \
                patch("app.database.cosmos_client.CosmosClient") as client:
            first = self.database._get_container()
            second = self.database._get_container()
        self.assertIs(first, second)
        client.assert_called_once()
        client.return_value.create_database_if_not_exists.assert_not_called()


if __name__ == "__main__":
    unittest.main()
