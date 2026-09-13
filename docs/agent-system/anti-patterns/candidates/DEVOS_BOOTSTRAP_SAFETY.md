# DevOS Bootstrap Safety Candidates

## `AP-DEVOS-BOOTSTRAP-001` — Scaffold path escapes repository boundary
- **Domain:** DevOS bootstrap / filesystem mutation.
- **Source evidence:** merged head `a407607c2ed89f54d6d05c138daa20392f91e9ee`; PR #86 review comment `4000767854`; reviewed candidate `e6249da57dc4de5f91a5f9cae1c8a67939116d73`.
- **Evidence state:** `CONFIRMED`.
- **Promotion state:** `NONE`.
- **Observed behavior:** a caller-controlled `--devos-root` containing parent traversal could normalize generated scaffold targets outside the authorized repository root.
- **Why it looked reasonable:** `path.join()` appears to compose a repository-relative path but also normalizes `..` segments.
- **Actual failure:** repository-scoped write authority could escape into a sibling path.
- **Detection method:** post-merge review of the compiler mutation boundary.
- **Repair pattern:** validate the DevOS root and every generated target as contained by the resolved repository root before any directory or file mutation.
- **Regression guard:** reject absolute or parent-traversing DevOS roots and assert no outside path is created.
- **Recurrence evidence:** first confirmed local episode.

## `AP-DEVOS-BOOTSTRAP-002` — Missing target root treated as empty repository
- **Domain:** DevOS bootstrap / target resolution.
- **Source evidence:** merged head `a407607c2ed89f54d6d05c138daa20392f91e9ee`; PR #86 review comment `4000767855`; reviewed candidate `e6249da57dc4de5f91a5f9cae1c8a67939116d73`.
- **Evidence state:** `CONFIRMED`.
- **Promotion state:** `NONE`.
- **Observed behavior:** a nonexistent `--root` was converted into an empty inventory, allowing `--apply` to create a scaffold at an unintended path.
- **Why it looked reasonable:** tolerant discovery helpers made inventory convenient for optional subpaths but were accidentally reused for the repository identity boundary.
- **Actual failure:** a typo could become a new filesystem target instead of a fail-closed resolution error.
- **Detection method:** post-merge review of repository-root resolution.
- **Repair pattern:** require the target repository root to exist and be a directory before inventory or mutation.
- **Regression guard:** nonexistent and non-directory roots must reject before creating any path.
- **Recurrence evidence:** first confirmed local episode.

## `AP-DEVOS-BOOTSTRAP-003` — Directory existence mistaken for coherent DevOS
- **Domain:** DevOS bootstrap / resumability.
- **Source evidence:** merged head `a407607c2ed89f54d6d05c138daa20392f91e9ee`; PR #86 review comment `4000767857`; reviewed candidate `e6249da57dc4de5f91a5f9cae1c8a67939116d73`.
- **Evidence state:** `CONFIRMED`.
- **Promotion state:** `NONE`.
- **Observed behavior:** existence of `devos/` or `.devos/` alone was treated as a complete operating layer, so an interrupted bootstrap could permanently no-op on the next run.
- **Why it looked reasonable:** path presence is a cheap idempotency signal, but it says nothing about semantic completeness.
- **Actual failure:** partial bootstraps and unrelated directories could be misclassified as accepted DevOS state.
- **Detection method:** post-merge review of compiler idempotency behavior.
- **Repair pattern:** distinguish coherent DevOS, incomplete known bootstrap, and path conflict; repair known incomplete bootstraps non-destructively and fail closed on unrelated path conflicts.
- **Regression guard:** interrupted bootstrap must resume to completion; empty/unrecognized `devos/` must not be accepted as DevOS.
- **Recurrence evidence:** first confirmed local episode.
