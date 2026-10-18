# Independent technical review

Two additional agents independently reviewed the local release candidate on 2026-10-17. Neither reviewed by making live provider calls.

## Release and security review

Checked privacy, package boundaries, asset references, local HTTP services, generated-app isolation and dependencies. All 80 sound-manifest cues have matching assets. No inherited Git commits or remote are configured.

Findings fixed:

- Updated Vite to 7.3.7 and esbuild to 0.28.2; the dependency audit reports zero known vulnerabilities. Relevant upstream advisories: [Vite Windows path disclosure](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff), [esbuild Windows file read](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr).
- Enforced CSP before generated computer-app markup, retaining the opaque-origin script sandbox. Browser checks confirm fetch, external scripts and external images are blocked while local scripts run and browser storage remains isolated.
- Added local Host/Origin/content-type guards, bounded request/response handling, cancellation and sanitized diagnostics to optional provider services.
- Removed the excluded disk-memory service from the normal sensory-recall path; standalone recall uses actual browser-recorded events and excludes heartbeat telemetry.
- Fixed modal layering so the brain panel cannot intercept clicks on computer apps.
- Moved imported water-variant data out of the public asset directory for compatibility with patched Vite, and isolated development watching from test/runtime files.

## Brain architecture and integration review

Checked the guides, example graph and agent instructions against the actual graph validation, recall, visualization, experience rules and provider contracts. The starter validates and recalls its two associated routes.

Findings fixed:

- Globally unique node/pathway IDs are enforced.
- Hierarchical graphs require valid eras and exact single-year `year-YYYY` anchors.
- Instructions explain build-time installation, public visibility of graph JSON, separate session history, graph-version IDs, and the motor-policy change from adding behavior facets.
- Provider instructions describe server-only keys, model alias mapping, preserved roles, text-part normalization, image support, exact response envelopes and static-host backend requirements.

## Responsiveness follow-up

The standalone page initially had no running brain service and AI was off by default. Explicit status feedback now distinguishes those conditions from a pending reply.

Both reviewers also identified serialized vision work, duplicated unbounded context, thought-only intercom responses, and stale adapter work after cancellation. These were addressed with compact conversation prompts, bounded prioritized context, heartbeat filtering, required spoken replies, queued follow-up questions, bounded deadlines, and cancellation propagation. Tests use mocked providers.

## Service-neutral onboarding

The default biography retains all authored nodes, routes, associations and behavior, with a neutral Agent identity. Agent naming, model routing and API-key/OAuth/local-server access are configured independently on the backend. API and OAuth tests use mocks; no live account compatibility is claimed.

Final verification: 78 tests passed, production build passed, privacy scan had zero findings, and dependency audit reported zero known vulnerabilities. Browser checks with mocked services confirmed configured names in the heading and dialogue, two consecutive answered questions without cancellation, remembered AI preference, OAuth sign-in controls, isolated popup opener, reuse of an existing connection, and logout. Source and built output were scanned for residual original service/model identities, with no matches.

## Remaining public-release decisions

A later pacing check passed 81 tests. A private local test profile, kept outside the publishable source, produced a real dialogue reply through the scene in 8.4 seconds with the full default biography loaded, one request, and no heartbeat journal snapshots. Inference is now paced by wall-clock time: 30-second background default, coalesced physical events, and priority for questions. This does not establish compatibility with every provider or OAuth service.

The technical review does not supply a source license, prove sound redistribution rights, or verify a real provider account/model. Those remain listed in `RELEASE-REVIEW.md`. No public upload or commit has been made.

## Fresh observation verification

All 96 tests passed after adding aim/settle/capture/report actions, concurrent capture cancellation, and canonical 1280?720 capture. Production build and privacy scan passed with zero findings. A private live browser test placed the cube on the bed and issued the previously failing look command. The actual captured frame visibly included the cube; the optical model identified its white top, red face and blue edge, and the agent spoke that observation after the action. No credentials, private harness, or test screenshots are included in the publication files.
