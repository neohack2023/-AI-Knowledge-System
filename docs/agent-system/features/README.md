# Feature Dossiers

Feature dossiers are repository-local provenance maps for **material** features. They are not required for every trivial typo or one-line maintenance change.

Use a dossier when the work has meaningful architecture, risk, multiple repair/review rounds, special verifier obligations, durable lessons, or external governance anchors worth preserving.

## What a dossier owns

- stable feature ID and concern;
- repository-safe source-intent summary;
- public-safe external governance IDs when useful;
- frozen base SHA and branch/PR binding;
- touched areas and non-goals;
- role assignments and decisions;
- historical reviewed/verified head evidence;
- repair rounds and breaker state;
- anti-pattern candidates;
- terminal disposition and promoted rules.

## What it does not own

- current live PR head;
- branch contents;
- CI truth;
- merge state;
- private workspace records.

Those remain live GitHub/external-authority facts.

## Self-reference rule

Do not require a tracked dossier to contain the SHA of the commit that contains that dossier. Resolve current head live from GitHub. Record immutable **historical** heads only after they become evidence anchors.

Copy `FEATURE_DOSSIER_TEMPLATE.md` into `docs/agent-system/features/<FEATURE_ID>/manifest.md` when a material feature begins.
