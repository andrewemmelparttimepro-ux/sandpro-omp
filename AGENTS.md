# SandPro OMP Agent Instructions

Read `AGENT.md` before any Fix-It Feed work.

## Fix-It Feed authorship boundary

The Fix-It Feed is human problem intake. An Agent never creates, inserts,
auto-files, delegates, or backfills a Fix-It post for any reason, including a
problem the Agent already fixed, telemetry, an off-wall report, a postmortem,
validation evidence, or QA.

Agents may work only on existing human-created posts: claim clear safe work,
reply briefly when the human needs an answer or decision, fix and validate the
problem, attach proof, and mark validation complete. Agents never archive unless
Andrew explicitly asks in the current task.

If no human-created Fix-It post exists, make no Fix-It mutation. Report off-wall
work through its original channel and the Codex task instead.
