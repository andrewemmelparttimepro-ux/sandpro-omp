# OKRs, Projects & Product Assessments — Structure Before Build

Prepared for: Jake Feil discussion w/ Mercileidy Jimenez, Tim Dibben, Andrew Emmel
Date: 2026-06-10 · Status: DISCUSSION DRAFT — nothing here is being built yet, per Jake's direction
Purpose: define the structure, logic, required steps, and reporting BEFORE anything is requested or configured.

---

## 0. The one-page version

Three layers, one chain of accountability:

```text
COMPANY OKR (annual/quarterly, owned by Jake)
  └── DEPARTMENT OKR (Shop / Service / CP / Sales / Automation / Quality, owned by dept lead)
        └── KEY RESULTS (measurable, numeric, owned by one person)
              └── PROJECTS (incl. R&D) — the work that moves a Key Result
                    └── STAGE GATES with required forms
                          Idea → Assessment → Approved → Active → Done/Killed
                          (Assessment gate = economic eval, risk, quality forms,
                           viability review, approvals, next steps + owner)
```

Rules that make it work: every KR has exactly one owner and a number; every project must point at a KR (or be explicitly tagged "run-the-business"); no project passes the Assessment gate without the six required artifacts; rollup is computed, never hand-entered.

A key fact for this discussion: **OMP already has most of the machinery.** Objectives already support parent/child (`parent_id`), metric check-ins, members, and workflow steps. The NCR tracker already proves out the harder pattern — lifecycle stages, required forms, role-based signatures, closure blockers, audit trail, attachments-by-purpose. The product-assessment workflow is structurally the NCR closure workflow pointed at new products instead of failures. We are configuring a known pattern, not inventing one.

---

## 1. OKR structure & rollup logic

### Hierarchy (3 levels, no more)

| Level | What | Owner | Cadence |
| --- | --- | --- | --- |
| L1 Company OKR | 3–5 objectives max | Jake | Annual, reviewed quarterly |
| L2 Department OKR | 2–4 per department, each must name the L1 parent it serves | Dept lead | Quarterly |
| L3 Key Result | 2–5 per objective, numeric, single owner | Individual | Updated weekly/biweekly |

Anything that can't name its parent is either a new L1 candidate (Jake decision) or it isn't an OKR — it's a task.

### Rollup logic (computed, never typed)

