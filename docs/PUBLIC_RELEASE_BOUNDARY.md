# Public Release Boundary

Status: implementation foundation for issue #8  
Contract: `PublicReleaseManifest/1.0`

## Purpose

The public AIOS repository distributes the governed system, not the operator's private knowledge.

A release artifact may contain reusable runtime code, provider-neutral contracts, configuration templates, synthetic fixtures, tests, documentation, and optional adapters. It must not contain personal memory, owner-specific project canon, live provider bindings, evidence pointers, receipts, account metadata, secrets, or credentials.

The release process is allowlist-first:

```text
tracked repository file
  -> recursive path classification
  -> path privacy inspection
  -> content inspection
  -> exception validation
  -> unresolved finding gate
  -> privacy-safe release report
  -> publishable artifact
```

Redaction is a diagnostic and export aid. It is not permission to publish a private source object. Public examples must be generated from synthetic data rather than copied from live Notion, Drive, chat, or account exports.

## Required classifications

Every candidate artifact resolves to exactly one classification:

- `PUBLIC_CORE`: provider-neutral runtime, contracts, schemas, and implementation code.
- `PUBLIC_TEMPLATE`: configuration, workflow, adapter, deployment, and documentation templates with no live bindings.
- `PUBLIC_SYNTHETIC_FIXTURE`: invented examples used for demos and tests.
- `PRIVATE_KNOWLEDGE`: personal memory, project canon, conversations, preferences, or private operational history.
- `PRIVATE_BINDING`: provider-native IDs, URLs, workspace mappings, account identifiers, or live authority bindings.
- `PRIVATE_EVIDENCE`: receipts, source manifests, evidence pointers, private traces, or execution artifacts from the owner's system.
- `SECRET`: credentials, tokens, private keys, cookies, and authentication material.
- `UNRESOLVED`: an artifact whose release safety cannot be established.

`UNRESOLVED`, every private classification, and `SECRET` block release.

## Source-of-truth rules

- `public-release-manifest.yaml` is the repository-owned allowlist and policy declaration.
- `schemas/PublicReleaseManifest.schema.json` defines the public manifest contract.
- The validator scans Git-tracked files, not arbitrary ignored workspace files.
- A private terms file may be supplied locally through `.public-release-private-terms` or `PUBLIC_RELEASE_PRIVATE_TERMS`. The file is ignored by Git and never becomes part of the release artifact.
- GitHub Actions injects `PUBLIC_RELEASE_PRIVATE_TERMS` from the repository secret first, then the repository variable. When neither is configured, CI uses a synthetic sentinel and reports `SENTINEL_ONLY` rather than claiming owner-specific coverage.
- Generated reports record finding type, redacted path, location, fingerprints, and rule ID without reproducing full sensitive values.

## Path policy

A file is publishable only when an allowlist rule classifies it as public. Unknown paths resolve to `UNRESOLVED` and fail closed.

Deny rules take precedence over allow rules. Tracked environment files at any directory depth, key material, local databases, provider exports, raw execution artifacts, and private-term files always block release.

Paths are inspected for private terms before they are written to the report. A private path blocks release, is redacted in diagnostics, and is represented by a SHA-256 path fingerprint.

Directory-level public rules are permitted only for repository-owned source surfaces whose contents are also scanned. A future folder that may mix public and private objects must use narrower file-level rules.

## Content inspection

The initial scanner blocks:

- Notion and Google Drive document or folder URLs
- common secret and token formats
- PEM private-key material
- non-synthetic email addresses
- locally or CI-supplied owner-specific terms

The scanner is intentionally extensible. Provider adapters may register additional public-boundary checks, but they may not weaken core rules.

## Exceptions

Exceptions are narrow, reviewable policy objects. Each exception must declare:

- the non-secret content rule it applies to
- an exact or bounded path pattern
- a regular expression matching only the intended public value
- a durable reason

Reserved example-domain identities are valid exception candidates. Exceptions may not target `SECRET` rules, suppress owner-term findings, disable an entire rule across the repository, or turn production provider data into a fixture.

A public URL that contains a private owner term must be renamed, omitted, or handled by a future exact-reference contract. The current `PublicReleaseManifest/1.0` deliberately provides no owner-term suppression mechanism.

## Release command

```text
npm run check:public-release
```

The command validates the manifest, classifies every tracked file, scans paths and allowed text files, and writes a machine-readable report to `outputs/public-release-report.json`.

The process exits unsuccessfully when it finds:

- an invalid manifest
- an unclassified tracked path
- a tracked denylisted file
- a private term in a release path
- sensitive content without a valid exception
- an exception targeting a secret or owner-term rule
- an invalid private-term rule

## Export report

The report contains:

- manifest and policy versions
- included public files and classifications
- excluded or blocked files
- unresolved files
- redacted path and content findings
- path and value fingerprints
- private-term input mode and count
- final pass/fail state

Reports are operational evidence. They are not authority, authorization, or proof that unscanned external sources are safe.

## CI gate

The normal test command and the dedicated public-boundary job both receive the configured private-term dictionary. The dedicated job produces downloadable TAP and boundary-report diagnostics.

A configured repository secret named `PUBLIC_RELEASE_PRIVATE_TERMS` is preferred. A repository variable with the same name is accepted for non-sensitive test terms. The synthetic fallback proves plumbing only and is clearly reported as `SENTINEL_ONLY`.

Synthetic tests inject nested environment files, private URLs, credentials, ordinary email addresses, owner terms in content, owner terms in paths, and forbidden exceptions. Equivalent synthetic content must continue to pass.

## Non-goals for this slice

- exporting the live Notion or Drive registries
- deleting or mutating private sources
- packaging a complete public AIOS distribution
- replacing provider-level access controls
- claiming that blacklist scanning alone proves privacy

This slice establishes the release membrane. Later public-AIOS work may build behind it.
