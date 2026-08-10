# Pit-Crew Robustness — keeping OMP on the road

> **STANDING ORDER (agreed Andrew + agent, Aug 6 2026): PRODUCTION IS FROZEN
> to fix-only until the crew wave lands (week of Aug 12).** User-blocking
> bugs, security, and data-integrity fixes ship; features and refactors wait.
> The Fix-It Feed (via Merci) is the only intake. **Schedule pulled in 8/6:
> build on staging Thu–Fri 8/6–7, weekend cutover Sat–Sun 8/8–9 (flags, gates
> between), crew week opens Mon 8/10 on the rebuilt platform; any failed gate
> → flags stay off, fallback window 8/17–20.** Full plan:
> `output/pdf/OMP_Rebuild_Plan_2026-08-06.pdf`
> (source: `tmp/perf-brief/rebuild-plan.mjs`): Phase 1 SQL views/RPCs +
> server-side pagination, Phase 2 normalized store patched from realtime
> events + keep-last-data, Phase 3 staging soak + deploy windows + visible
> build version + dedupe the duplicated components + bundle split. Targets:
> boot ≤300 KB / ≤25 calls, per-edit cost = one row per client, main chunk
> ≤250 KB, 1–2 deploy windows per day.

Premise: this car does not get to DNF. 90 SandPro employees are being told this
is where work lives now. A pit crew doesn't hope the car holds — it instruments
the car, inspects before the race, keeps a known-weak-parts list, and drills
pit stops until they're boring. This doc is that system for OMP.

Case study (the loose lug nut): Wed 8/5 9:01 AM, go-live morning, Malcolm's
Create New submit failed with a raw internal error (`Lock "…auth-token" was
released because another request stole it`). The failure condition — slow venue
Wi-Fi + auth-lock contention — was foreseeable, simulatable, and cheap to fix.
We found out via screenshot → Malcolm → Merci → email → Andrew. That relay was
the real failure. Fixed same day; the systems below exist so the next one is
caught by the car, not the driver.

---

## 1. Sensors on the car — client error telemetry (LIVE 8/5)

Every red toast, uncaught error, and unhandled rejection now phones home to the
`client_errors` table with user, page, build stamp, and stack. Write-only from
clients; read via service role/SQL.

- `src/lib/telemetry.js` — reporter (deduped, capped, fail-silent)
- `src/App.jsx` addToast — every error toast a user sees is captured
- `src/main.jsx` — global window/promise handlers
- Build stamp via `__OMP_BUILD_ID__` (vite.config.js) ties reports to deploys

Review query (also in `docs/fix-it-agent-handoff.md` — the hourly Fix-It agent
now checks this every run, before feed backlog):

```sql
select created_at, source, message, page, app_version
from client_errors
where created_at > now() - interval '24 hours'
order by created_at desc limit 100;
```

Rule of the radio: repeated signature across multiple users = live incident,
drop everything. Investigate, fix, validate, and report it through the original
human channel and the Codex task. Agents never create Fix-It posts; the wall is
human problem intake, not an incident log or an agent completion log.

## 2. Radio discipline — humans never hear jargon (LIVE 8/5)

`src/lib/errors.js` classifies errors: transient connection-class failures read
**"Connection hiccup — nothing was lost. Please try again."**; internal jargon
(JWT/PGRST/lock/TypeError/duplicate-key) swaps to plain copy; genuinely human
messages pass through. Enforced centrally at addToast + the Create New wizard.
Unit-gated by `tests/unit/error-humanizing.test.mjs` (encodes Malcolm's exact
error string forever).

Standing rule: **raw jargon reaching any user is automatically a P1**, even if
harmless — it means an unmapped failure path.

## 3. The car absorbs bumps — resilience defaults (LIVE 8/5)

- Stolen auth locks retry ×3 with backoff (`resilientNavigatorLock`,
  `src/lib/supabase.js`) — submits ride through contention. Safe because the
  lock guards token access *before* any network send (no double-writes).
- Create New: once the record exists, follow-up failures (links/tags/files/
  refetch) can no longer reject the submit — closes the duplicate-task trap.
  (`reportWizardFollowupFailure` in `src/App.jsx`.)

