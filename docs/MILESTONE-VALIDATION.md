# Milestone Validation SOP

## Purpose
- Ensure each milestone has a repeatable quality gate.
- Keep a traceable record of findings, fixes, and validation evidence.

## Rule
- Every milestone must produce one validation report in `docs/` before merge/release.
- Naming rule: `MILESTONE-YYYY-MM-DD-<topic>.md`.

## Required Checks
1. Scope and goal alignment check
2. Core workflow smoke test
3. Data correctness and regression check
4. Security/configuration check (keys, auth, quotas)
5. Performance and reliability quick check
6. Documentation consistency check

## Required Report Sections
1. Milestone context (goal, branch/commit, date)
2. What was validated
3. Findings (ordered by severity)
4. Fix plan and owner
5. Validation evidence (commands/logs/screenshots)
6. Release decision (`pass` / `pass_with_risk` / `block`)

## Acceptance Gate
- `P0/P1` findings must be fixed before release.
- `P2/P3` findings can be deferred only if tracked with action items.
- Report must include explicit next-step deadlines.
