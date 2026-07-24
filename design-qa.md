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
