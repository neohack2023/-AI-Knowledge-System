# Public Release Boundary

Status: implementation foundation for issue #8  
Contract: `PublicReleaseManifest/1.0`

## Purpose

The public AIOS repository distributes the governed system, not the maintainer's private workspace.

A release artifact may contain reusable runtime code, provider-neutral contracts, configuration templates, synthetic fixtures, tests, documentation, optional adapters, and explicitly reviewed binary assets. It must not contain personal memory, owner-specific project canon, live provider bindings, evidence pointers, receipts, account metadata, secrets, or credentials.

The release process is allowlist-first and fail-closed:

```text
tracked repository file
  -> recursive path classification
  -> path privacy inspection
  -> text scan or signature-validated binary admission rule
  -> exception validation
  -> unresolved finding gate
  -> privacy-safe release report
  -> publishable artifact
```

Redaction is a diagnostic and export aid. It is not permission to publish a private source object. Public examples must be generated from synthetic data rather than copied from live Notion, Drive, chat, or account exports.

## Runtime user-data boundary

This contract does **not** prohibit users from importing or processing their own files in an installed AIOS instance.

It governs what maintainers publish inside the reusable repository and release package. A deployed instance may accept user-selected files under that user's access controls, authority rules, provenance policy, and configured privacy terms. The public release ships the engine and policy framework, not one maintainer's private instance.

Text and binary files are therefore not categorically rejected. Repository release candidates must satisfy the release manifest, while runtime user files are governed by the deploying user's policy and authorization layer.

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
- The validator scans Git-tracked release candidates, not arbitrary ignored workspace files.
- A private terms file may be supplied locally through `.public-release-private-terms` or `PUBLIC_RELEASE_PRIVATE_TERMS`. The file is ignored by Git, repository-relative, denylisted, and never becomes part of the release artifact.
- Normal pull-request CI uses only a synthetic sentinel. It never exposes the configured owner-term dictionary to pull-request-controlled scripts.
- Confidential owner terms are used only in a maintainer-only private pre-merge or pre-release channel. They are never supplied to a contributor-visible GitHub workflow or reported as a pull-request check.
- Generated reports record finding type, redacted path, location, fingerprints, binary admission evidence, and rule IDs without reproducing sensitive values.

## Path policy

A file is publishable only when an allowlist rule classifies it as public. Unknown paths resolve to `UNRESOLVED` and fail closed.

Deny rules take precedence over allow rules. Tracked environment files at any directory depth, key material, local databases, provider exports, raw execution artifacts, and private-term files always block release.

Paths are inspected for private terms before they are written to the report. A private path blocks release, is redacted in diagnostics, and is represented by a SHA-256 path fingerprint.

Directory-level public rules are permitted only for repository-owned surfaces that also receive text inspection or explicit binary admission.

## Text inspection

The initial scanner blocks:

- Notion and Google Drive document or folder URLs
- common secret and token formats
- PEM private-key material
- non-synthetic email addresses
- locally or protected-CI-supplied owner-specific terms

The manifest must contain at least one content rule. An empty content-rule set is invalid because it would silently disable privacy inspection.

## Binary admission

Binary files do not pass merely because their containing directory is public.

Every releasable binary must match an explicit `binary_rules` entry that declares:

- a bounded path pattern
- permitted file extensions
- a maximum byte size
- a recognized file-format signature matching the extension
- `SIGNATURE_SIZE_AND_SHA256` inspection
- a durable review reason

The scanner validates extension-specific magic bytes and also runs blocking content rules over the binary byte stream before admission. An admitted extension with missing or mismatched signature bytes resolves to `UNRESOLVED`; a matching magic prefix cannot hide embedded ASCII secrets or owner terms. This prevents plaintext disguised as a font, image, document, or archive—and a signature-prefixed variant—from bypassing content inspection. Approved binaries are recorded with their policy ID, byte size, and SHA-256 fingerprint. A binary without a matching rule, or one exceeding its rule's size limit, also blocks release.

This is a release-packaging rule, not a universal ban on user files. Deployers may define their own reviewed binary policies for their distribution while runtime imports remain subject to user authorization and local policy.

## Exceptions

Exceptions are narrow, reviewable policy objects. Each exception must declare:

- the non-secret content rule it applies to
- an exact or bounded path pattern
- a regular expression matching only the intended public value
- explicit regular-expression flags
- a durable reason

Reserved example-domain identities are valid exception candidates. Exceptions may not target `SECRET` rules, suppress owner-term findings, disable an entire rule across the repository, or turn production provider data into a fixture.

A public URL that contains a private owner term must be renamed, omitted, or handled by a future exact-reference contract. `PublicReleaseManifest/1.0` provides no owner-term suppression mechanism.

## Release command

```text
npm run check:public-release
```

The command validates the manifest, classifies every tracked file, scans paths and allowed text files, evaluates explicit binary rules, and writes a machine-readable report to `outputs/public-release-report.json`.

The process exits unsuccessfully when it finds:

- an invalid or empty content-rule contract
- an unclassified tracked path
- a tracked denylisted file
- a private term in a release path
- sensitive content without a valid exception
- an exception targeting a secret or owner-term rule
- an unsafe private-term configuration
- an unapproved or oversized binary
- a binary extension whose file signature is absent or mismatched

## Export report

The report contains:

- manifest and policy versions
- included public files and classifications
- excluded or blocked files
- unresolved files
- redacted path and content findings
- path, value, and approved-binary fingerprints
- binary policy IDs, sizes, signature status, and content-scan status
- private-term input mode and count
- final pass/fail state

Reports are operational evidence. They are not authority, authorization, or proof that unscanned external sources are safe.

## CI gate

### Threat model

Pull-request authors control candidate paths and bytes. They may disguise plaintext secrets as an allowlisted binary extension to evade text rules, so extensions are not trusted as evidence of format. They may also submit batches of guessed names and observe a public check repeatedly; any confidential dictionary applied to that input becomes a membership oracle through diagnostics or the check's pass/fail bit. The controls below therefore fail closed on extension/signature disagreement and keep real owner-term evaluation and its outcome outside contributor-visible infrastructure.

The ordinary `pull_request` workflow runs build, tests, and the public boundary with a harmless synthetic private-term sentinel. Pull-request code never receives the configured private dictionary.

Confidential owner-term validation is deliberately not a GitHub pull-request workflow. Immediately before merge or release, an authorized maintainer uses two separate checkouts in a maintainer-only private channel:

```text
/trusted-aios-scanner   trusted base-revision validator and dependencies
/candidate-checkout     pull-request files treated strictly as data
```

Run the trusted validator directly from the trusted checkout. Do not invoke `npm`, package scripts, dependencies, JavaScript, lifecycle hooks, or other executable content from the candidate checkout.

```sh
cd /trusted-aios-scanner

PUBLIC_RELEASE_PRIVATE_TERMS="$(cat /private/path/terms)" \
node scripts/public-release/check.mjs \
  --trusted-private-terms \
  --root /candidate-checkout \
  --manifest public-release-manifest.yaml \
  --report /private/output/public-release-report.json
```

`--trusted-private-terms` requires an explicit candidate `--root` and refuses to scan the validator's own checkout. This makes the trust boundary machine-checkable: trusted code inspects candidate files without handing the confidential dictionary to candidate-controlled package scripts.

The maintainer must review the exit status and privacy-safe report privately. Neither the dictionary, detailed result, nor pass/fail status may be uploaded to public Actions artifacts, logs, comments, or commit statuses. Because applying a confidential dictionary to attacker-chosen content creates a membership oracle even when match details are hidden, this check must not be posted as a pull-request status. Ordinary CI continues to prove scanner plumbing with a harmless synthetic sentinel, but does not claim owner-specific coverage.

Synthetic tests cover nested environment files, private URLs, credentials, ordinary email addresses, owner terms in content and paths, forbidden exceptions, empty content rules, unsafe private-term paths, unapproved binaries, signature-valid approved binaries, disguised-text signature rejection, signature-prefix spoofing with embedded sensitive content, CI secret isolation, and trusted-scanner separation.

## Non-goals for this slice

- exporting the live Notion or Drive registries
- deleting or mutating private sources
- packaging a complete public AIOS distribution
- replacing provider-level access controls
- restricting what authorized users may import into their own deployed instance
- claiming that blacklist scanning alone proves privacy

This slice establishes the release membrane. Later public-AIOS work may build behind it.