## 4. Pre-race inspection — chaos gates (FIRST ONE LIVE 8/5)

Bugs like Malcolm's only appear under race conditions, so we race the car in
the shop:

- `npm run chaos:lock` — signs into prod as the release-smoke admin, submits a
  real Create New task while firing steal attacks at the auth Web Lock, asserts
  no raw error + task created, screenshots proof, cleans up after itself
  (`scripts/qa/lock-steal-resilience.mjs`). **This exact test, run pre-launch,
  would have caught the 8/5 bug two laps early.** Run it after any auth/
  supabase-client/wizard change.

Queued gates (build in this order):
1. **Slow-network pass** — Playwright CDP throttle (venue Wi-Fi sim) over
   login → dashboard → Create New; assert no blank lists, no raw errors.
2. **Two-tab contention** — two contexts sharing one session storage, both
   active; assert refresh storms don't sign either out or fail submits.
3. **Offline blip during submit** — drop network mid-create; assert honest
   messaging and no duplicate on retry.

## 5. The lug-nut register — known weak parts, time-bound

P0 — this week (dated, will bite on a schedule):
- **Resend 100/day free cap vs Wave 2.** Crew rollout week of 8/12 = 73 more
  users; auth recovery emails now share the same Resend quota as app mail.
  Upgrade the plan before 8/12 or resets/digests silently cap.
- **6 hard-bounced invite addresses** (bchristoffersen, cjones, ffloydjr,
  kmackay, mroabaca, ryensal) — get canonical addresses from Wellman Tech, fix
  Auth+profiles together, clear Resend suppression, resend.
- **Defender Safe Links exclusion unconfirmed** — scanners pre-consume one-time
  links (temp passwords mitigate today; still land the exclusion).
- **Server-side disable_signup still off** — UI-only since 8/5; flip in the
  Supabase dashboard (no `sbp_` mgmt token on this Mac).

P1 — next laps (the venue-Wi-Fi class that caused 8/5):
- **Keep-last-data**: lists currently blank when a refetch fails; hold previous
  data + show a "reconnecting" chip instead.
- **Payload diet — MEASURED 8/5 night**: `ncr_reports select('*')` = 2,037 KB /
  ~950 ms for 412 rows (raw KPA JSON rides along); the same rows with list
  columns = 151 KB / ~210 ms (13×). Full boot cycle ≈ 2.6 MB of JSON.
- **Refetch avalanche — SHIPPED Lap 1 (8/6 ~2 AM, deploy sandpro-kqx2b4vgs)**:
  NCR list fetch is lean (NCR_LIST_COLUMNS, no raw KPA payload — 151 KB vs
  2,037 KB); audit events (900+) hydrate per open report; full record + audit
  hydrate on open incl. the DEFAULT-open first row (selectedReport-keyed
  effect — plain selectedId missed the default selection, caught in live
  validation); refetches preserve hydrated extras; all 5 realtime channels
  (objectives ×17 tables, ncr ×5, kpi ×5, alt-dash ×2, alt-notes ×3) coalesce
  through makeCoalescedRefetch (2 s trailing debounce + cancel-on-unmount).
  Measured after: dashboard boot 1,153 KB / 101 REST calls (was ~3.4 MB
  equivalent). Lap-2 (staged, calm week): patch state from event payloads
  instead of refetch-the-world, route-scoped loading, IndexedDB
  keep-last-data, SQL-side KPI aggregates, split the 592 KB main chunk, and
  slim the 101-call chatty boot. Brief:
  output/pdf/OMP_Performance_Architecture_Laps_2026-08-05.pdf
- **Humanize sweep**: ~40 remaining `err.message` call sites still bypass
  `humanizeError` (telemetry now sees them via addToast; swap copy over time).
- Build chaos gates 1–3 above.

NCR-specific (added 8/5 evening):
- **DECIDE (Jake, raised 8/6): map Shop / Service / Operations groups → main
  departments.** That one call deterministically classifies 213 of the 213
  remaining untriaged NCRs (keyword triage only reaches ~8 of them). Pairs
  with the KPA cutover decision: one final delta-import, then KPA is frozen
  and OMP is the only NCR front door.
