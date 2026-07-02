# NCR AI + Trend Intelligence — Production Plan

Date: 2026-06-09 (evening). Production day: tomorrow morning.
Driven by: Tim Dibben meeting 2026-06-09 (keyword association, synonym recognition, self-serve trend analysis) + Andrew's direction that trends must also surface automatically.

## 1. How "Ask AI about these NCRs" computes today (route map)

```text
UI (NcrPage, analytics mode)
  └─ POST /api/ncr/analytics-ai   { question, accessToken }
       ├─ getAuthedProfile()                     auth required; 401 otherwise
       ├─ Supabase admin query: ncr_reports      newest 500 rows, 14 columns
       │   (report #, date, group, event type, criticality, worksite,
       │    operator/location, root cause codes, failure group,
       │    description, RCA, affected product/equipment, closed)
       ├─ if OPENAI_API_KEY set:
       │    OpenAI Responses API
       │    model = OPENAI_MODEL env, default 'gpt-5.5'
       │    strict JSON schema: { answer, groups[{label,count,examples}], caveats }
       │    rows passed inline as JSON (≤500)
       └─ on no key / any OpenAI error:
            taxonomy fallback — keyword/alias match over 6 hardcoded
            PROVISIONAL_FAILURE_CODES (HRU, AWC valve, 710 valve,
            equipment failure, process loss, substandard condition)
```

Notes for whoever works on this next:
- The fallback alias list is DUPLICATED in `src/pages.jsx` (client) and `api/ncr/analytics-ai.js` (server). Single-source it when touched next.
- The meeting transcript mentions "Gemini model restricted" — the code actually calls OpenAI. The real constraint is whether `OPENAI_API_KEY` / `OPENAI_MODEL` are set in Vercel prod env.
- All 354 current NCRs fit in the 500-row window today; at ~150 NCRs/quarter the window starts silently truncating history in roughly 1 quarter.

## 2. Assessment — is it powerful enough?

Verdict: **yes for tomorrow, with the right model env set.** The architecture (authed serverless route → full structured rows → frontier model with strict JSON output → honest fallback) is sound and already does what Tim asked for conceptually: it can read descriptions and group mislabeled failures, and it can be told about synonyms.

Where it is genuinely strong:
- Strict JSON schema means the UI never gets free-text garbage.
- Fallback mode keeps the feature alive with zero API dependency.
- Auth is enforced; service-role reads stay server-side.

Real gaps (ranked):
1. ~~Presentation: pills were unreadable~~ — fixed tonight (structured answer card, ranked group rows, clickable example NCRs, loading + caveats states).
2. ~~Nothing surfaces without a question~~ — fixed tonight (Trend Watch v1, see §3).
3. Synonym library is tiny and hardcoded (Exxon=XTO exists; nothing else). → §4 Phase 2: alias table Tim can edit.
4. AI answers ignore the analytics scope bar (server always reads newest 500 of everything). → Phase 2: pass scope filters to the route.
5. No Q&A logging — we can't see what Tim asks or where answers disappoint. → Phase 2: `ncr_ai_queries` log table.
6. No rate limiting / cost ceiling on the route. → Phase 2: simple per-user per-hour cap.
7. 500-row ceiling. → Phase 3: pre-aggregation or retrieval instead of raw-row stuffing.

## 3. Shipped tonight (commit f82e943)

- **Trend Watch v1 — the auto-surfacing system.** Deterministic detectors over the scoped report set, recomputed on every data/scope change, zero API cost:
  - Rising failure groups (last 30d ≥2× prior 30d, min 3)
  - Brand-new failure groups (never seen before, min 2 in 30d)
  - Repeat operator × failure combos (≥3 in 90d)
  - Critical clusters in one group (≥2 in 30d)
  - Stalling open NCRs (>45 days old, min 3)
  - NPT/downtime concentration by operator (≥3 in 90d)
  Each insight is severity-ranked (Action/Watch) and clickable — it drives the Issue Trend Explorer or tracker quick-filters. This gives Tim "trends find you" while keeping his self-serve explorer for digging.
- **Ask-AI redesign**: two-pane card, suggested-question chips that auto-submit, Enter-to-ask, ranked answer rows with clickable example NCR numbers, honest mode/caveat labeling, loading state.
- **Top fold**: unified export group (PDF / Excel / Summary CSV / Individual CSV) — the floating orange CSV button is gone.
- **Org chart**: wheel zoom removed (meeting decision), explicit +/− zoom buttons added.

## 4. Tomorrow morning — before Tim's meeting (do in order)

1. Push + deploy (see AGENT-HANDOFF-TRENDWATCH-AI.md).
2. **Verify prod env**: `OPENAI_API_KEY` present in Vercel prod; set `OPENAI_MODEL` explicitly (do not rely on the default string). Smoke-test the route live with "How many AWC valve failures?" and confirm `mode: "openai"` in the response (the UI shows "Answered by NCR AI from the live report set." when real AI answered).
3. If the key is missing/broken, the feature still demos via taxonomy fallback — but set expectations with Tim accordingly.
4. Email Merci's CSV template to Tim (Andrew's action item) so his upload maps cleanly; remind him: newest reports only, the importer dedupes by report number anyway.

## 5. Phase 2 (this week) — synonym system + telemetry

1. **Alias/synonym table** (`ncr_term_aliases`: canonical, alias, kind[operator|failure|equipment]) editable from an Advanced-view admin card. Server route and client explorer both load it. Seeds: Exxon=ExxonMobil=XTO; HRU=hydraulic release unit; AWC=annular well control; 710=710 valve. This is Tim's "system needs to recognize synonyms" ask, made self-serve.
2. **Scope-aware AI**: forward the analytics scope (dates, group, criticality) to the route; filter the Supabase query with it; echo the scope back in the answer ("Within Shop, last 90 days: ...").
3. **Q&A log** (`ncr_ai_queries`: user, question, mode, answer, latency, created_at) + a small "recent questions" list under the ask box — doubles as discoverability.
4. **Rate limit**: 20 AI questions/user/hour, fallback below that; protects cost without visible friction.
5. **Trend Watch tuning**: thresholds reviewed against real data with Tim; add "dismiss/acknowledge insight" memory (localStorage first, table later).

## 6. Phase 3 (next sprint) — scale + push

1. Replace raw-row stuffing with server-side pre-aggregation (counts by failure/operator/month computed in SQL, model reasons over aggregates + sampled raw rows) — removes the 500-row ceiling permanently.
2. Scheduled Trend Watch digest: weekly email/push of new Action-severity insights via the existing cron + email infrastructure (`api/cron/daily-digest.js` pattern).
3. Embedding-based grouping for failure taxonomy (catches misspellings/novel phrasing beyond aliases); store vectors in Supabase pgvector.
4. Word-cloud / keyword association view (Tim's explicit ask) fed by the same normalized term data.

## 7. Meeting-decision conformance check (already in code)

- Images directly beneath description: ✅ evidence panel renders immediately after Event Description.
- Lifecycle ownership at bottom: ✅ last section before action buttons.
- "Operations" removed from departments: ✅ not in NCR_DEPARTMENT_GROUPS; ignored on import.
- Basic/advanced toggle: ✅ live (segmented control fixed this session).
- Scroll zoom removed: ✅ tonight (f82e943).
- Bamboo-HR-style org chart: ⏳ open item — vertical "Stacked" orientation exists; compact printable Bamboo layout is future work; Andrew owes Tim a clarification note.
- Observer vs employee ambiguity: ✅ addressed via Field Key definitions + popovers (fc33ac1).
