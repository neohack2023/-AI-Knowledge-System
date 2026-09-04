---
applyTo: ".github/workflows/**,public-release-manifest.yaml,docs/PUBLIC_RELEASE*.md,tests/**/*public-release*"
---

This surface governs public-release and CI boundary behavior.

Read `docs/PUBLIC_RELEASE_BOUNDARY.md`, `public-release-manifest.yaml`, root `AGENTS.md`, and relevant verifier guidance before changes.

The release manifest is allowlist-first. Unknown tracked paths fail closed. Public fixtures/examples must remain synthetic. Never admit private workspace links, personal memory, provider object IDs, secrets, private receipts, or raw private evidence.

Do not describe a workflow result as exact-candidate evidence unless the actual checkout/input binding proves the immutable candidate used. Merge refs, branch labels, and nearby matching configuration text are not substitutes for exact binding.

Green release checks are mechanical evidence only. They do not grant merge, release, deployment, capability, or authority permission.