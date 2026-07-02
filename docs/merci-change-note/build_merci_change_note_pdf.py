from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    ListFlowable,
    ListItem,
)


OUT = Path(__file__).with_name("SandPro_OMP_Quick_Update_for_Merci.pdf")

styles = getSampleStyleSheet()
body = ParagraphStyle(
    "Body",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9.35,
    leading=12.2,
    textColor=colors.HexColor("#1f2937"),
    spaceAfter=4,
)
muted = ParagraphStyle(
    "Muted",
    parent=body,
    fontSize=9,
    leading=11.5,
    textColor=colors.HexColor("#6b7280"),
)
title = ParagraphStyle(
    "Title",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=22,
    leading=25,
    alignment=TA_LEFT,
    textColor=colors.HexColor("#111827"),
    spaceAfter=2,
)
section = ParagraphStyle(
    "Section",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=12.2,
    leading=14,
    textColor=colors.HexColor("#ea580c"),
    spaceBefore=8,
    spaceAfter=3,
)
footer_style = ParagraphStyle(
    "Footer",
    parent=muted,
    fontSize=8,
    leading=9,
    alignment=TA_CENTER,
    spaceBefore=7,
)


def boxed(text, fill, border):
    table = Table([[Paragraph(text, body)]], colWidths=[7.1 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(f"#{fill}")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor(f"#{border}")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def bullets(items):
    return ListFlowable(
        [
            ListItem(
                Paragraph(item, body),
                leftIndent=10,
                bulletColor=colors.HexColor("#ea580c"),
            )
            for item in items
        ],
        bulletType="bullet",
        start="circle",
        leftIndent=13,
        bulletFontName="Helvetica",
        bulletFontSize=6,
        bulletOffsetY=1,
    )


doc = SimpleDocTemplate(
    str(OUT),
    pagesize=letter,
    leftMargin=0.7 * inch,
    rightMargin=0.7 * inch,
    topMargin=0.55 * inch,
    bottomMargin=0.48 * inch,
)

story = [
    Paragraph("SandPro OMP: Quick Update for Merci", title),
    Paragraph("Plain-English summary of the latest cleanup and testing focus", muted),
    Spacer(1, 6),
    boxed(
        "Hi Merci - here is the quick version of what was tightened up so you can help test the platform with confidence. "
        "The goal is simple: make the app easier to understand, easier to maintain, and less likely to surprise you during real SandPro work.",
        "fff4ec",
        "fdba74",
    ),
    Paragraph("What changed", section),
    bullets([
        "You can now help maintain the Organization page. You should be able to update names, titles, departments, and who someone reports to.",
        "Platform role changes are still protected. Day-to-day org cleanup is available to you, but deeper access changes stay limited to executive admins.",
        "Helpful in-app tips were added for new workflows. Each tip can be closed, and then reopened later from a small question-mark help button.",
        "Objective tagging and workflow guidance is clearer, including when to tag a teammate, when to use the workflow tracker, and when to mention someone in a message.",
        "File, Daily Brief, and notification areas now include short guidance so the app explains what to do without needing a separate training call.",
        "Additional validation checks were added so permissions, help prompts, login recovery, and release basics are tested before changes are handed off.",
    ]),
    Paragraph("What this means for you", section),
    bullets([
        "If Jake or Andrew asks for org chart cleanup, you should be able to do that directly from the Organization page.",
        "When a feature is new or unfamiliar, look for the short tip card or the small question-mark button.",
        "If something does not work the way the tip says it should, treat that as useful beta feedback and send it over right away.",
    ]),
    Paragraph("What is coming next", section),
    boxed(
        "A longer roadmap is being prepared for Jake, Andrew, and you. It will lay out the next phase in plain English: "
        "cleaner notifications, better mobile use, the workflow tracker, file/export improvements, org chart cleanup, and the path toward a wider SandPro team rollout.",
        "f8fafc",
        "cbd5e1",
    ),
    Paragraph("Prepared for internal SandPro OMP beta coordination.", footer_style),
]

doc.build(story)
print(OUT)
