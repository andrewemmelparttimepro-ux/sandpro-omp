# SandPro OMP Mobile Zero-Day QA Report

Date: 2026-05-31

## Result

Mobile/PWA layout fixes are deployed to production at `https://objectivetracker.net`.

Production deployment:

- Vercel deployment: `dpl_AmjfW7gA7upGJxf3XhfF2trXWsdf`
- Production alias: `https://objectivetracker.net`

## What Changed

- Replaced unsafe mobile `100vw` layout assumptions with width-contained, safe-area-aware mobile rules.
- Forced mobile form controls to `16px` minimum to prevent iOS input-focus zoom.
- Reworked mobile Objective form containment so fields and footer actions stay inside the viewport.
- Reworked Dashboard KPI cards into a true one-column mobile stack.
- Reworked Objective status filters and NCR KPI cards so they wrap instead of requiring horizontal scrolling.
- Reworked Organization mobile header actions so Add Employee and Export PDF remain visible.
- Added a reusable Playwright crop gate, `assertNoMobileCrop()`, that checks visible elements by bounding box.
- Added `npm run test:mobile:qa`, which creates a temporary QA user, runs iPhone-sized mobile checks, and deletes the user afterward.

## Verified Screens

The mobile zero-day suite captures proof for these screens at 390x844, 393x852, and 430x932:

- Dashboard
- New Objective form
- Objectives list
- Fix-It Feed
- NCR
- Organization

Screenshot evidence is in:

- `docs/evidence/mobile-zero-day/iphone-12-*.png`
- `docs/evidence/mobile-zero-day/iphone-14-pro-*.png`
- `docs/evidence/mobile-zero-day/iphone-15-plus-*.png`

## Gates Run

- `npm run lint` passed
- `npm run test:unit` passed, 51/51
- `npm run build` passed
- `npm run test:schema` passed
- `npm run test:pwa` passed, 8/8
- `npm run test:auth-redirects` passed
- `npm run test:a11y` passed public checks; authenticated checks skipped because named local credentials are not present
- `npm run test:mobile:qa` passed locally, 3/3
- `SANDPRO_BASE_URL=https://objectivetracker.net npm run test:mobile:qa` passed against production, 3/3

## Cleanup

Temporary mobile QA users were deleted after both local and production runs.

## Remaining Truth

Real iOS device-cloud validation is still not completed because no BrowserStack, Sauce Labs, or LambdaTest CLI/env credentials are available in this workspace, and no matching device-cloud Chrome tab is open. The production mobile browser gate is materially stronger than the previous check, but it is not the same as installing the PWA on a physical iPhone.
