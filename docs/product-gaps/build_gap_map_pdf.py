from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUT = Path(__file__).with_name("SandPro_OMP_Missing_Pieces_Gap_Map.pdf")

styles = getSampleStyleSheet()

title = ParagraphStyle(
    "Title",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=21,
    leading=24,
    alignment=TA_LEFT,
    textColor=colors.HexColor("#111827"),
    spaceAfter=2,
)
subtitle = ParagraphStyle(
    "Subtitle",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9.5,
    leading=12,
    textColor=colors.HexColor("#6B7280"),
    spaceAfter=8,
)
section = ParagraphStyle(
    "Section",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=12.5,
    leading=15,
    alignment=TA_CENTER,
    textColor=colors.HexColor("#ff7f02"),
)
small = ParagraphStyle(
    "Small",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8.4,
    leading=10.4,
    textColor=colors.HexColor("#1F2937"),
)
small_bold = ParagraphStyle(
    "SmallBold",
    parent=small,
    fontName="Helvetica-Bold",
)
callout = ParagraphStyle(
    "Callout",
    parent=small,
    fontName="Helvetica-Bold",
    fontSize=9,
    leading=11,
    alignment=TA_CENTER,
    textColor=colors.HexColor("#111827"),
)
footer = ParagraphStyle(
    "Footer",
    parent=subtitle,
    fontSize=8,
    leading=9.5,
    alignment=TA_CENTER,
    spaceBefore=8,
)


def p(text, style=small):
    return Paragraph(text, style)


def box(title_text, rows, fill):
    data = [[Paragraph(title_text, section)]]
    for label, value in rows:
        data.append([Paragraph(f"<b>{label}</b><br/>{value}", small)])
    table = Table(data, colWidths=[3.22 * inch], repeatRows=0)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(fill)),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


doc = SimpleDocTemplate(
    str(OUT),
    pagesize=letter,
    leftMargin=0.62 * inch,
    rightMargin=0.62 * inch,
    topMargin=0.52 * inch,
    bottomMargin=0.48 * inch,
)

notification_box = box(
    "1. Notification Discipline",
    [
        ("What exists", "In-app bell, @name mentions, tagged teammates, email plumbing, preferences, and Daily Brief."),
        ("Still missing", "A quiet notification rule set: what deserves a popup, what stays only in-app, what becomes email, and what disappears after first notice."),
        ("Why Jake cares", "If users get too many alerts, they ignore the app. If they miss the right alert, accountability breaks."),
        ("Decision needed", "Default rule: direct mentions, blockers, assignments, and due/overdue items notify. General activity stays in the app/Daily Brief."),
        ("Next build", "Add a transient 'soft alert' layer plus clear @name, @team, and @all behavior with guardrails against noise."),
    ],
    "#FFF4EC",
)

progress_box = box(
    "2. Progress Meaning",
    [
        ("What exists", "Progress bar, manual edit, workflow steps, metrics fields, baseline/current/target, and some rollup plumbing."),
        ("Still missing", "A visible rule explaining why an objective is 0%, 40%, or 80%, and who is responsible for updating it."),
        ("Why Jake cares", "Progress that looks official but has no meaning creates confusion and mistrust."),
        ("Decision needed", "Each objective needs a progress mode: Manual, Workflow-based, Metric-based, or Parent rollup."),
        ("Next build", "Show the source under every progress bar, e.g. '2 of 5 steps complete' or 'Current value is 60% of target.'"),
    ],
    "#F8FAFC",
)

priority_table = Table(
    [[
        p("<b>Build order</b>", small_bold),
        p("1. Define rules<br/>2. Show the rule in the UI<br/>3. Test with real Jake/Merci objectives<br/>4. Only then widen rollout", small),
    ]],
    colWidths=[1.15 * inch, 5.55 * inch],
)
priority_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
    ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#CBD5E1")),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))

story = [
    Paragraph("SandPro OMP: Missing Pieces Gap Map", title),
    Paragraph("The two unresolved product decisions that matter most before wider rollout.", subtitle),
    Table([[notification_box, progress_box]], colWidths=[3.35 * inch, 3.35 * inch], style=[
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]),
    Spacer(1, 10),
    priority_table,
    Spacer(1, 9),
    Table(
        [[Paragraph("Plain-English takeaway", callout)]],
        colWidths=[6.7 * inch],
        style=[
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#F59E0B")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ],
    ),
    Table(
        [[Paragraph("The app has pieces of both systems, but the missing work is the rule layer. Jake needs to see that OMP does not just collect activity; it decides what deserves attention and explains how progress is earned.", small)]],
        colWidths=[6.7 * inch],
        style=[
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFBEB")),
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#F59E0B")),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ],
    ),
    Paragraph("Prepared as a quick visual planning note for Andrew before the next SandPro OMP build pass.", footer),
]

doc.build(story)
print(OUT)
