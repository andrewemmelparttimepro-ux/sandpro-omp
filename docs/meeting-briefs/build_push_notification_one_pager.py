from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


OUT = "/Users/andrewemmel/Documents/New project/sandpro-omp/docs/meeting-briefs/SandPro_Push_Notifications_Post_Meeting_One_Pager.pdf"

PAGE_W, PAGE_H = landscape(letter)
MARGIN = 0.42 * inch

ORANGE = colors.HexColor("#e56a2c")
DARK = colors.HexColor("#151c2b")
SLATE = colors.HexColor("#526070")
MUTED = colors.HexColor("#717b8a")
LINE = colors.HexColor("#d6dbe3")
PAPER = colors.HexColor("#fbfaf8")
PANEL = colors.white
PALE_ORANGE = colors.HexColor("#fff1ea")
PALE_BLUE = colors.HexColor("#eef6fb")
PALE_GREEN = colors.HexColor("#eff8f1")
PALE_YELLOW = colors.HexColor("#fff8dc")
PALE_GRAY = colors.HexColor("#f4f6f8")


def style(size=9, leading=None, color=DARK, bold=False, align=0):
    return ParagraphStyle(
        name=f"s{size}{bold}{align}",
        fontName="Helvetica-Bold" if bold else "Helvetica",
        fontSize=size,
        leading=leading or size + 2,
        textColor=color,
        alignment=align,
        spaceAfter=0,
        spaceBefore=0,
    )


BODY = style(8.7, 10.8, SLATE)
SMALL = style(7.7, 9.4, MUTED)
TINY = style(6.8, 8.3, MUTED)
H2 = style(11, 13, DARK, True)
H3 = style(8.6, 10.4, DARK, True)


def para(c, text, x, y, w, h, pstyle=BODY):
    p = Paragraph(text, pstyle)
    _, actual_h = p.wrap(w, h)
    p.drawOn(c, x, y + h - actual_h)
    return actual_h


def round_rect(c, x, y, w, h, fill=PANEL, stroke=LINE, radius=9, width=1):
    c.setStrokeColor(stroke)
    c.setFillColor(fill)
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)


def label(c, text, x, y, w, h, fill, stroke=None):
    round_rect(c, x, y, w, h, fill=fill, stroke=stroke or fill, radius=7, width=0.6)
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 7.2)
    text_w = stringWidth(text, "Helvetica-Bold", 7.2)
    c.drawString(x + (w - text_w) / 2, y + h / 2 - 2.4, text)


def section_heading(c, eyebrow, title, x, y, w):
    c.setFillColor(ORANGE)
    c.setFont("Helvetica-Bold", 6.8)
    c.drawString(x, y + 15, eyebrow.upper())
    para(c, title, x, y - 2, w, 17, H2)


def bullet_list(c, items, x, y, w, line_h=11.1, pstyle=BODY, dot_color=ORANGE):
    top = y
    for item in items:
        c.setFillColor(dot_color)
        c.circle(x + 2.3, top - 3.5, 1.45, stroke=0, fill=1)
        h = para(c, item, x + 9, top - 11, w - 9, 16, pstyle)
        top -= max(line_h, h + 2.2)
    return top


def check_item(c, title, detail, x, y, w, color_fill):
    round_rect(c, x, y, w, 43, fill=color_fill, stroke=LINE, radius=7, width=0.7)
    c.setFillColor(ORANGE)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 10, y + 25, "+")
    para(c, title, x + 24, y + 24, w - 34, 13, H3)
    para(c, detail, x + 24, y + 7, w - 34, 15, SMALL)


def flow_node(c, title, subtitle, x, y, w, fill):
    round_rect(c, x, y, w, 54, fill=fill, stroke=LINE, radius=8, width=0.7)
    para(c, title, x + 9, y + 31, w - 18, 14, H3)
    para(c, subtitle, x + 9, y + 8, w - 18, 22, SMALL)


