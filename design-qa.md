# Design QA — Project teammate tagging

Date: 2026-07-23
Production URL: https://objectivetracker.net
Reference: `/var/folders/7y/fdzx9ksn0yl0wwy2hpz5_dqh0000gn/T/TemporaryItems/NSIRD_screencaptureui_BIEdi8/Screenshot 2026-07-23 at 11.46.35 AM.png`

## State compared

- Reference: Create New → Project → Standalone, where Jake identified the missing Tagged teammates section.
- Production: Create New → Project → Standalone with a title entered and Tim Dibben selected as a teammate.
- The reference and production capture were reviewed together in one visual comparison.

## Visual and interaction checks

- The Project wizard now shows Tasks, Tagged teammates, and Attachments in the existing OMP design system.
- Tasks remain full width; Tagged teammates and Attachments share the next row at desktop width.
- Typing `@Tim` exposes Tim Dibben as a selectable teammate.
- Choosing Tag clears the entry and renders a removable Tim Dibben chip.
- Assigned owner and tagged teammates remain visually distinct.
- No horizontal cropping or broken modal layout was observed.
- The existing mobile crop suite passed for iPhone 12, iPhone 14 Pro, and iPhone 15 Plus.
- The accessibility smoke suite passed.
- The production verification stopped before Create Project, so no test project or notification was left behind.

## Persistence checks

- Project teammate IDs are stored in `public.okr_project_members`.
- The table has authenticated grants, RLS, owner-controlled writes, Realtime, and covering indexes for project/user lookup.
- Project member IDs are loaded into the dashboard model and included in Individual/My Team visibility.
- Project creation writes the teammate rows before reporting success and removes an incomplete just-created project if member setup fails.

final result: passed

---

# Design QA — Dashboard work-type buttons

Date: 2026-08-10

## Visual truth

- Source visual: `/Users/andrewemmel/Desktop/Screenshot 2026-08-10 at 7.25.37 PM.png`
- Source dimensions: 1488 × 478 px (user-cropped dashboard region)
- Required change: use the three marked positions in the open list-header band for immediately visible Task, Project, and NCR controls; do not require the Type dropdown.

## Implementation proof

- Local screenshot: `docs/evidence/work-type-buttons-2026-08-10/01-local-dashboard-buttons.png`
- Production screenshot: `docs/evidence/work-type-buttons-2026-08-10/02-production-dashboard-buttons.png`
- Implementation viewport: 1280 × 720 px
- Production state: `https://objectivetracker.net/?page=dashboard`, signed in as Andrew Emmel, Company view, overview expanded, Tasks selected.

## Comparison

### Full-frame

- The list card remains in its original location below the overview cards.
- Existing dashboard typography, SandPro orange, borders, radii, filters, aging controls, and Legacy imports control are preserved.
- No new horizontal overflow, crop, or collision is visible at the verified viewport.

### Focused work-type region

- The previously empty header band now contains three equally sized, permanent buttons: Tasks, Projects, and NCRs.
- The buttons are centered in the region marked by the user and remain outside the collapsible advanced-filter area.
- The Type dropdown has been removed.
- The selected button is visually distinct and exposes `aria-pressed`; each button includes its current matching-row count.
- Responsive rules make the three-button group a full-width second header row at 720 px and below, so the controls cannot disappear into a clipped horizontal chip strip.

## Functional verification

- Tasks: button count 84; 84 rendered rows; every row type is Task.
- Projects: button count 1; 1 rendered row; row type is Project.
- NCRs: button count 1; 1 rendered row; row type is NCR.
- Selecting any primary work type exits Legacy imports; Legacy imports remains a separate, secondary opt-in.

## Iteration history

1. P1 — the prior small type chips were not reliably visible in the user's layout and the Type dropdown remained the practical control.
2. Fixed — moved three large primary controls into the marked header band and removed the Type dropdown.
3. P2 — narrow layouts could hide or horizontally clip a control strip.
4. Fixed — added a responsive full-width three-column header row that remains visible while advanced filters collapse separately.
5. Final production comparison found no remaining P0, P1, or P2 visual issue in the requested region.

Final result: passed
