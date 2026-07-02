from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


OUT = Path(__file__).with_name("SandPro_OMP_May_28_2026_Readiness_Brief.pdf")

BRAND = colors.HexColor("#ff7f02")
INK = colors.HexColor("#1F2937")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#E5E7EB")
SOFT = colors.HexColor("#FFF7ED")
GREEN = colors.HexColor("#059669")
RED = colors.HexColor("#DC2626")
BLUE = colors.HexColor("#2563EB")


class Rule(Flowable):
    def __init__(self, color=LINE, width=1):
        super().__init__()
        self.color = color
        self.width = width
        self.height = 8
        self._line_width = 0

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.width)
        self.canv.line(0, 4, self._line_width, 4)

    def wrap(self, availWidth, availHeight):
        self._line_width = availWidth
        return availWidth, self.height


def styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle(
        name="CoverTitle",
        parent=base["Title"],
        fontName="Helvetica-Bold",
        fontSize=25,
        leading=30,
        textColor=INK,
        alignment=TA_CENTER,
        spaceAfter=10,
    ))
    base.add(ParagraphStyle(
        name="Subtitle",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceAfter=22,
    ))
    base.add(ParagraphStyle(
        name="Section",
        parent=base["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=INK,
        spaceBefore=16,
        spaceAfter=8,
    ))
    base.add(ParagraphStyle(
        name="SmallSection",
        parent=base["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=INK,
        spaceBefore=8,
        spaceAfter=5,
    ))
    base.add(ParagraphStyle(
        name="Body",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=13.2,
        textColor=INK,
        spaceAfter=6,
    ))
    base.add(ParagraphStyle(
        name="Small",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=MUTED,
    ))
    base.add(ParagraphStyle(
        name="Callout",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=INK,
        backColor=SOFT,
        borderColor=colors.HexColor("#FED7AA"),
        borderWidth=0.6,
        borderPadding=9,
        spaceAfter=10,
    ))
    base.add(ParagraphStyle(
        name="Cell",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=7.7,
        leading=10.4,
        textColor=INK,
    ))
    base.add(ParagraphStyle(
        name="CellBold",
        parent=base["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=7.7,
        leading=10.4,
        textColor=INK,
    ))
    return base


S = styles()


def P(text, style="Body"):
    return Paragraph(text, S[style])


def bullets(items, level=0):
    return ListFlowable(
        [ListItem(P(item, "Body"), leftIndent=10) for item in items],
        bulletType="bullet",
        start=None,
        leftIndent=12 + level * 8,
        bulletFontName="Helvetica",
        bulletFontSize=6,
        bulletColor=BRAND,
        spaceBefore=1,
        spaceAfter=5,
    )


def status_label(text, color):
    return Paragraph(f'<font color="{color.hexval()}"><b>{text}</b></font>', S["Cell"])


def table(data, widths, header=True):
    converted = []
    for row in data:
        converted.append([
            cell if hasattr(cell, "wrap") else P(str(cell), "CellBold" if header and len(converted) == 0 else "Cell")
            for cell in row
        ])
    t = Table(converted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, LINE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.35, colors.HexColor("#F1F5F9")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8FAFC")),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
    ]
    t.setStyle(TableStyle(style))
    return t


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, 0.58 * inch, doc.pagesize[0] - doc.rightMargin, 0.58 * inch)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(doc.leftMargin, 0.38 * inch, "SandPro OMP readiness brief - internal meeting prep")
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 0.38 * inch, f"Page {doc.page}")
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.68 * inch,
        bottomMargin=0.72 * inch,
        title="SandPro OMP May 28 Readiness Brief",
        author="NDAI / Codex",
    )

    story = []
    story += [
        Spacer(1, 0.5 * inch),
        P("SandPro OMP", "CoverTitle"),
        P("May 28, 2026 Readiness Brief", "CoverTitle"),
        P("What changed in the last 48 hours, what was verified, and what to say in today's SandPro meeting.", "Subtitle"),
        Rule(BRAND, 1.8),
        Spacer(1, 0.1 * inch),
        P("<b>Bottom line:</b> The live app is meeting-ready. During this audit, one live schema issue and one realtime-env issue were found, fixed, redeployed, and revalidated. The broad temporary-user production regression passed after deploy, and the live app was checked manually in Chrome.", "Callout"),
    ]

    summary = [
        ["Area", "Meeting-ready statement"],
        ["Live URL", "Production is live at objectivetracker.net and aliased to the latest Vercel deployment."],
        ["Merci feedback", "Implemented and validated: description @mentions, editable/deletable subtasks, reset-password gate, message mention reliability, duplicate tag prevention, and blank due-date handling."],
        ["Fix-It Feed", "First-class tab is live with file-backed posts, status actions, and simple new-feature guidance. Contributor visibility was verified with a temporary non-executive account."],
        ["Release posture", "Lint, unit, build, schema, auth redirect, PWA, a11y login, production QA, and live shell console checks passed."],
        ["Caveat", "Named Jake/Merci smoke still cannot run locally until their credentials are provided as local test env vars."],
    ]
    story.append(table(summary, [1.35 * inch, 5.55 * inch]))

    story += [
        P("What Changed", "Section"),
        bullets([
            "<b>Navigation and release guidance:</b> Fix-It Feed added as a first-class tab; new features now have a standard dismissible announcement/help pattern.",
            "<b>Objective collaboration:</b> Objective descriptions now support @mentions that attach teammates and create notifications; message mentions are also detected more reliably.",
            "<b>Subtasks:</b> Subtasks/milestones can be edited and deleted after creation, including owner, status, due date, progress, weight, and milestone state.",
            "<b>Password reset:</b> Recovery links now force a real reset-password screen instead of quietly dropping the user into the app.",
            "<b>Org chart:</b> Merci/org-chart editing permissions and server-side audit surfaces were tightened; missing live audit table was created during this audit.",
            "<b>Persistence and release discipline:</b> Supabase release migration, schema checks, production regression, auth redirect checks, PWA checks, and release docs are now part of the codebase.",
            "<b>Reliability hardening today:</b> Browser Supabase credentials are trimmed before client creation, preventing trailing-newline realtime websocket failures.",
        ]),
        P("Issues Caught During This Audit", "Section"),
    ]

    caught = [
        ["Issue", "Impact", "Action", "Current result"],
        ["Missing org_chart_updates schema cache entry", "Org-chart edits could appear to work until audit logging failed.", "Ran the release migration and schema reload.", status_label("Fixed / schema passed", GREEN)],
        ["Supabase anon key trailing newline in browser bundle", "Realtime websocket could fail, making notifications/live updates flaky.", "Trimmed browser env values, added test, redeployed.", status_label("Fixed / console clean", GREEN)],
        ["Merci missing Fix-It Feed report", "Could be mistaken for a permissions bug in the meeting.", "Verified with temporary contributor login.", status_label("Visible to contributor", GREEN)],
    ]
    story.append(table(caught, [1.75 * inch, 2.05 * inch, 2.0 * inch, 1.1 * inch]))

    story += [
        P("Validation Run", "Section"),
    ]
    gates = [
        ["Gate", "Result", "Notes"],
        ["git diff --check", status_label("PASS", GREEN), "No whitespace/conflict-marker issues."],
        ["npm run lint", status_label("PASS", GREEN), "ESLint clean."],
        ["npm run test:unit", status_label("PASS", GREEN), "25/25 after adding Supabase env-trim coverage."],
        ["npm run build", status_label("PASS", GREEN), "Build passed; Vite reports a non-blocking large chunk warning."],
        ["npm run test:schema", status_label("PASS", GREEN), "Failed initially on org_chart_updates, then passed after migration/reload."],
        ["npm run test:auth-redirects", status_label("PASS", GREEN), "Recovery redirect confirmed for objectivetracker.net."],
        ["npm run test:pwa", status_label("PASS", GREEN), "6/6 desktop/mobile PWA checks."],
        ["npm run test:a11y", status_label("PARTIAL PASS", BLUE), "Login shell 2/2 passed; authenticated a11y skipped because named credentials are not local."],
        ["Temp-user production QA", status_label("PASS", GREEN), "8/8 after deploy; temporary users/objectives cleaned."],
        ["Live shell console", status_label("PASS", GREEN), "Post-deploy headless browser check had 0 console errors."],
        ["Jake/Merci named smoke", status_label("BLOCKED", RED), "Requires SANDPRO_JAKE_* and SANDPRO_MERCI_* local env vars."],
    ]
    story.append(table(gates, [1.65 * inch, 1.0 * inch, 4.25 * inch]))

    story += [
        PageBreak(),
        P("Human App Walkthrough", "Section"),
        P("Checked in Google Chrome against the live production domain as Andrew. A stale/blank tab was recovered by opening a fresh cache-busted live URL, which is useful meeting guidance if anyone sees an old PWA state.", "Body"),
    ]
    human = [
        ["Surface", "What was checked", "Result"],
        ["Dashboard", "Daily Brief overlay, KPI cards, attention list, department health, recent messages.", status_label("OK", GREEN)],
        ["Objectives", "List view, filters, inline guidance, tagged people, workflow summaries, row rendering.", status_label("OK", GREEN)],
        ["Objective detail", "Opened a Merci-created password-reset objective; modal, URL deep link, messages tab, and close behavior worked.", status_label("OK", GREEN)],
        ["Subtasks", "Subtasks tab rendered title/owner/date/weight/milestone controls and empty state.", status_label("OK", GREEN)],
        ["Fix-It Feed", "Tab rendered, Jake's live feedback item appeared, attachment preview control visible, action buttons visible.", status_label("OK", GREEN)],
        ["Contributor access", "Temporary contributor account could log in and see Fix-It Feed.", status_label("OK", GREEN)],
    ]
    story.append(table(human, [1.35 * inch, 4.35 * inch, 1.2 * inch]))

    story += [
        P("How To Handle The Live Fix-It Item", "Section"),
        P("Jake's visible item says Merci did not have the Fix-It Feed. The permission check passed for a contributor account, so the most likely explanation is stale browser/PWA cache, old tab state, or an app instance that has not refreshed since deployment.", "Body"),
        bullets([
            "Ask Merci to open a fresh browser tab at <b>https://objectivetracker.net</b>.",
            "If using the installed PWA, quit and reopen it; if the tab is still missing, uninstall/reinstall the PWA from the fresh site.",
            "If she is already inside Chrome, use a hard refresh. On Mac: Command-Shift-R. On Windows: Ctrl-Shift-R.",
            "Do not mark Jake's Fix-It item fixed until Merci confirms the tab is visible on her device.",
        ]),
        P("Suggested Meeting Demo Path", "Section"),
        bullets([
            "<b>Start:</b> Dashboard and Daily Brief, showing the app now has a daily operating view rather than just a list of objectives.",
            "<b>Objectives:</b> Show filters, tagged people, workflow status, and the new guidance banner.",
            "<b>Merci feedback:</b> Open one of Merci's feedback objectives, then show messages, subtasks, access, and workflow tabs.",
            "<b>Fix-It Feed:</b> Show Jake's item and explain it is the shared chronological beta feedback wall for screenshots and notes.",
            "<b>Org chart:</b> Show that org-chart management is visible and governed by server permissions/audit logging.",
            "<b>Close:</b> Explain that temp-user production QA passed and named Jake/Merci smoke can be added immediately once credentials are supplied locally.",
        ]),
        PageBreak(),
        P("Plain-English Talking Points", "Section"),
        bullets([
            "The app now has a clearer feedback loop: objective comments, @mentions, subtasks, workflow steps, and Fix-It Feed each have a distinct job.",
            "Merci's actual comments were used as acceptance criteria, not treated as generic feature requests.",
            "Production testing is now repeatable: temporary test data is created, workflows run, and cleanup verifies that no test users/objectives remain.",
            "Two issues were caught before the meeting and fixed live: an org-chart audit table gap and a realtime credential formatting problem.",
            "The remaining caveat is not an app feature gap: named Jake/Merci smoke needs their credentials configured as local test env vars.",
        ]),
        P("Operational Notes", "Section"),
    ]
    notes = [
        ["Topic", "Note"],
        ["Deployment", "Latest production deployment was aliased to objectivetracker.net after the Supabase credential-trim fix."],
        ["Data hygiene", "Temporary production QA users and objectives were cleaned after the post-deploy run."],
        ["Do not demo destructive actions", "Avoid Delete, Mark fixed, or Untag on real SandPro records unless Jake explicitly asks and confirms."],
        ["Credentials", "Set SANDPRO_JAKE_EMAIL, SANDPRO_JAKE_PASSWORD, SANDPRO_MERCI_EMAIL, and SANDPRO_MERCI_PASSWORD locally to enable named-account smoke."],
        ["Best immediate follow-up", "Have Merci verify Fix-It Feed from a fresh browser/PWA session and then mark Jake's Fix-It item fixed only after confirmation."],
    ]
    story.append(table(notes, [1.65 * inch, 5.25 * inch]))

    story += [
        Spacer(1, 0.18 * inch),
        Rule(),
        P(f"Prepared {datetime.now().strftime('%B %-d, %Y at %-I:%M %p')} local time from code review, live production validation, and Chrome human walkthrough.", "Small"),
    ]

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUT)


if __name__ == "__main__":
    build()
