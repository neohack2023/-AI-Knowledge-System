# Repository-Local Skills Boundary

This directory is reserved for **repository-local procedural skill projections** that materially help agents work in this codebase.

Bootstrap rule: do not copy the external/global AIOS skill library into Git.

A repository-local skill should exist only when:

- the procedure is specific enough to this repository to justify local loading;
- it can be public without exposing private bindings or memory;
- its inputs/outputs and failure stops are testable;
- it does not duplicate an existing command, role, or verifier contract;
- it does not grant authority merely by being called a skill.

Until such a need is validated, keep this directory as the boundary definition rather than manufacturing decorative skills.
