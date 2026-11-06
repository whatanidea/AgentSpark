import unittest
from pydantic import ValidationError

from app.agents.blueprint_agent import _demo_view
from app.agents.demo_scenarios import DEMO_SCENARIOS
from app.scoring.scoring_engine import scoring_engine
from app.utils.blueprint_view import ArchitectureView, narrative_text


class BlueprintViewTests(unittest.TestCase):
    def setUp(self):
        intel = DEMO_SCENARIOS["invoice"]
        self.view = _demo_view(intel, scoring_engine.evaluate(intel), {
            "compute": "Azure Container Apps", "database": "Azure Cosmos DB"}, "azure").model_dump()

    def test_bounded_connected_overview_rejects_invalid_shapes(self):
        for change in ("long_title", "too_many_steps", "disconnected", "unknown_component", "duplicate_choice", "duplicate_component"):
            data = ArchitectureView.model_validate(self.view).model_dump()
            if change == "long_title":
                data["flow"][0]["title"] = "x" * 71
            elif change == "too_many_steps":
                data["flow"] *= 2
            elif change == "disconnected":
                data["flow"][1]["receives"] = "Unrelated work"
            elif change == "unknown_component":
                data["flow"][0]["components"] = ["arbitrary_service"]
            elif change == "duplicate_component":
                data["flow"][0]["components"] = ["compute", "compute"]
            else:
                data["choices"][1]["component"] = "compute"
            with self.subTest(change=change), self.assertRaises(ValidationError):
                ArchitectureView.model_validate(data)

    def test_generated_narrative_breaks_do_not_rewrite_windows_paths(self):
        self.assertEqual(narrative_text(r"Overview\n\n## Recovery\n- Retry safely"), "Overview\n\n## Recovery\n- Retry safely")
        self.assertEqual(narrative_text(r"C:\new\notes.py"), r"C:\new\notes.py")
        self.assertEqual(narrative_text("Real\n\nparagraphs"), "Real\n\nparagraphs")