- DONE 8/5: NCR file-integrity gate in `npm run test:schema` (sampled signed
  URLs + kpa-original census); "KPA import" badge on imported records;
  "Last change: field · who · when" line in the NCR detail header (concurrent
  edits stay last-write-wins per FIELD — visible activity is the guard);
  NCR #82362871 carries an in-record note that KPA exported no PDF for it.
- Unaudited still: the new-evidence upload path under field conditions (big
  phone photos, spotty coverage) — same class as the payload-diet items.

P2 — structural:
- **RLS enforcement of the permission map** (bridge-plan Domain 7) — also the
  multi-tenancy gate for selling OMP.
- Weekly `client_errors` signature review (fold into an existing daily/weekly
  automation once volume is known).
- 62 temp-password accounts: watch `must_change_password` burn-down to zero.

Register discipline: items enter with a date and an owner, leave only by being
fixed or explicitly accepted. An undated risk is a wish.

## 6. Pit-stop discipline — every deploy, same moves

1. Gates: `npm run lint && npm run test:unit && npm run build && npm run test:schema`
2. The service worker is network-first (cache is offline fallback only), so a
   `CACHE_NAME` bump is NOT needed per deploy — bump `public/sw.js` only when
   the SW itself or the offline shell changes (currently v11)
3. `vercel deploy --prod --yes`
4. `vercel alias set <deployment-url> objectivetracker.net` (+ `www.`) — the
   alias is manually pinned; a deploy without the alias step ships nothing
5. Verify served `assets/index-*.js` hash changed + `curl -I` 200
6. `npm run smoke:prod` (6 tests)
7. **Record the previous deployment URL in the deploy note — instant rollback
   is `vercel alias set <previous-url> objectivetracker.net`**
8. After auth/client/wizard changes: `npm run chaos:lock`

## 7. How a lug nut gets found before the race now

- **The car reports its own tremors**: any user-visible error lands in
  `client_errors` within seconds, with build + user + page — no screenshot
  relay. The hourly Fix-It agent reads it every run.
- **We race it in the shop**: chaos gates simulate the ugly conditions (lock
  contention today; slow network, two tabs, offline blips next) before users
  meet them.
- **Known weak parts are written down and dated**, not ambient anxiety.
- **Anything raw reaching a user is a P1 by rule** — the class of bug gets
  fixed, not the instance.

Shipped 8/5 and validated in production under forced lock contention: resilient
lock retry, error humanizing, follow-up guard, telemetry pipeline, chaos gate
#1, and this document. The incident evidence belongs in the originating task;
an Agent must not backfill a solved incident onto the Fix-It wall.

## Incident — Aug 10, 2026: Create NCR down (boolean '' 22P02)

- A commit authored by a session with a skewed clock (dated Jun 10, parent
  Aug 9) mapped repeatIssue/recurrencePrevented with `?? null` and was
  deployed Sun Aug 9 ~7:30 PM. `?? null` passes empty strings; the create
  draft holds `repeatIssue: ''` → every Create NCR failed with
  `invalid input syntax for type boolean: ""`.
- Detected Monday 9:38–9:48 AM via client_errors telemetry (Tim Dibben ×2,
  Jon Ostby ×2) before the emailed report was read. The toast vanished in 4s —
  errors now persist 10s.
- Fix: toNullableBoolean boundary (src/lib/coerce.js) on NCR insert + update;
  unit tests lock all five ncr_reports boolean columns; release gate now has a
  static payload-coercion probe. Deployed via full pipeline Mon ~10:20 AM;
  proven by scripted production create (tmp/ncr-create-proof.mjs, insert 201,
  self-cleaning).
- Standing rules: `?? null` is NEVER a sufficient guard in a payload mapper —
  typed columns cross a coercion helper. Every prod deploy runs the full
  pipeline; the Sunday deploy that shipped this did not run the NCR-create
  path in smoke (smoke is read-only) — the pipeline gate now catches the
  pattern statically instead.