def arrow(c, x1, y1, x2, y2):
    c.setStrokeColor(ORANGE)
    c.setLineWidth(1.4)
    c.line(x1, y1, x2, y2)
    c.setFillColor(ORANGE)
    c.line(x2, y2, x2 - 4, y2 + 3)
    c.line(x2, y2, x2 - 4, y2 - 3)


def build():
    c = canvas.Canvas(OUT, pagesize=(PAGE_W, PAGE_H))
    c.setTitle("SandPro Push Notifications - Post-Meeting Build Plan")

    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    # Header
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(MARGIN, PAGE_H - 0.56 * inch, "SandPro Push Notifications")
    c.setFont("Helvetica", 10.8)
    c.setFillColor(SLATE)
    c.drawString(MARGIN, PAGE_H - 0.80 * inch, "Post-meeting implementation plan: ready to build immediately after alignment with Jake and Merci.")
    label(c, "FIRST POST-MEETING BUILD", PAGE_W - MARGIN - 144, PAGE_H - 0.72 * inch, 144, 24, PALE_ORANGE, colors.HexColor("#f4c6ad"))

    # Top callout
    callout_y = PAGE_H - 1.72 * inch
    round_rect(c, MARGIN, callout_y, PAGE_W - 2 * MARGIN, 52, fill=DARK, stroke=DARK, radius=10)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(MARGIN + 18, callout_y + 30, "Plain-English Promise")
    para(
        c,
        "We will extend the notification system that already exists: when SandPro creates an in-app alert, the server will also send a focused Web Push alert to opted-in devices, honoring user preferences and opening the right objective when tapped.",
        MARGIN + 170,
        callout_y + 11,
        PAGE_W - 2 * MARGIN - 195,
        30,
        style(9.2, 11.7, colors.white),
    )

    # Left: What we build
    left_x = MARGIN
    left_y = 0.93 * inch
    left_w = 3.25 * inch
    left_h = 5.25 * inch
    round_rect(c, left_x, left_y, left_w, left_h, fill=PANEL, stroke=LINE, radius=10)
    section_heading(c, "Build Components", "What We Would Add", left_x + 16, left_y + left_h - 42, left_w - 32)
    item_w = left_w - 32
    y = left_y + left_h - 98
    check_item(c, "Database", "push_subscriptions: user, endpoint, keys, device metadata, active/revoked.", left_x + 16, y, item_w, PALE_GRAY)
    y -= 50
    check_item(c, "VAPID Keys", "Public key to frontend; private key in Vercel env so the server proves SandPro is sender.", left_x + 16, y, item_w, PALE_ORANGE)
    y -= 50
    check_item(c, "Frontend Flow", "Settings/onboarding button checks support, asks permission, subscribes, saves to Supabase.", left_x + 16, y, item_w, PALE_BLUE)
    y -= 50
    check_item(c, "Service Worker", "Handle push, show notification, handle tap, open objective/deep link; optional badge count.", left_x + 16, y, item_w, PALE_GREEN)
    y -= 50
    check_item(c, "Server Sender", "Use web-push, check preferences, send payloads, remove expired device subscriptions.", left_x + 16, y, item_w, PALE_YELLOW)
    y -= 50
    check_item(c, "Preference Rules", "Push on/off plus channels: mentions, assignments, blockers, at-risk, due/overdue.", left_x + 16, y, item_w, PALE_GRAY)

    # Middle: system flow
    mid_x = left_x + left_w + 0.22 * inch
    mid_w = 3.42 * inch
    mid_y = left_y
    mid_h = left_h
    round_rect(c, mid_x, mid_y, mid_w, mid_h, fill=PANEL, stroke=LINE, radius=10)
    section_heading(c, "System Flow", "How It Works", mid_x + 16, mid_y + mid_h - 42, mid_w - 32)
    fx = mid_x + 18
    fw = mid_w - 36
    fy = mid_y + mid_h - 112
    flow_node(c, "1. App Creates Alert", "Mention, assignment, blocker, or due-date event.", fx, fy, fw, PALE_BLUE)
    arrow(c, fx + fw / 2, fy - 4, fx + fw / 2, fy - 20)
    fy -= 78
    flow_node(c, "2. Preference + Device Check", "Confirm push is enabled and find active subscriptions.", fx, fy, fw, PALE_GRAY)
    arrow(c, fx + fw / 2, fy - 4, fx + fw / 2, fy - 20)
    fy -= 78
    flow_node(c, "3. Web Push Delivery", "Backend sends title, body, and secure URL payload.", fx, fy, fw, PALE_ORANGE)
    arrow(c, fx + fw / 2, fy - 4, fx + fw / 2, fy - 20)
    fy -= 78
    flow_node(c, "4. User Taps Notification", "Phone/browser opens SandPro to the right objective.", fx, fy, fw, PALE_GREEN)
    para(c, "Technical basis: service worker + PushManager.subscribe() + server-side Web Push.", mid_x + 18, mid_y + 14, mid_w - 36, 15, TINY)

    # Right: rollout and reality
    right_x = mid_x + mid_w + 0.22 * inch
    right_w = PAGE_W - MARGIN - right_x
    right_y = left_y
    right_h = left_h
    round_rect(c, right_x, right_y, right_w, right_h, fill=PANEL, stroke=LINE, radius=10)
    section_heading(c, "Rollout", "Best Implementation Plan", right_x + 16, right_y + right_h - 42, right_w - 32)

    phases = [
        ("Phase 1", "Subscriptions, service worker push handler, Enable Push button, mentions + assignments."),
        ("Phase 2", "Blockers, at-risk, due, and overdue push with clear preference controls."),
        ("Phase 3", "Mobile install guidance and QA on iPhone and Android devices."),
        ("Phase 4", "Tune noise rules with Jake/Merci after real usage."),
    ]
    ty = right_y + right_h - 98
    for idx, (phase, desc) in enumerate(phases):
        fill = [PALE_ORANGE, PALE_BLUE, PALE_GREEN, PALE_YELLOW][idx]
        round_rect(c, right_x + 16, ty, right_w - 32, 36, fill=fill, stroke=LINE, radius=7, width=0.7)
        para(c, phase, right_x + 27, ty + 20, right_w - 54, 11, H3)
        para(c, desc, right_x + 27, ty + 6, right_w - 54, 15, TINY)
        ty -= 42

    # Mobile reality box
    mobile_y = right_y + 18
    round_rect(c, right_x + 16, mobile_y, right_w - 32, 118, fill=colors.HexColor("#fff8f4"), stroke=colors.HexColor("#f0cbb9"), radius=8)
    para(c, "Mobile Reality", right_x + 28, mobile_y + 92, right_w - 56, 14, H3)
    bullet_list(
        c,
        [
            "<b>Android/Chrome:</b> straightforward after the user allows notifications.",
            "<b>iPhone:</b> Web Push works for Home Screen web apps on iOS/iPadOS 16.4+; user must add SandPro to Home Screen and grant permission from a tap.",
            "<b>Limit:</b> pop-up/disappear behavior is partly OS-controlled; we can reduce noise but not guarantee exact persistence behavior.",
        ],
        right_x + 28,
        mobile_y + 77,
        right_w - 56,
        line_h=21,
        pstyle=TINY,
    )

    # Footer
    footer_y = 0.52 * inch
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(MARGIN, footer_y + 20, PAGE_W - MARGIN, footer_y + 20)
    para(
        c,
        "<b>Meeting takeaway:</b> This is not a tiny CSS change, but it fits cleanly into SandPro's existing in-app/email notification foundation and is ready to start as the first post-meeting build.",
        MARGIN,
        footer_y - 2,
        PAGE_W - 2 * MARGIN,
        18,
        style(8.4, 10.2, DARK),
    )
    para(
        c,
        "Sources: MDN Push API / PushManager; Apple Developer Web Push; WebKit iOS/iPadOS Web Push for Home Screen web apps.",
        MARGIN,
        0.18 * inch,
        PAGE_W - 2 * MARGIN,
        12,
        TINY,
    )

    c.showPage()
    c.save()


if __name__ == "__main__":
    build()
