"""In-memory PDF reports from the same redacted snapshot returned by the Blueprint API."""
from datetime import datetime, timezone
from html import escape
from io import BytesIO
import json
from pathlib import Path
import re

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepInFrame, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


_FONT_DIRECTORY = Path(reportlab.__file__).parent / "fonts"
pdfmetrics.registerFont(TTFont("ReportVera", str(_FONT_DIRECTORY / "Vera.ttf")))
pdfmetrics.registerFont(TTFont("ReportVeraBold", str(_FONT_DIRECTORY / "VeraBd.ttf")))
pdfmetrics.registerFontFamily("ReportVera", normal="ReportVera", bold="ReportVeraBold",
                             italic="ReportVera", boldItalic="ReportVeraBold")
_GLYPHS = pdfmetrics.getFont("ReportVera").face.charToGlyph
_TEAL = colors.HexColor("#0f766e")
_WIDTH = A4[0] - 84
_STATUS = {
    "awaiting_human_review": "PROVISIONAL - NOT APPROVED",
    "completed": "ADVISORY RECOMMENDATION APPROVED",
    "rejected": "REJECTED RECOMMENDATION",
}


def _display(value) -> str:
    if value is None:
        return "Not supplied"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _text(value) -> str:
    # Never feed user/model HTML, links or image directives to ReportLab's XML parser.
    text = "".join(character if character in "\n\t" or _GLYPHS.get(ord(character))
                   else f"[U+{ord(character):04X}]" for character in _display(value))
    return escape(text, quote=False).replace("\t", "    ").replace("\n", "<br/>")


def _label(key: str) -> str:
    return key.replace("_", " ").capitalize()


