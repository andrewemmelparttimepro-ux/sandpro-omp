# SandPro Fix-It Sidebar Design QA

## Comparison target

- Source visual truth, SandPro desktop shell: `/var/folders/7y/fdzx9ksn0yl0wwy2hpz5_dqh0000gn/T/TemporaryItems/NSIRD_screencaptureui_do7tYr/Screenshot 2026-07-21 at 4.06.20 PM.png`
- Source visual truth, SPAS 360 Fix-It rail: `/var/folders/7y/fdzx9ksn0yl0wwy2hpz5_dqh0000gn/T/TemporaryItems/NSIRD_screencaptureui_jtaWKt/Screenshot 2026-07-21 at 4.06.33 PM.png`
- Implementation screenshot: `/Users/andrewemmel/Documents/New project/sandpro-omp/docs/evidence/fix-it-sidebar/sandpro-fix-it-sidebar-1241x591.png`
- Full-view comparison: `/Users/andrewemmel/Documents/New project/sandpro-omp/docs/evidence/fix-it-sidebar/comparison-full-source-left-implementation-right.png`
- Focused rail comparison: `/Users/andrewemmel/Documents/New project/sandpro-omp/docs/evidence/fix-it-sidebar/comparison-rail-source-left-implementation-right.png`

## Normalization and state

- Implementation viewport: `1241 x 591` CSS px, device scale factor `1`, implementation bitmap `1241 x 591` px.
- SandPro source bitmap: `1242 x 591` px. The full-view comparison normalizes it to `1241 x 591`; the one-pixel width change is not visually material.
- SPAS rail source bitmap: `524 x 1017` px including browser and desktop chrome. The focused comparison uses a `420 x 535` app-owned rail crop normalized to `422 x 535`.
- Focused implementation rail: `422 x 535` CSS/bitmap px.
- State: authenticated executive QA user, dark theme, desktop `?page=fixit`, Admin rail open, Active tab selected, live SandPro queue `Active 0 / Archive 28`, no onboarding or announcement overlay.

## Full-view comparison evidence

The desktop top module bar retains Tasks & Projects, OKR, NCR, and Organization while removing Fix-It Feed. The dashboard remains visible and usable behind the expanded right rail. The rail occupies the same visual role and approximately the same width as the SPAS 360 reference without obscuring persistent app controls.

## Focused rail comparison evidence

The focused comparison confirms the same hierarchy as SPAS 360: Fix-It Feed header plus Admin badge, a rail-level destination row with a live count, full-width Active/Archive tabs, composer, and chronological feed region. SandPro intentionally uses its orange brand token instead of SPAS blue and preserves its existing Users, Departments, Reports, Export, and Settings Admin destinations.

Focused comparison was necessary because the rail controls and composer copy are too small to judge reliably in the full `2502 x 591` side-by-side image.

## Findings

No actionable P0, P1, or P2 visual differences remain.

- Fonts and typography: existing SandPro UI typography, weights, truncation, and small-label hierarchy remain consistent; rail labels and controls are readable at the target viewport.
- Spacing and layout rhythm: the `422px` rail closely matches the approximately `420px` SPAS target; tabs, composer, and empty state preserve the source hierarchy. All Admin destination tabs fit without horizontal overflow (`clientWidth 421`, `scrollWidth 421`).
- Colors and visual tokens: dark surfaces, borders, semantic state colors, and contrast match SandPro's established design system. Orange action states are an intentional SandPro-brand substitution for SPAS blue.
- Image quality and asset fidelity: the real SandPro logo is retained and existing product icon components are used at crisp native scale. No placeholder, emoji, CSS drawing, handcrafted SVG, or raster substitute was introduced.
- Copy and content: Fix-It Feed, Admin, Active, Archive, composer placeholder, Add files, Post, and the empty state are present and aligned with the target behavior. The one-time announcement now says `Open feed` and names the right Admin rail instead of referring to the removed topbar tab.

## Interaction and console checks

- Verified the desktop topbar contains no Fix-It link.
- Verified the collapsed rail exposes one `Open Fix-It Feed` control with the current active count.
- Verified open, close, Active, Archive, and direct `?page=fixit&fixit=<postId>` focus behavior.
- Verified the direct link opens the correct Archive view and visually focuses the linked archived card.
- Verified the primary Fix-It composer and feed controls remain interactive; no posts, comments, status changes, uploads, or archives were created during QA.
- Browser console was checked. The Fix-It/sidebar flow produced no runtime error after the extracted Admin helper repair. One unrelated local NCR fetch timeout was logged; it did not affect the rendered dashboard or Fix-It rail.

## Comparison history

- Formal comparison pass 1: full-view and focused composites found no actionable P0/P1/P2 differences. No post-comparison visual fix loop was required.

## Implementation checklist

- [x] Remove Fix-It Feed from the desktop module bar.
- [x] Add the counted Fix-It destination to the collapsed Admin rail.
- [x] Render the full feed in the expanded right rail.
- [x] Preserve mobile full-screen access and `?page=fixit` compatibility.
- [x] Preserve notification links and add per-card focus behavior.
- [x] Update the Fix-It announcement and scheduled automation navigation contract.
- [x] Verify desktop interactions, focused deep links, build, and unit tests.

## Follow-up polish

No P3 polish item is required for handoff. The SPAS reference shows active cards while current SandPro data is correctly empty; that is a data-state difference, not a UI mismatch.

final result: passed
