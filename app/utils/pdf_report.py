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
from reportlab.graphics.shapes import Drawing, Rect
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepInFrame, PageBreakIfNotEmpty, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


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


def _assessment_reference(report, snapshot: dict):
    status = snapshot["status"]
    intel = snapshot.get("workflow_intelligence") or {}
    context = snapshot.get("enterprise_context") or {}
    score = snapshot.get("suitability_score") or {}
    report.heading("Report identity and assessment limitations")
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
        report.field("Descriptive workflow profile (not an agentic-opportunity verdict or delivery readiness)",
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

    report.heading("Agentic adoption assessment")
    report.details(score.get("adoption") or
                   "Not recorded in this historical assessment. Rerun analysis; no modern opportunity assessment is inferred from the old score.")

    report.heading("Governance and human oversight")
    report.details(snapshot.get("governance") or "No governance snapshot available.")
    report.heading("Business value and pilot measures")
    roi = snapshot.get("roi")
    if roi and roi.get("schema_version") == 2:
        report.paragraph(roi.get("estimate_basis", ""))
        report.paragraph(roi.get("assumptions", ""))
        if roi.get("status") != "deferred":
            for key, label in (
                ("hours_saved_per_year", "Capacity released (hours/year)"),
                ("fte_capacity", "FTE-years of capacity, not positions"),
                ("capacity_value_per_year", "Capacity value (USD/year), not cash savings"),
                ("annual_cash_savings", "Supplied cash savings (USD/year)"),
                ("annual_avoided_hiring_value", "Separate avoided-hiring value (USD/year)"),
                ("implementation_cost", "Total implementation cost (USD)"),
                ("annual_net_cash_benefit", "Net cash benefit (USD/year)"),
                ("first_year_balance", "First-year cash balance (USD)"),
                ("payback_months", "Cash payback (months)"),
            ):
                report.field(label, "Unknown" if roi.get(key) is None else roi[key])
            report.field("Service improvements (stakeholder input)", roi.get("service_improvements") or "Validate during the pilot.")
            report.field("Missing capacity inputs", ", ".join(roi.get("missing_inputs", [])) or "None")
            report.heading("Inputs and provenance", minor=True)
            report.details(roi.get("assumption_inputs"))
    else:
        report.paragraph("Business value not assessed or historical illustrative estimate. Rerun analysis; business value is deferred by default. Unknown costs are not zero.")

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

_INK = colors.HexColor("#172638")
_MUTED = colors.HexColor("#526174")
_PURPLE = colors.HexColor("#6550b8")
_LINE = colors.HexColor("#dce3ed")
_TONES = {
    "neutral": (colors.HexColor("#f3f5f9"), _INK),
    "accent": (colors.HexColor("#f2effa"), _PURPLE),
    "warning": (colors.HexColor("#fff6e6"), colors.HexColor("#805314")),
    "danger": (colors.HexColor("#fff0f1"), colors.HexColor("#a12c3c")),
}
_READINESS_LABELS = {
    "ready": "Recorded checks met", "ready_with_conditions": "Conditions to resolve",
    "blocked": "Blocked", "not_assessed": "Not assessed", "unknown": "Not assessed",
    "needs_validation": "Needs validation",
}
_OPPORTUNITY_LABELS = {
    "supported": "Supported by stated requirements", "potential": "Potential - validate first",
    "not_indicated": "Not established by current evidence",
}


def _excerpt(value, limit=380):
    text = _display(value)
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + " ... [see reference]"


class _AssessmentDocument(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        bookmark = getattr(flowable, "report_bookmark", None)
        if bookmark:
            self.canv.bookmarkPage(bookmark)
            self.canv.addOutlineEntry(flowable.getPlainText(), bookmark,
                                     level=getattr(flowable, "report_outline_level", 0), closed=False)


class _AssessmentReport(_Report):
    def __init__(self):
        super().__init__(_PURPLE)
        self.body = ParagraphStyle("AssessmentBody", parent=self.body, fontSize=10.2, leading=15,
                                   spaceAfter=8, textColor=_INK)
        self.small = ParagraphStyle("AssessmentSmall", parent=self.body, fontSize=8.2, leading=11.5,
                                    spaceAfter=4, textColor=_MUTED)
        self.title = ParagraphStyle("AssessmentTitle", parent=self.body, fontName="ReportVeraBold",
                                    fontSize=27, leading=33, spaceAfter=14)
        self.h1 = ParagraphStyle("AssessmentHeading", parent=self.body, fontName="ReportVeraBold",
                                 fontSize=19, leading=25, spaceBefore=8, spaceAfter=14, keepWithNext=True)
        self.h2 = ParagraphStyle("AssessmentSubheading", parent=self.body, fontName="ReportVeraBold",
                                 fontSize=11, leading=15, spaceBefore=10, spaceAfter=6, keepWithNext=True)
        self.kicker = ParagraphStyle("AssessmentKicker", parent=self.small, fontName="ReportVeraBold",
                                     fontSize=8, leading=11, textColor=_PURPLE, spaceAfter=8)
        self.metric = ParagraphStyle("AssessmentMetric", parent=self.body, fontName="ReportVeraBold",
                                     fontSize=19, leading=25, spaceAfter=5)
        self.reference = False
        self.reference_sections = 0
        self.width = _WIDTH - 12

    def heading(self, title, minor=False):
        style = self.h1 if self.reference and not minor else self.h2
        heading = Paragraph(_text(title), style)
        if self.reference and not minor:
            self.reference_sections += 1
            heading.report_bookmark = f"reference-{self.reference_sections}"
            heading.report_outline_level = 1
        self.story.append(heading)

    def start_reference(self):
        self.reference = True
        self.body = ParagraphStyle("ReferenceBody", parent=self.body, fontSize=8.5, leading=12,
                                   spaceAfter=3)
        self.h1 = ParagraphStyle("ReferenceHeading", parent=self.h1, fontSize=13, leading=18,
                                 spaceBefore=12, spaceAfter=6)
        self.h2 = ParagraphStyle("ReferenceSubheading", parent=self.h2, fontSize=9.2, leading=13,
                                 spaceBefore=7, spaceAfter=4)

    def chapter(self, number, title, *, first=False):
        if not first:
            while self.story and isinstance(self.story[-1], Spacer):
                self.story.pop()
            self.story.append(PageBreakIfNotEmpty())
        self.paragraph(f"{number} / AGENTSPARK ASSESSMENT", self.kicker)
        heading = Paragraph(_text(title), self.h1)
        heading.report_bookmark = f"chapter-{number}"
        self.story.append(heading)

    def bullets(self, items, *, limit=None):
        values = items[:limit] if limit else items
        for item in values:
            self.paragraph("- " + (_excerpt(item, 260) if limit else str(item)))
        if limit and len(items) > limit:
            self.paragraph(f"{len(items) - limit} additional items are retained in the reference section.", self.small)

    def panel(self, title, value, tone="neutral"):
        background, foreground = _TONES[tone]
        style = ParagraphStyle("PanelTitle", parent=self.h2, textColor=foreground, spaceBefore=0)
        content = [Paragraph(_text(title), style), Paragraph(_text(value), self.body)]
        panel = Table([[content]], colWidths=[self.width], hAlign="LEFT", splitByRow=1, splitInRow=1,
                      cornerRadii=[7, 7, 7, 7])
        panel.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), background),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 13), ("RIGHTPADDING", (0, 0), (-1, -1), 13),
            ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        self.story.extend([panel, Spacer(1, 10)])

    def metrics(self, items):
        width = (self.width - 20) / 3
        row = []
        for index, (label, value, meaning) in enumerate(items):
            if index:
                row.append("")
            row.append([Paragraph(_text(label), self.small), Paragraph(_text(value), self.metric),
                        Paragraph(_text(meaning), self.small)])
        table = Table([row], colWidths=[width, 10, width, 10, width], hAlign="LEFT",
                      splitByRow=1, splitInRow=1)
        style = [("VALIGN", (0, 0), (-1, -1), "TOP"),
                 ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                 ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]
        style.extend(("BACKGROUND", (column, 0), (column, 0), _TONES["neutral"][0]) for column in (0, 2, 4))
        table.setStyle(TableStyle(style))
        self.story.extend([table, Spacer(1, 12)])

    def table(self, rows, widths=None):
        columns = max(len(row) for row in rows)
        header = ParagraphStyle("AssessmentTableHeader", parent=self.small, fontName="ReportVeraBold",
                                textColor=colors.white, spaceAfter=0)
        cell = ParagraphStyle("AssessmentTableCell", parent=self.small, spaceAfter=0)
        cells = [[Paragraph(_text(value), header if index == 0 else cell) for value in row] +
                 [Paragraph("", self.small)] * (columns - len(row)) for index, row in enumerate(rows)]
        table = Table(cells, colWidths=widths or [self.width / columns] * columns, repeatRows=1,
                      splitByRow=1, splitInRow=1, hAlign="LEFT")
        padding = 3 if self.reference else 8
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), _INK),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, _LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), padding), ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
        ]))
        self.story.extend([table, Spacer(1, 10)])

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
                if isinstance(value, dict):
                    name = next((value[key] for key in ("title", "label", "field_id", "fact", "name", "id")
                                 if isinstance(value.get(key), str) and value[key]), f"Record {index}")
                    self.heading(name, minor=True)
                self.details(value)
        else:
            self.paragraph(data, self.small)

    def workflow_strip(self, *, agentic):
        labels = (("01 / INPUT", "Work arrives"), ("02 / SOFTWARE", "Collect and validate"),
                  ("03 / AI ASSIST", "Investigate or draft"), ("04 / HUMAN", "Review and authorize"),
                  ("05 / RECORD", "Store outcome and audit")) if agentic else (
                  ("01 / INPUT", "Work arrives"), ("02 / SOFTWARE", "Validate and apply rules"),
                  ("03 / HUMAN", "Review exceptions"), ("04 / RECORD", "Store outcome and audit"))
        cells = [[Paragraph(_text(title), self.kicker), Paragraph(_text(label), self.small)]
                 for title, label in labels]
        width = self.width / len(cells)
        table = Table([cells], colWidths=[width] * len(cells), hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), _TONES["accent"][0]),
            ("LINEAFTER", (0, 0), (-2, -1), 2, colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        self.story.extend([table, Spacer(1, 8)])
        self.paragraph("Proposed responsibility flow, not a verified map of every workflow step.", self.small)

    def profile(self, score):
        self.heading("Descriptive workflow profile")
        self.paragraph(f"{score['agent_score']}/100 ({score['classification']}). "
                       "This is not an agentic-opportunity verdict, ROI estimate or delivery-readiness score.", self.small)
        rows = []
        for criterion in score.get("criteria", []):
            chart = Drawing(170, 12)
            chart.add(Rect(0, 3, 170, 6, fillColor=_TONES["neutral"][0], strokeColor=None))
            chart.add(Rect(0, 3, 170 * max(0, min(1, criterion["raw"])), 6,
                           fillColor=_PURPLE, strokeColor=None))
            rows.append([Paragraph(_text(criterion["name"]), self.small), chart,
                         Paragraph(_text(f"{criterion['contribution']} / {criterion['weight']}"), self.small)])
        if rows:
            table = Table(rows, colWidths=[220, 180, self.width - 400], hAlign="LEFT")
            table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                       ("TOPPADDING", (0, 0), (-1, -1), 4),
                                       ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
            self.story.append(table)


def _report_number(value, *, money=False):
    if value is None:
        return "Unknown"
    return ("$" if money else "") + f"{value:,.2f}".removesuffix(".00")


def build_blueprint_pdf(snapshot: dict) -> bytes:
    report = _AssessmentReport()
    status = snapshot["status"]
    rejected = status == "rejected"
    intel = snapshot.get("workflow_intelligence") or {}
    score = snapshot.get("suitability_score") or {}
    adoption = score.get("adoption") or {}
    brief = snapshot.get("executive_brief") or {}
    readiness = snapshot.get("readiness_report") or {}
    pilot = readiness.get("pilot") or {}
    governance = snapshot.get("governance") or {}
    context = snapshot.get("enterprise_context") or {}
    runtime = snapshot.get("runtime_decision") or {}
    review = snapshot.get("human_review") or {}
    value = snapshot.get("roi") or {}
    report.chapter("01", "The decision at a glance", first=True)
    report.paragraph("AgentSpark Assessment Report", report.small)
    report.paragraph(intel.get("workflow_name") or context.get("business_domain") or "Workflow assessment", report.title)
    if intel.get("summary"):
        report.paragraph(_excerpt(intel["summary"], 340))
    report.panel(_STATUS[status],
                 "Advisory recommendation only. Approval does not authorize or execute a pilot, deployment or business action.",
                 "danger" if rejected else "accent" if status == "completed" else "warning")
    report.metrics([
        ("Reported daily work", f"{intel['volume_per_day']:,} / day" if intel.get("volume_per_day") is not None else "Unknown",
         "A reported baseline, not a forecast"),
        ("Connected systems", str(len(intel["systems"])) if "systems" in intel else "Unknown",
         "Integrations still need validation"),
        ("Human decision points", str(intel["decision_points"]) if intel.get("decision_points") is not None else "Unknown",
         "Per item, as reported"),
    ])
    report.heading("What should we do?")
    report.paragraph(brief.get("decision_label") or ("Do not proceed with this proposal" if rejected else
                     "Review the proposed candidate and resolve validation needs"), report.h2)
    rationale = (review.get("note") or governance.get("reason")) if rejected else (
        brief.get("rationale") or score.get("explanation"))
    report.paragraph(_excerpt(rationale or "No recorded decision rationale. Rerun analysis before relying on this assessment.", 440))
    if not rejected:
        report.panel("Agentic opportunity: " + _OPPORTUNITY_LABELS.get(adoption.get("opportunity"), "Not assessed in this historical report"),
                     adoption.get("design_label") or score.get("recommended_pattern") or "No recorded design candidate.",
                     "accent")
    report.heading("Your next move")
    report.paragraph(_excerpt(brief.get("next_action") or
                     "Review the evidence with the process owner. Confirm the reasoning need and pilot prerequisites before authorizing work.", 280))
    if snapshot.get("demo_scenario"):
        report.paragraph("Fictional demo fixture (not extracted customer facts): " + snapshot["demo_scenario"], report.small)
    report.paragraph(("READING GUIDE / Decision > Recorded rejection > Simpler alternative. " if rejected else
                      "READING GUIDE / Decision > How it works > Readiness > Value > Next steps. ") +
                     "The reference section retains full evidence, source quotes, assumptions and technical detail.", report.small)

    if not rejected:
        report.chapter("02", "How the work would change")
        report.paragraph(adoption.get("design_label") or score.get("recommended_pattern") or "Candidate not recorded.", report.h2)
        report.paragraph("AI is one part of the workflow, not a replacement for controls or accountability.")
        agentic = adoption.get("design_family") != "standard_software" if adoption else score.get("classification") != "Not Suitable"
        report.workflow_strip(agentic=agentic)
        report.heading("Where the work happens")
        report.paragraph(", ".join(intel.get("systems", [])) or "No integrations reported.")
        report.heading("Keep in ordinary software")
        report.bullets(adoption.get("deterministic_responsibilities") or
                       ["No responsibility split was recorded in this historical assessment; validate the architecture before implementation."], limit=3)
        report.heading("Proposed AI / agent responsibilities")
        report.bullets(adoption.get("proposed_agent_responsibilities") or
                       ["No agent responsibilities were recorded. Do not infer them from the profile score."], limit=3)
        report.panel("Who remains in control?",
                     _excerpt(" ".join(adoption.get("human_boundaries") or
                              ["Preserve recorded human approval and authorization requirements; this report grants no new authority."]), 400),
                     "warning")
        report.paragraph("Reasoning candidate: " + (runtime.get("reasoning") or {}).get("label", "Unresolved") +
                         ". Process continuity: " + (runtime.get("durable_execution") or {}).get("label", "Unresolved") +
                         ". These are different jobs; technical trade-offs and unresolved requirements are in the reference section.",
                         report.small)

    if not rejected:
        report.chapter("03", "What must be true before a pilot?")
        report.panel("Delivery readiness: " + _READINESS_LABELS.get(readiness.get("decision"), "Not assessed"),
                     readiness.get("rationale") or "No implementation-readiness snapshot is recorded. Do not infer readiness from approval or opportunity.",
                     "danger" if readiness.get("decision") == "blocked" else "neutral")
        checks = readiness.get("checks") or []
        if checks:
            report.table([["Readiness area", "Current position", "What is known / still needed"]] +
                         [[check["title"], _READINESS_LABELS.get(check["status"], _label(check["status"])),
                           _excerpt(check.get("finding") or check.get("next_action") or "No finding recorded.", 150)]
                          for check in checks], [145, 105, report.width - 250])
        else:
            report.paragraph("No recorded readiness checks. Access, data quality, privacy, oversight, cloud prerequisites and operations still need assessment.")
        report.heading("Priority next steps")
        actions = readiness.get("actions") or []
        for action in actions[:3]:
            priority = "Blocker (P0)" if action["priority"] == "P0" else "Next step (P1)"
            report.paragraph(f"{priority} / {_excerpt(action['action'], 170)}", report.h2)
            report.paragraph("Owner: " + (action.get("owner") or "Unassigned") +
                             " | Owner status: " + _label(action.get("owner_status", "unassigned")), report.small)
        if len(actions) > 3:
            report.paragraph(f"Showing 3 of {len(actions)} recorded actions. All actions, dependencies and completion criteria are in the reference section.", report.small)
        elif not actions:
            report.paragraph("No action list recorded. This does not establish that the workflow is ready.")
        report.panel("Approval and readiness are different",
                     ("Human review: " + _excerpt(review.get("note") or review.get("decision"), 220) if review else
                      "No human review is recorded. A policy outcome is not an independent reviewer attestation.") +
                     " Pilot execution still requires separate authorization.", "warning")
        report.chapter("04", "What value do we know today?")
        current_value = value.get("schema_version") == 2
        estimated = current_value and value.get("status") != "deferred"
        if not estimated:
            report.panel("Business value deferred" if current_value else "Business value not established",
                         "Early financial estimates are optional. Validate handling time, effort reduction and actual costs during a bounded pilot. Unknown costs are not zero.",
                         "accent")
        else:
            report.paragraph(value.get("estimate_basis") or "Estimate from supplied inputs; not measured business results.")
        report.metrics([
            ("Capacity released / year", _report_number(value.get("hours_saved_per_year")) + " h" if estimated and value.get("hours_saved_per_year") is not None else "Unknown",
             "Staff time released, not jobs removed"),
            ("Supplied cash savings / year", _report_number(value.get("annual_cash_savings"), money=True) if estimated else "Unknown",
             "Actual spending reduction, if supplied"),
            ("Cash payback", _report_number(value.get("payback_months")) + " months" if estimated and value.get("payback_months") is not None else "Unknown",
             "Requires known costs and positive net cash benefit"),
        ])
        report.panel("Capacity is not cash savings",
                     "Time released from salaried work creates capacity for other work. It becomes cash savings only when spending actually falls. Avoided hiring and service improvements are separate outcomes, not payroll savings.")
        if estimated:
            report.table([["Separate outcome / input", "Recorded estimate"]] + [
                [label, _report_number(value.get(key), money=True)] for key, label in (
                    ("capacity_value_per_year", "Capacity value / year (not cash savings)"),
                    ("annual_avoided_hiring_value", "Separate avoided-hiring value / year"),
                    ("implementation_cost", "Total implementation cost"),
                    ("annual_net_cash_benefit", "Net cash benefit / year"),
                    ("first_year_balance", "First-year cash balance"))], [320, report.width - 320])
        report.heading("Measure outcomes people can recognize")
        report.paragraph(_excerpt(pilot.get("success_metrics") or value.get("service_improvements") or
                         "Agree baseline and acceptance thresholds for correct outcomes, human review effort, elapsed resolution time, cost and safe escalation. No improvement is assumed.", 600))
        report.paragraph("Input sources, role-level effort, assumptions and missing values are retained in the reference section.", report.small)

        report.chapter("05", "Start small. Earn the right to expand.")
        report.panel("Proposed pilot scope - not authorization",
                     _excerpt(pilot.get("scope") or adoption.get("pilot_scope") or
                              "No pilot scope recorded. Agree the cases, data and boundaries with the process owner.", 500), "accent")
        report.heading("1 / Set the baseline and answer the open questions")
        report.paragraph(_excerpt(adoption.get("current_approach") or
                         "Compare the proposed approach against a simpler, human-controlled baseline.", 300))
        report.bullets(adoption.get("questions") or ["No adoption questions recorded; review the full validation checklist."], limit=3)
        report.heading("2 / Agree what success looks like before testing")
        if pilot.get("success_metrics"):
            report.paragraph("Recorded success targets: " + _excerpt(pilot["success_metrics"], 260))
        report.bullets(adoption.get("success_criteria") or
                       ["Define measurable acceptance thresholds before a pilot."], limit=2 if pilot.get("success_metrics") else 3)
        report.heading("3 / Stop when safety or quality fails")
        stops = adoption.get("stop_conditions") or ["Define failure, escalation and rollback conditions before a pilot."]
        if pilot.get("failure_handling"):
            stops = ["Recorded failure plan: " + pilot["failure_handling"], *stops]
        report.bullets(stops, limit=2)
        report.heading("4 / Expand only after evidence and explicit approval")
        if pilot.get("authorization_boundaries"):
            report.paragraph("Recorded authorization boundary: " + _excerpt(pilot["authorization_boundaries"], 260))
        report.bullets(adoption.get("expansion_conditions") or
                       ["Resolve readiness gaps and seek explicit authorization before increasing scope or permissions."], limit=2)
    else:
        report.chapter("02", "Why this proposal stopped")
        report.panel("Recorded rejection",
                     review.get("note") or governance.get("reason") or "A rejection was recorded.", "danger")
        report.panel("Consider a non-agentic alternative",
                     snapshot.get("alternative") or "Assess a deterministic, human-controlled alternative.", "warning")
        report.heading("What happens next?")
        report.paragraph("Resolve the recorded rejection reasons or assess a simpler alternative. "
                         "Changing a readiness check does not reverse this rejection or authorize a pilot.")
        report.paragraph("The reference section retains the original assessment evidence and readiness context. "
                         "Implementation architecture and code are intentionally excluded.", report.small)

    report.chapter("A", "Reference / Evidence and technical detail")
    report.paragraph("The decision story above is a reading aid, not a replacement for the source record. "
                     "This section retains recorded facts, quotes, assumptions, validation gaps and implementation detail. "
                     "Statements and linked references are not independent verification.")
    if score:
        report.profile(score)
    report.heading("A short guide to technical terms")
    report.table([["Term", "Plain-language meaning"],
                  ["Human-in-the-loop (HITL)", "A person must review or authorize the specified decisions or actions."],
                  ["Agent / reasoning layer", "A bounded AI component that may choose follow-up steps or permitted tools."],
                  ["Durable execution", "Tracking work across interruptions or long waits; not proof of exactly-once business effects."],
                  ["Grounding / provenance", "The recorded source behind a statement; a citation does not prove that the statement is correct."]],
                 [155, report.width - 155])
    report.start_reference()
    _assessment_reference(report, snapshot)
    output = BytesIO()
    document = _AssessmentDocument(output, pagesize=A4, leftMargin=42, rightMargin=42,
                                  topMargin=59, bottomMargin=48, pageCompression=1,
                                  title="AgentSpark Assessment Report", author="AgentSpark")

    def page_footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(_PURPLE)
        canvas.rect(0, A4[1] - 5, A4[0], 5, fill=1, stroke=0)
        canvas.setFillColor(_INK)
        canvas.setFont("ReportVeraBold", 10)
        canvas.drawString(42, A4[1] - 30, "AgentSpark")
        canvas.setFont("ReportVera", 6.8)
        canvas.setFillColor(_MUTED)
        canvas.drawRightString(A4[0] - 42, A4[1] - 30, _STATUS[status])
        canvas.setStrokeColor(_LINE)
        canvas.line(42, 40, A4[0] - 42, 40)
        canvas.setFont("ReportVera", 7)
        canvas.drawString(42, 26, f"Analysis: {snapshot['analysis_id']}")
        canvas.drawRightString(A4[0] - 42, 26, f"Page {doc.page}")
        canvas.restoreState()

    document.build(report.story, onFirstPage=page_footer, onLaterPages=page_footer)
    return output.getvalue()