class _Report:
    def __init__(self, accent=_TEAL):
        self.story = []
        base = {"fontName": "ReportVera", "fontSize": 9, "leading": 13, "spaceAfter": 5,
                "alignment": TA_LEFT, "splitLongWords": True}
        self.body = ParagraphStyle("ReportBody", **base)
        self.title = ParagraphStyle("ReportTitle", parent=self.body, fontName="ReportVeraBold",
                                    fontSize=21, leading=27, textColor=accent, spaceAfter=12)
        self.h1 = ParagraphStyle("ReportHeading", parent=self.body, fontName="ReportVeraBold",
                                 fontSize=13, leading=18, spaceBefore=14, spaceAfter=8, keepWithNext=True,
                                 textColor=accent)
        self.h2 = ParagraphStyle("ReportSubheading", parent=self.body, fontName="ReportVeraBold",
                                 fontSize=10, leading=14, spaceBefore=8, keepWithNext=True)
        self.small = ParagraphStyle("ReportSmall", parent=self.body, fontSize=8, leading=11)

    def paragraph(self, value, style=None):
        self.story.append(Paragraph(_text(value), style or self.body))

    def field(self, label, value):
        self.story.append(Paragraph(f"<b>{_text(label)}:</b> {_text(value)}", self.body))

    def heading(self, title, minor=False):
        self.paragraph(title, self.h2 if minor else self.h1)

    def details(self, data):
        if isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, (dict, list)) and value:
                    self.heading(_label(key), minor=True)
                    self.details(value)
                else:
                    self.field(_label(key), "None supplied" if value == [] or value == {} else value)
        elif isinstance(data, list):
            for index, value in enumerate(data, 1):
                if isinstance(value, (dict, list)):
                    self.heading(f"Item {index}", minor=True)
                    self.details(value)
                else:
                    self.paragraph(f"- {_display(value)}")
        else:
            self.paragraph(data)

    def table(self, rows):
        columns = max(len(row) for row in rows)
        cells = [[Paragraph(_text(value), self.small) for value in row] +
                 [Paragraph("", self.small)] * (columns - len(row)) for row in rows]
        table = Table(cells, colWidths=[_WIDTH / columns] * columns, repeatRows=1,
                      splitByRow=1, splitInRow=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6f4f1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        self.story.extend([table, Spacer(1, 8)])

    def markdown(self, text):
        """Render local text only: headings, lists, fenced code and pipe tables; no HTML/media."""
        table = []
        in_code = False
        for line in str(text or "").splitlines():
            if line.strip().startswith("```"):
                if table:
                    self.table(table)
                    table = []
                in_code = not in_code
                continue
            if not in_code and line.strip().startswith("|"):
                cells = [cell.strip().replace(r"\|", "|")
                         for cell in re.split(r"(?<!\\)\|", line.strip().strip("|"))]
                if not all(re.fullmatch(r":?-+:?", cell) for cell in cells):
                    table.append(cells)
                continue
            if table:
                self.table(table)
                table = []
            heading = re.match(r"^(#{1,6})\s+(.+)", line) if not in_code else None
            if heading:
                self.heading(heading[2], minor=len(heading[1]) > 2)
            elif line:
                if in_code:
                    self.story.append(Paragraph(_text(line).replace(" ", "&#160;"), self.small))
                else:
                    markup = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", _text(line))
                    self.story.append(Paragraph(markup, self.body))
            else:
                self.story.append(Spacer(1, 4))
        if table:
            self.table(table)


def build_discovery_findings_pdf(snapshot: dict) -> bytes:
    report = _Report(accent=colors.HexColor("#6d28d9"))
    report.paragraph("AgentSpark Discovery Findings", report.title)
    report.paragraph("DISCUSSION DOCUMENT - NOT IMPLEMENTATION APPROVAL", report.h2)
    report.paragraph(snapshot["limitations"])
    report.heading("Engagement scope and discussion guide")
    report.details(snapshot["scope"])
    report.heading("Participation and outstanding requests")
    report.details({"participation": snapshot["participation"], "requests": snapshot["requests"]})
    report.heading("Activity checks and evidence gaps")
    report.details(snapshot["overview"])
    report.heading("Source-linked findings")
    report.field("Synthesis status", snapshot["synthesis_status"])
    if snapshot["synthesis"]:
        report.details(snapshot["synthesis"])
    else:
        report.paragraph("No current generated findings are included. Sources and human conclusions remain available below.")
    report.heading("Candidate shortlist and alternatives")
    report.details(snapshot["opportunities"] or "No candidates recorded; AI is not a required outcome.")
    report.details(snapshot["prioritization"])
    report.heading("Human conclusion and proposed next actions")
    report.details(snapshot["conclusion"])
    report.details(snapshot["overview"]["next_actions"])
    report.heading("Source register - submitted claims, not automatic verification")
    report.details(snapshot["sources"] or "No sources recorded.")
    report.heading("Attributed review history")
    report.paragraph("Source register statuses describe current reviews. Historical review digests may no longer match edited sources.")
    report.details(snapshot["source_reviews"] or "No source reviews recorded.")
    report.heading("Snapshot provenance")
    for key in ("report_version", "engagement_id", "source_version", "source_digest", "generated_at", "expires_at"):
        report.field(_label(key), snapshot[key])
    output = BytesIO()
    SimpleDocTemplate(output, pagesize=A4, leftMargin=42, rightMargin=42, topMargin=42, bottomMargin=42,
                      title="AgentSpark Discovery Findings").build(report.story)
    return output.getvalue()


def build_executive_brief_pdf(brief: dict) -> bytes:
    report = _Report()

    def excerpt(text, limit=280):
        value = str(text)
        return value if len(value) <= limit else value[:limit].rsplit(" ", 1)[0] + " [excerpt; see full assessment]"

    report.paragraph("AgentSpark Executive Decision Brief", report.title)
    report.field("Workflow", brief["workflow_name"])
    report.field("Analysis ID", brief.get("analysis_id") or "Incomplete assessment")
    report.field("Brief version", brief["version"])
    report.field("Advisory status", brief["approval_status"])
    report.field("Recommended decision", brief["decision_label"])
    report.paragraph(excerpt(brief["rationale"]))
    for claim in brief["claims"]:
        if claim["label"] != "Recommended decision":
            report.field(claim["label"], excerpt(claim["statement"]) + " [" + ", ".join(claim["source_ids"]) + "]")
    report.heading("Priority gaps")
    for gap in brief["risks_and_gaps"][:4]:
        report.paragraph("- " + excerpt(gap, 140))
    if len(brief["risks_and_gaps"]) > 4:
        report.paragraph("Additional gaps are listed in the full assessment.")
    report.field("Next action", excerpt(brief["next_action"]))
    report.heading("Source excerpts - full provenance in the assessment")
    for source in brief["sources"]:
        report.field(source["id"], excerpt(source["basis"], 220))
    report.paragraph(brief["limitations"], report.small)
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, leftMargin=42, rightMargin=42, topMargin=42, bottomMargin=42,
                                 title="AgentSpark Executive Decision Brief")
    document.build([KeepInFrame(_WIDTH - 12, A4[1] - 100, report.story, mode="shrink")])
    return output.getvalue()


