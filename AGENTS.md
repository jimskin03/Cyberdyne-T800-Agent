# Working on Cell Scene

This repository is the standalone cell scene. Read README.md and RELEASE-REVIEW.md before changing release scope.

- Personalization: read `docs/CUSTOMIZATION.md`. The full default fictional JSON brain ships with the package; retain it unless the user wants another character. Distinguish the coding agent editing source from the embodied agent using supported actions.
- Scenarios: follow `docs/SCENARIOS.md`. There is no existing general scenario loader. Keep world geometry, collision/navigation data, target resolution, sensors, prompts, UI, shortcuts and production entries consistent; isolate saved state between scenarios.
- Features: follow `docs/EXTENDING.md`. Implement real state changes and truthful results, wire the supported action catalog and dispatcher together, preserve cancellation and request pacing, and document meaningful limitations.

- JSON brain work: follow `docs/JSON-BRAIN.md`, begin with `examples/brain.starter.json`, and validate through the actual runtime with `npm run brain:validate -- path/to/brain.json "query"`.
- API work: follow `docs/API-INTEGRATION.md`. Configure the user's chosen service through API-key, OAuth or local-server authentication. Keep API keys, OAuth client secrets and tokens only in the backend; ignored local `.env` may hold configuration and secrets. Never print key values, copy private configuration into source, or use frontend `VITE_*` variables for secrets.
- Preserve the separation between authored biography, recorded cell events, current sensor observations, model proposals and executed action results. Canonical backstory must not become a log of model guesses.
- Keep agent names and routing neutral: use configurable `AGENT_NAME`, with internal `agent`, `vision`, and `creative` model aliases. Do not insert service brands, account identities or real model IDs into frontend labels or fictional biography. Map provider models and authentication on the server. Preserve the `/llm` contract, message roles, text/image support, request bounds, cancellation and sanitized errors. Consult the named provider's official documentation before implementing its API. Preserve OAuth PKCE/state validation and server-only token handling. Test providers with mocks unless live calls are part of the user's request.
- Keep local servers bound to loopback, AI disabled by default, browser storage isolated, and generated apps sandboxed. Do not reconnect donation wallets, account-connected browsing, private profiles or excluded services as an incidental fix.
- Do not import original Git history, personal logs, saved worlds, model caches, output, backups or credentials. Keep private provenance outside the repository.
- Run `npm test`, `npm run build`, `npm run brain:validate`, `npm audit`, and `npm run privacy:check` for relevant release work. Exercise modified browser flows. Do not publish or claim open-source licensing while license and asset-rights decisions remain unresolved.

User instructions in the current session take precedence. Do not invent approval requirements for ordinary local edits or mocked tests.
