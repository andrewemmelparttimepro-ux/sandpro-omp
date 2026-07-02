# SandPro OMP NCR Gap Review for Tim Dibben

Prepared for: Tim Dibben, Quality Control Manager  
Purpose: establish the next NCR build decisions before expanding the current NCR module.

## Current Baseline

The current NCR module supports creating, viewing, updating, and exporting NCR records from SandPro OMP. Reports can carry structured fields, attachments/evidence, owner assignment, follow-up due dates, status, and objective handoff.

This baseline is useful for capturing NCR work, but a production quality system usually needs more than ownership and export. The next build should be reviewed with Tim before major workflow changes are locked in.

## Review Areas

### 1. Lifecycle Stages

Current question: what exact statuses should an NCR move through at SandPro?

Suggested review options:
- Draft
- Submitted
- Under review
- Containment required
- Root cause analysis
- Corrective action assigned
- Effectiveness verification
- Closed
- Reopened

Tim decision needed: which stages are required, who can move each stage, and whether any stage requires fields before advancing.

### 2. Effectiveness Verification

Current question: after corrective action is completed, how does SandPro prove it worked?

Suggested review fields:
- verification owner
- verification due date
- verification method
- pass/fail result
- evidence attachment
- verification notes

Tim decision needed: whether effectiveness verification is mandatory for every NCR or only selected severity/type levels.

### 3. Audit Trail

Current question: what changes must be preserved for compliance and internal review?

Suggested audit events:
- NCR created
- owner changed
- status/stage changed
- due date changed
- severity changed
- attachment added/removed
- corrective action updated
- closure/reopen events

Tim decision needed: which changes require audit history, and whether edits should be locked after closure.

### 4. Trend Tracking

Current question: which dimensions matter for recurring NCR analysis?

Suggested dimensions:
- department/group
- customer or supplier
- product/service line
- failure category
- root cause category
- severity
- repeat issue flag
- month/quarter
- owner

Tim decision needed: the trend categories SandPro actually uses, so reporting is useful instead of noisy.

### 5. Attachments and Evidence

Current question: what evidence types should be standard?

Suggested support:
- photos
- PDFs
- inspection documents
- customer communication
- supplier documents
- before/after evidence
- voice notes where useful

Tim decision needed: whether any evidence is required by NCR type or stage.

### 6. CAPA-Style Follow-Up

Current question: should the NCR module include formal corrective/preventive action tracking?

Suggested structure:
- containment action
- root cause
- corrective action
- preventive action
- action owner
- due date
- completion proof
- verification result

Tim decision needed: whether SandPro wants full CAPA behavior now, a lighter NCR-only model, or a phased approach.

### 7. Export and Reporting Needs

Current question: what outputs does SandPro need beyond CSV?

Suggested outputs:
- filtered CSV export
- printable PDF summary for one NCR
- monthly NCR trend report
- open NCR action list
- overdue corrective action report
- closure/effectiveness report
- audit trail export

Tim decision needed: which reports are needed for daily work, leadership review, and outside/customer documentation.

## Recommended Next Build After Tim Review

1. Lock the SandPro NCR lifecycle and permissions.
2. Add required fields and stage gates only where Tim confirms they are operationally necessary.
3. Add audit trail events for status, owner, due date, evidence, and closure changes.
4. Add effectiveness verification for the confirmed NCR types.
5. Add reporting outputs in this order: open actions, overdue actions, trend summary, single-NCR PDF, audit export.

## Non-Decision Until Tim Confirms

Do not hard-code a full CAPA workflow, severity matrix, or stage-gated closure process until Tim reviews the module. The current priority is a bugless baseline plus a clear expansion path.
