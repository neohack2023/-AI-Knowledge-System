# AI Knowledge System

This repository is the public implementation surface for the AI Knowledge System / AIOS runtime and cockpit. It combines a Vinext/Cloudflare application with provider-neutral execution, provenance, capability, verification, public-release, and reusable-code contracts.

## Repository orientation

- `AGENTS.md` is the canonical repository-local instruction map for coding agents.
- `docs/README.md` routes readers to the smallest relevant repository documentation set.
- `server/coding-harness/` contains verifier-owned acceptance and receipt logic; read its nested `AGENTS.md` before changing that subtree.
- `docs/VERIFIER_OWNED_ACCEPTANCE_RUNTIME.md` explains verifier authority and exact artifact/head binding.
- `docs/PUBLIC_RELEASE_BOUNDARY.md` and `public-release-manifest.yaml` define what may be published from this public repository.
- `.github/workflows/ci.yml` verifies the exact pull-request head and emits CodingHarness evidence.
- `docs/plans/` holds bounded task plans; a plan is task context, not automatically permanent architecture.

Repository files must remain safe for public release. Do not commit private workspace content, personal memory, live provider bindings, credentials, owner-specific evidence, or private execution artifacts.

## Runtime foundation

The web application runs on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This repository does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `server/` contains AIOS runtime and verification surfaces
- `worker/` contains repository-owned worker entry points
- `shared/` contains provider-neutral contracts and utilities
- `schemas/` contains versioned public schemas
- `tests/` contains synthetic contract and regression tests
- `reusable-code/` contains the governed reusable-code lane
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from `oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, and run the repository test suite
- `npm run lint`: run repository linting
- `npm run check:public-release`: validate the allowlist-first public release boundary
- `npm run coding-harness:receipt -- <input.json>`: derive verifier-owned acceptance receipts from execution evidence
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as a blind repeated pre-checkpoint loop.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Contribution and review discipline

Keep pull requests focused on one coherent concern, include exact-head verification evidence, and preserve non-goals. Automated model review is advisory evidence, not terminal acceptance. Trust-bearing gate, review, transition, risk, and owner-authorization state must remain bound to the candidate it describes. Bounded repair loops stop for adjudication when their configured breaker is exhausted.

See `.github/pull_request_template.md` for the repository handoff fields used to make that state explicit.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)