- KR progress = (current − baseline) / (target − baseline), capped 0–100%.
- Objective progress = average of its KRs (option: weighted — decision #3 below).
- L1 progress = weighted average of child L2s.
- Status (On Track / At Risk / Blocked) does NOT roll up automatically — a parent can be 70% complete and still At Risk. Status is owner-asserted, with a staleness flag if a KR hasn't been checked in for 14 days.
- Projects do not add progress directly; they exist to move KRs. (Prevents "we did lots of work" replacing "the number moved.")

### Filterable views (the reporting requirement)

1. **Tree view** — L1 → L2 → KR with rollup bars, expand/collapse (the org-chart interaction pattern, already built).
2. **My OKRs** — everything I own or am a member of, flat.
3. **Filter bar** (same pattern as the NCR tracker, already built): quarter, department, owner, level, status, staleness, "has linked projects."
4. **Quarterly scorecard export** — PDF/Excel like NCR analytics exports.

## 2. Project management layer (incl. R&D)

A Project is a first-class item, distinct from an OKR: OKRs say *what outcome*, projects say *what work*.

Minimum fields: name, type (R&D / Ops / Customer / Internal), linked KR(s) — required unless flagged run-the-business, sponsor (the gate approver), project lead, stage, health (G/Y/R + comment, weekly), start/target dates, next milestone, and the required-forms checklist for its current gate.

### Stage gates

```text
IDEA        anyone can file (like Fix-It): one-paragraph concept + sponsor guess
ASSESSMENT  the six required artifacts (below) get completed
APPROVED    sponsor + required approvers signed; budget/owner committed
ACTIVE      execution; weekly health, milestones, % milestones complete
DONE        closure review: did the KR move? lessons captured
KILLED      explicitly closed with reason — a healthy outcome, not a failure
```

R&D projects use the same gates with two additions: a technical-feasibility checkpoint inside Assessment, and a "re-assess after prototype" loop (Active → Assessment is allowed for R&D only).

## 3. Product assessment — required items per Jake's list

Each is a structured form attached at the Assessment gate (NCR evidence-purpose pattern):

| # | Artifact | Owner (proposed) | Gate-blocking? |
| --- | --- | --- | --- |
| 1 | Economic evaluation — cost to develop, price, margin, volume, payback | Sponsor + Merci (finance lens) | Yes |
| 2 | Risk assessment — technical, safety, supply, customer, compliance | Project lead + Tim (quality lens) | Yes |
| 3 | Quality review forms — spec conformance, test plan, inspection reqs | Tim / Quality | Yes |
| 4 | Product viability review — market need, differentiation, fit | Sponsor | Yes |
| 5 | Required approvals — role-based signatures (sponsor, quality, finance, Jake above $ threshold) | per matrix, decision #5 | Yes |
| 6 | Next steps & ownership — first 3 milestones + named owners + dates | Project lead | Yes |

Exactly like NCR closure blockers: the UI shows "Gate blockers: Economic evaluation missing; Quality review unsigned" and the project cannot advance until the list is empty. Every form, signature, and stage change is audit-logged (NCR audit-event pattern).

## 4. Reporting we commit to (define now, build later)

1. Jake's weekly one-pager: L1 OKR rollups, projects by stage, gate items waiting on approval (with days waiting), at-risk/stale flags.
2. Department quarterly scorecard: L2 progress, KR table, linked project outcomes.
3. R&D pipeline view: idea → assessment → active funnel, with assessment artifacts status.
4. Audit pack per project: every form, approval, and stage change, exportable (the NCR detail-packet pattern).

## 5. Decisions needed in the discussion (the actual agenda)

1. **L1 OKRs** — what are the 3–5 company objectives, and is the quarter or the year the primary cadence?
2. **Who can create L2s/KRs** — open to all dept leads, or proposed-then-approved by Jake?
3. **Rollup weighting** — equal weight per KR/child, or sponsor-set weights? (Recommend: equal to start; weights are tuning, not structure.)
4. **Run-the-business work** — track in OMP as untethered projects, or keep OMP OKR-pure and leave RTB elsewhere?
5. **Approval matrix** — who must sign each assessment artifact, and what $ threshold pulls Jake in personally?
6. **Form content** — Merci and Tim each bring their current economic-eval / quality-form templates (even informal ones) so the structured forms digitize what exists rather than inventing paperwork.
7. **Kill criteria** — what auto-triggers a re-assessment (budget overrun %, missed milestones count, risk change)?
8. **Single system or split** — OMP for all three layers (recommended: the primitives exist), or OKRs in OMP + projects elsewhere (creates the visibility gap Jake is trying to close)?

## 6. What exists in OMP today vs. what's net-new

| Capability | Today | Net-new |
| --- | --- | --- |
| Parent/child objectives | ✅ `parent_id` live in schema + UI grouping | Rollup math, tree view, level semantics |
| Measurable KRs | ◐ metric check-ins exist | First-class KR entity w/ baseline/target/owner |
| Filterable views | ✅ pattern proven (NCR tracker) | Apply to OKR tree |
| Projects entity | ❌ | New table + stage field (small) |
| Stage gates w/ required forms | ✅ pattern proven (NCR lifecycle + closure blockers) | Assessment form templates |
| Role-based approvals/signatures | ✅ proven (ncr_signatures) | Approval matrix config |
| Audit trail | ✅ proven (ncr_audit_events) | Point at projects |
| Exports/reports | ✅ proven (NCR analytics) | The four reports above |

Honest estimate: this is mostly *configuration of proven patterns*, not invention. The genuinely new thinking is exactly what Jake asked us to define first: the hierarchy rules, the approval matrix, and the form contents — which is what the meeting should decide.

## 7. Proposed sequence after alignment (no build until §5 is decided)

1. Meeting → lock decisions 1–8 (this doc updated as the record).
2. Merci + Tim deliver current form templates (decision 6).
3. Andrew turns locked decisions into a data-model + UI spec — reviewed by Jake before any build.
4. Phase A: OKR hierarchy + rollups + tree/filter views. Phase B: Projects + gates. Phase C: assessment forms + approvals + reports.