def build_blueprint_pdf(snapshot: dict) -> bytes:
    report = _Report()
    status = snapshot["status"]
    intel = snapshot.get("workflow_intelligence") or {}
    context = snapshot.get("enterprise_context") or {}
    score = snapshot.get("suitability_score") or {}
    report.paragraph("AgentSpark Assessment Report", report.title)
    report.heading(intel.get("workflow_name") or context.get("business_domain") or "Workflow assessment", minor=True)
    report.paragraph(_STATUS[status], report.h2)
    report.field("Analysis ID", snapshot["analysis_id"])
    if snapshot.get("discovery_origin"):
        report.heading("Discovery origin - unverified source snapshot")
        report.details(snapshot["discovery_origin"])
    if snapshot.get("document_intake"):
        report.heading("Document context - human-reviewed, not independently verified")
        report.paragraph("Original files are not retained. Excerpts and upload fingerprints are reviewer-provided claims, not attestation or implementation evidence.")
        report.details(snapshot["document_intake"])
    report.field("Generated at (UTC)", datetime.now(timezone.utc).isoformat())
    if snapshot.get("executive_brief"):
        report.heading("Executive decision brief")
        report.details(snapshot["executive_brief"])
    model = snapshot.get("inference_model")
    report.field("Assessment inference model",
                 f"{model['provider']} / {model['model']} / deployment {model['deployment']} / "
                 f"version {model.get('version') or 'not supplied'}" if model else
                 "Not recorded in this historical assessment.")
    report.paragraph("Advisory recommendation only. Approval does not authorize or execute a pilot, deployment or business action.")
    report.paragraph(snapshot.get("assessment_limitations") or
                     "Cloud availability, model access, residency and prices require validation. AgentSpark remains Azure-hosted.")
    if snapshot.get("demo_scenario"):
        report.field("Fictional demo fixture (not extracted customer facts)", snapshot["demo_scenario"])

    report.heading("Decision and reviewer attestation")
    review = snapshot.get("human_review")
    if review:
        report.details(review)
    else:
        report.paragraph("No human review recorded. Any approval is a policy outcome, not an independent reviewer attestation.")
    report.heading("Assessment deployment target")
    for key in ("target_cloud", "preferred_region", "data_residency_requirements", "deployment_constraints"):
        report.field(_label(key) + (" (unverified)" if key == "preferred_region" else ""),
                     context.get(key) or "Not specified")
    report.heading("Selected cloud service candidates", minor=True)
    report.details(snapshot.get("cloud_mapping") or "No service mapping available.")

    report.heading("Workflow and agent suitability")
    report.details(intel or "No workflow intelligence available.")
    if score:
        report.field("Agent suitability (not delivery readiness)",
                     f"{score['agent_score']}/100 ({score['classification']})")
        for key in ("recommended_pattern", "autonomy_level", "requires_hitl", "explanation"):
            report.field(_label(key), score.get(key))
        if score.get("criteria"):
            report.table([["Criterion", "Normalized signal", "Weight", "Points"]] +
                         [[item["name"], item["raw"], item["weight"], item["contribution"]]
                          for item in score["criteria"]])
            for item in score["criteria"]:
                report.field(item["name"], item.get("rationale", ""))
    else:
        report.paragraph("No agent-suitability score available.")

    report.heading("Governance and human oversight")
    report.details(snapshot.get("governance") or "No governance snapshot available.")
    report.heading("ROI assumptions and sensitivity")
    roi = snapshot.get("roi")
    if roi and isinstance(roi.get("scenarios"), list):
        report.paragraph(roi.get("estimate_basis", ""))
        report.paragraph(roi.get("assumptions", ""))
        report.field("One-time build estimate (USD)", roi.get("implementation_cost"))
        report.field("Operating costs included", roi.get("operating_costs_included"))
        report.table([["Scenario", "Gross labor USD/year", "Net USD/year", "Hours/year", "Payback months", "Annual savings/build"]] +
                     [[item["name"], item["cost_saved_per_year"],
                       "Unknown" if item["annual_net_savings"] is None else item["annual_net_savings"],
                       item["hours_saved_per_year"],
                       "N/A" if item["payback_months"] is None else item["payback_months"],
                       "N/A" if item["roi_multiple"] is None else item["roi_multiple"]]
                      for item in roi["scenarios"]])
        report.heading("Assumption inputs", minor=True)
        report.details(roi.get("assumption_inputs") or "Legacy assumptions unavailable; rerun analysis.")
    else:
        report.paragraph("No auditable ROI scenarios available. Historical estimates require reanalysis; unknown costs are not zero.")

    report.heading("Evidence register, findings and outstanding validation")
    report.details(snapshot.get("evidence_report") or "No evidence-register snapshot in this historical assessment.")
    report.heading("Implementation Readiness Report")
    readiness = snapshot.get("readiness_report")
    if readiness:
        report.field("Delivery readiness decision", _label(readiness["decision"]))
    report.details(readiness or "No implementation-readiness snapshot in this historical assessment.")
    report.heading("Diagnostic inputs and provenance")
    report.details(snapshot.get("diagnosis") or "No diagnostic provenance available.")
    report.heading("Architecture Runtime Decision")
    report.details(snapshot.get("runtime_decision") or "Runtime selection not assessed. Rerun analysis after capturing runtime requirements.")
    report.heading("Grounded pattern sources")
    patterns = snapshot.get("retrieved_patterns") or []
    if not patterns:
        report.paragraph("No retained pattern sources available.")
    for pattern in patterns:
        report.heading(f"{pattern.get('id', '')}: {pattern.get('name', '')}", minor=True)
        report.field("Source", pattern.get("source_ref") or "Legacy source unavailable; rerun analysis.")
        report.field("SHA256", pattern.get("content_sha256") or "Not recorded")
    if status == "rejected":
        report.heading("Rejection and non-agentic alternative")
        report.field("Reason", (review or {}).get("note") or (snapshot.get("governance") or {}).get("reason"))
        report.paragraph(snapshot.get("alternative") or "Use a deterministic, human-controlled alternative.")
    else:
        for title, key in (("Architecture", "architecture_doc"), ("Cost estimate", "cost_estimate"), ("Roadmap", "roadmap")):
            report.heading(title)
            report.markdown(snapshot.get(key) or "Not supplied.")
        report.heading("Mermaid diagram source")
        report.paragraph("Text source only; the PDF does not execute or render Mermaid diagrams.")
        report.markdown("```mermaid\n" + (snapshot.get("mermaid_diagram") or "Not supplied") + "\n```")
        report.heading("Illustrative, untested scaffold - not deployment-ready")
        report.markdown("```python\n" + (snapshot.get("code_scaffold") or "Not supplied") + "\n```")

    report.paragraph("Formatting note: unsupported font glyphs are represented as [U+XXXX] Unicode code points. "
                     "HTML and remote media are shown as text and are never loaded.", report.small)
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, leftMargin=42, rightMargin=42,
                                 topMargin=54, bottomMargin=46, pageCompression=1,
                                 title="AgentSpark Assessment Report", author="AgentSpark")

    def page_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("ReportVera", 7)
        canvas.setFillColor(_TEAL)
        canvas.drawString(42, A4[1] - 28, "AgentSpark | Advisory assessment")
        canvas.drawRightString(A4[0] - 42, A4[1] - 28, _STATUS[status])
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawString(42, 27, f"Analysis: {snapshot['analysis_id']}")
        canvas.drawRightString(A4[0] - 42, 27, f"Page {doc.page}")
        canvas.restoreState()

    document.build(report.story, onFirstPage=page_footer, onLaterPages=page_footer)
    return output.getvalue()
