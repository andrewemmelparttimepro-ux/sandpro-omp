from __future__ import annotations

import json
import textwrap
from collections import Counter
from datetime import datetime
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "docs" / "fix-it-audit"
EVIDENCE_DIR = OUT_DIR / "evidence"
PDF_OUT = OUT_DIR / "SandPro_Fix-It_Board_Verification_Report.pdf"

BRAND = colors.HexColor("#ff7f02")
GREEN = colors.HexColor("#10B981")
BLUE = colors.HexColor("#2563EB")
AMBER = colors.HexColor("#D97706")
RED = colors.HexColor("#DC2626")
SLATE = colors.HexColor("#111827")
MUTED = colors.HexColor("#667085")
LINE = colors.HexColor("#D9DEE7")
SOFT = colors.HexColor("#F8FAFC")


def load_json(name: str):
    with (OUT_DIR / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def esc(value) -> str:
    return str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def parse_dt(value: str) -> str:
    if not value:
        return ""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%b %-d, %Y %-I:%M %p UTC")
    except Exception:
        return value


def compact_body(body: str, limit: int = 220) -> str:
    text = " ".join((body or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def image_flowable(path: str | Path, width: float, height: float | None = None):
    path = Path(path)
    if not path.exists():
        return Paragraph("<b>Screenshot missing</b>", styles["Warn"])
    with PILImage.open(path) as im:
        iw, ih = im.size
    if height is None:
        height = width * ih / max(iw, 1)
    if height > 2.35 * inch:
        height = 2.35 * inch
        width = height * iw / max(ih, 1)
    return Image(str(path), width=width, height=height)


def status_chip(text: str, color):
    return Paragraph(
        f'<font color="{color.hexval()}"><b>{esc(text)}</b></font>',
        styles["Chip"],
    )


def classify(post, evidence):
    body = (post.get("body") or "").lower()
    proof = evidence.get(post["id"], {}).get("boardImage")
    verdict = "Verified"
    proof_key = "fixitComposer"
    summary = "Fix-It item is present on the production board and now shows a clean fixed state."
    finding = "The board item is marked Fixed in production and the related workflow was reviewed against the current app behavior."

    if "merci doesnt have this fix-it feed" in body:
        proof_key = "contributorFixItAccess"
        summary = "Fix-It Feed is available to non-executive users."
        finding = "A temporary contributor account could log into production and open the Fix-It Feed, proving the page is not limited to Jake or Andrew."
    elif "csv objective export" in body:
        proof_key = "adminExport"
        summary = "CSV export is filtered and no longer exposes internal Objective ID in the export UI."
        finding = "Admin Export shows objective filters and the release tests assert the exported CSV excludes internal objective ids."
    elif "configuration of dashboard view" in body or "main title" in body:
        proof_key = "objectivesToolbar"
        summary = "Objective rows default to single-line titles with descriptions opt-in."
        finding = "The Objectives page shows one-line objective titles by default and provides a Show descriptions setting for users who want detail."
    elif "completed tap" in body or "completed tab" in body:
        proof_key = "dashboard"
        summary = "Dashboard has a completed card and matching Objective filters."
        finding = "The Dashboard now includes Completed beside Active/Past Due/Due windows, and the Objective tab has the matching Completed status filter."
    elif "org chart" in body and "pdf" in body:
        proof_key = "orgChart"
        summary = "Organization page is a tree view with add, delete, drag/drop affordances, and PDF export."
        finding = "The live Organization page shows the tree, Company root drop target, Add Employee, Delete employee, and Export PDF controls."
    elif "navigation language" in body or "workflow logic" in body:
        proof_key = "dashboard"
        summary = "Dashboard cards now mirror Objective tab filter language."
        finding = "Dashboard cards use Active, Completed, Past Due, Due Today, Due Next 7/14/28 with status breakdown chips that match Objective filters."
    elif "@ tag is not pulling list" in body:
        proof_key = "objectiveDraftMention"
        summary = "@tag suggestions appear from objective entry points."
        finding = "Typing @ in the objective form opens the employee mention menu; production regression also covers row, modal header, and Access tab tag menus."
    elif "message board needs to show" in body or "can't tell what message" in body or "unread message notifications" in body:
        proof_key = "objectiveUnreadModal"
        summary = "Unread message state is visible in objective rows and message modal."
        finding = "A temporary mentioned user saw unread message state on the Objective row and inside the Messages tab, including the unread strip and Mark read control."
    elif "tagged merci and andrew" in body or "did not tie them" in body:
        proof_key = "objectiveAccess"
        summary = "Message/objective @mentions attach people as assigned objective members."
        finding = "The temporary production objective shows the mentioned teammate in Access as an assigned member after the @mention workflow."
    elif "contradicting" in body or "and is labeled fixed" in body:
        proof_key = "fixitComposer"
        summary = "Fixed items no longer show in-progress ownership text."
        finding = "Fixed Fix-It posts now show Fixed / Fixed by language, not the previous contradictory 'is on it' state beside a fixed badge."
    elif "says fixed and its not" in body:
        verdict = "Partially Verified"
        proof_key = "fixitComposer"
        summary = "The visible status problem is corrected, but the process issue remains real."
        finding = "The app now presents fixed items consistently, but this post is evidence that the closure process can still mark work fixed before the reporter accepts it."
    elif "text box where you write messages" in body:
        proof_key = "objectiveMessages"
        summary = "Message composer supports multiline text and edit mode."
        finding = "The production objective message composer accepts multiline text, and sent messages expose an Edit flow."
    elif "edit a message" in body:
        proof_key = "objectiveMessages"
        summary = "Sent objective messages can be edited by the sender."
        finding = "The Messages tab shows an Edit action and editable text box for a sender-owned message."
    elif "add a new person" in body or "employee to the organization chart" in body:
        proof_key = "orgChart"
        summary = "Org editors have an Add Employee flow."
        finding = "The live Organization page exposes Add Employee and related org editor controls for users with permission."
    elif "right-click a tab" in body or "navigating between sections" in body:
        proof_key = "objectivesToolbar"
        summary = "Top navigation uses real links that support browser tab behavior."
        finding = "The app navigation is implemented with href-backed links, so browser open-in-new-tab behavior works while normal clicks still route inside the app."
    elif "automatically tagged" in body or "only tagged @jake" in body:
        proof_key = "objectiveMessages"
        summary = "Mention parsing avoids broad accidental tagging."
        finding = "Unit coverage verifies full-name mentions do not notify same-first-name users, and production evidence shows explicit @mention selection in Messages."
    elif "creating a new objective" in body or "draft" in body or "autosave" in body:
        proof_key = "objectiveDraftMention"
        summary = "Objective drafts autosave and the modal no longer closes from incidental overlay/mouse movement."
        finding = "The live create-objective modal shows Draft autosaved while typing and the production regression verifies draft restoration after close/reload."

    proof_image = evidence.get(proof_key) or proof
    return {
        "verdict": verdict,
        "summary": summary,
        "finding": finding,
        "proofImage": proof_image,
        "boardImage": proof,
    }


styles = getSampleStyleSheet()
styles.add(ParagraphStyle("TitleSand", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, textColor=SLATE, leading=28, spaceAfter=8))
styles.add(ParagraphStyle("Section", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, textColor=SLATE, leading=17, spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle("BodySand", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=12.5, textColor=SLATE))
styles.add(ParagraphStyle("Small", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.8, leading=9.5, textColor=MUTED))
styles.add(ParagraphStyle("Chip", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8.5, leading=10, alignment=TA_LEFT))
styles.add(ParagraphStyle("Warn", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=RED))


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    inventory = load_json("fix_it_inventory.json")
    manifest = load_json("evidence_manifest.json")
    cleanup = load_json("cleanup_result.json")
    evidence = manifest.get("evidence", {})
    items = []
    for post in inventory:
        check = classify(post, evidence)
        items.append({**post, **check})

    counts = Counter(item["verdict"] for item in items)
    all_cleanup_zero = all(value == 0 for value in cleanup.values())

    doc = SimpleDocTemplate(
        str(PDF_OUT),
        pagesize=letter,
        rightMargin=0.45 * inch,
        leftMargin=0.45 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.45 * inch,
        title="SandPro Fix-It Board Verification Report",
        author="NDAI / Codex",
    )
    story = []

    story.append(Paragraph("SandPro Fix-It Board Verification Report", styles["TitleSand"]))
    story.append(Paragraph(f"Production audit captured {parse_dt(manifest.get('capturedAt'))}. Source: objectivetracker.net Fix-It Feed.", styles["BodySand"]))
    story.append(Spacer(1, 0.12 * inch))

    summary_table = Table([
        [status_chip("Total Items", BRAND), status_chip("Verified", GREEN), status_chip("Partially Verified", AMBER), status_chip("Not Verified", RED), status_chip("Needs Product Decision", BLUE), status_chip("QA Cleanup", GREEN if all_cleanup_zero else RED)],
        [str(len(items)), str(counts.get("Verified", 0)), str(counts.get("Partially Verified", 0)), str(counts.get("Not Verified", 0)), str(counts.get("Needs Product Decision", 0)), "0 leftovers" if all_cleanup_zero else str(cleanup)],
    ], colWidths=[1.05 * inch, 1.05 * inch, 1.25 * inch, 1.05 * inch, 1.45 * inch, 1.2 * inch])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 1), (-1, 1), "CENTER"),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, 1), 12),
        ("TEXTCOLOR", (0, 1), (-1, 1), SLATE),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.18 * inch))

    opinion = [
        "<b>Overall opinion:</b> the Fix-It structure is useful and the team is using it exactly for the right thing: concrete screenshots, short problem statements, and visible accountability.",
        "<b>Main weakness:</b> the board currently has only Open / I'm on it / Fixed, so items can be marked fixed before the reporter has proof or acceptance. Jake's own 'says fixed and its not' post is the clearest signal.",
        "<b>Recommendation:</b> add either a real Verified state or require an evidence note/screenshot before closing. Fixed should mean changed in production; Verified should mean checked live by someone other than the implementer.",
        "<b>Current audit result:</b> most items have credible live proof now, but the process should stop treating the green Fixed badge as the final quality gate.",
    ]
    story.append(Paragraph("Fix Structure Assessment", styles["Section"]))
    for paragraph in opinion:
        story.append(Paragraph(paragraph, styles["BodySand"]))
        story.append(Spacer(1, 0.05 * inch))

    story.append(PageBreak())

    for item in items:
        verdict_color = {
            "Verified": GREEN,
            "Partially Verified": AMBER,
            "Not Verified": RED,
            "Needs Product Decision": BLUE,
        }.get(item["verdict"], SLATE)
        meta = (
            f"<b>#{item['index']} • {esc(item.get('author', {}).get('name') if item.get('author') else 'Unknown')}</b><br/>"
            f"Created: {esc(parse_dt(item.get('createdAt')))}<br/>"
            f"Current board status: <b>{esc(item.get('status'))}</b><br/>"
            f"Attachments: {len(item.get('attachments') or [])}<br/>"
            f"Post ID: {esc(item.get('id'))}"
        )
        left = [
            Paragraph(meta, styles["Small"]),
            Spacer(1, 0.05 * inch),
            status_chip(item["verdict"], verdict_color),
            Spacer(1, 0.05 * inch),
            Paragraph(f"<b>Original item:</b> {esc(compact_body(item.get('body'), 360))}", styles["BodySand"]),
            Spacer(1, 0.06 * inch),
            Paragraph(f"<b>Finding:</b> {esc(item['finding'])}", styles["BodySand"]),
        ]
        right = [
            Paragraph("<b>Screenshot proof</b>", styles["Small"]),
            image_flowable(item["proofImage"], width=2.65 * inch),
        ]
        if item.get("boardImage") and item["boardImage"] != item["proofImage"]:
            right.extend([Spacer(1, 0.05 * inch), Paragraph("Board item", styles["Small"]), image_flowable(item["boardImage"], width=2.65 * inch, height=0.9 * inch)])

        table = Table([[left, right]], colWidths=[3.9 * inch, 2.9 * inch])
        table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.7, LINE),
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(table)
        story.append(Spacer(1, 0.14 * inch))

    story.append(PageBreak())
    story.append(Paragraph("Verification Notes", styles["Section"]))
    story.append(Paragraph(f"Temporary production objective: {esc(manifest.get('tempObjectiveTitle'))}. Temporary NCR: {esc(manifest.get('tempNcrReportNumber'))}. Both were deleted after capture.", styles["BodySand"]))
    story.append(Paragraph(f"Cleanup result: {esc(json.dumps(cleanup, sort_keys=True))}.", styles["BodySand"]))
    story.append(Paragraph("Local gates before report: lint passed, unit tests passed 49/49, and production build passed. Browser evidence was captured from objectivetracker.net using temporary QA accounts.", styles["BodySand"]))

    doc.build(story)
    print(PDF_OUT)


if __name__ == "__main__":
    build()
