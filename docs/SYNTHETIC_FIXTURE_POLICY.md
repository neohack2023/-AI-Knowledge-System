# Synthetic Fixture Policy

## Rule

Public AIOS fixtures are invented test objects. They are never redacted copies of the operator's live memory, project registries, provider exports, evidence, receipts, conversations, or account configuration.

## Allowed fixture content

Synthetic fixtures may contain:

- generic scope keys such as `global`, `research-lab`, and `repository-demo`
- invented aliases that do not reproduce real project names
- reserved example-domain email addresses
- generated UUIDs and fingerprints that are not copied from provider objects
- fictional capabilities, workflows, source objects, events, approvals, and receipts
- reversible local filesystem mutations inside a disposable test directory
- explicit invalid, stale, ambiguous, blocked, and conflicting examples

## Prohibited fixture content

Fixtures must not contain:

- names, biographies, preferences, contacts, or creative personas from the operator's system
- production project names, aliases, scope mappings, handoffs, or canon
- live Notion, Drive, GitHub-private, database, chat, or MCP object identifiers
- copied source manifests, write plans, execution receipts, or evidence links
- credentials, cookies, tokens, private keys, workspace IDs, or authenticated exports
- screenshots or samples derived from private data, even when visually blurred

## Generation

Fixture generators must start from a declared synthetic seed and a public contract version. Generated IDs should use a deterministic test namespace or a fresh random namespace created for the test run.

A fixture should state:

- contract name and version
- synthetic scope
- purpose of the example
- expected validation result
- whether the object is valid, invalid, stale, ambiguous, blocked, or superseded

## Exception process

A content-scanning exception is acceptable only when the value is intentionally public and cannot be represented synthetically. Each exception must be added to `public-release-manifest.yaml` with:

- a unique exception ID
- the exact content rule being narrowed
- the smallest path pattern that needs the exception
- a regular expression that matches only the intended public value
- a reason explaining why the value is public and necessary

Exceptions require code review. They may not suppress secret detection, disable a rule repository-wide without a bounded value pattern, or authorize publication of live provider data.

## Owner-specific terms

Owner-specific terms are supplied locally through `.public-release-private-terms` or the `PUBLIC_RELEASE_PRIVATE_TERMS` environment variable. The local file is ignored by Git.

Use one term per line or comma-separated environment values. Terms shorter than three characters are rejected because they create unsafe broad matches.

The resulting release report records only a rule instance and a SHA-256 fingerprint of the matched value. It does not reproduce the private term.

## Review checklist

Before accepting a fixture:

1. Confirm that its source is synthetic.
2. Confirm that its scope and aliases do not map to a real operator project.
3. Confirm that provider IDs and evidence pointers were generated rather than copied.
4. Run `npm run check:public-release` with the local private-term dictionary loaded.
5. Inspect the report for unresolved paths and sensitive findings.
6. Keep the fixture in Review until the boundary check and its contract tests pass.
