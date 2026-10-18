# Staged refactor results

This records the implementation of issue #8 from baseline commit `d14e4339a2ba54ef81a4dcca4b0323287ef964f3`. The work was kept in focused commits so each responsibility can be reviewed or reverted independently.

## Implemented stages

1. Added mocked Chromium smoke coverage and enabled CI.
2. Pinned Prettier in a formatting-only change.
3. Moved browser/session persistence behind `src/cell/storage/session-store.js` while preserving existing keys and reset/undo behavior.
4. Extracted connection, intercom, HUD, and computer UI controllers.
5. Extracted application lifecycle, thought scheduling, action queueing, and speech coordination with injectable clocks/dependencies.
6. Split service-neutral AI client, connection state, prompts/parsers, vision, and creative generation boundaries.
7. Propagated cancellation through creative requests, capture, workers, and lifecycle teardown.
8. Added one supported-action catalog shared by prompts, operator command parsing, and dispatch while preserving legacy aliases.
9. Added explicit `completed`, `blocked`, `unavailable`, `cancelled`, and `failed` action outcomes; learning no longer infers truth from prose.
10. Extracted renderer-free room constants and feature/navigation metadata while retaining `world.js` compatibility exports.
11. Extracted POV capture queue/projection and geometry support helpers from the renderer.
12. Kept `tools/api-server.mjs` as the CLI entry while extracting configuration, active connection state, request validation, and upstream transport.
13. Re-ran reference checks, formatting, tests, brain validation, build, privacy scan, and dependency audit; documented comparable measurements below.

## Verification

Final local checks on this branch:

- Node tests: **126 passing tests across 29 test files** (baseline: 104 across 21).
- Formatter check: pass.
- Default brain: unchanged at **693 nodes, 303 pathways, 554 associations**, graph id `default-life-1990-v3`.
- Production build: pass.
- Privacy scan: **0 findings** across 247 publication candidates.
- Dependency audit: **0 reported vulnerabilities**.
- Browser suite: present in CI and covers desktop, portrait, short landscape, connection/disconnection, consecutive replies, fresh inspection, computer, reset/restore, external requests, and page errors. Local execution on the implementation VM was blocked by missing Chromium system libraries (`libglib`, NSS/X11/GBM/ATK family); the VM has no `sudo`. Chromium itself was downloaded successfully. The checked-in CI installs Chromium with its dependencies before running the suite.

## Comparable build measurements

Measurements below use the same Vite build command as the baseline. Modularity is not treated as a performance improvement.

| Artifact | Baseline | After refactor | Change |
| --- | ---: | ---: | ---: |
| Production entry JS | 1,143.57 kB (344.27 kB gzip) | 1,148.57 kB (346.41 kB gzip) | +5.00 kB raw, +2.14 kB gzip |
| Default-brain chunk | 348.40 kB (44.51 kB gzip) | 348.40 kB (44.51 kB gzip) | unchanged |
| Creation worker | 745.97 kB | 745.97 kB | unchanged |
| Main CSS | 10.85 kB (3.14 kB gzip) | 10.85 kB (3.14 kB gzip) | unchanged |

The entry increase is small but real, so this refactor does **not** claim a startup or bundle-size improvement. Its measured benefit is separation/testability. Browser timing/transfer deltas should be recorded later in an environment that can execute the pinned Chromium suite and compared only against the same browser and operating setup.

## Responsibility size snapshot

These source sizes are only a maintainability signal, not a runtime metric:

- `src/cell/main.js`: 60,262 bytes.
- `src/cell/mind.js`: 10,444 bytes after moving AI boundaries out.
- `src/cell/world.js`: 57,920 bytes after definition/capture/geometry extraction.
- `tools/api-server.mjs`: 4,774 bytes after backend responsibility extraction.

`actions.js` remains intentionally substantial because behavior-specific executors are still co-located behind the new catalog/result boundary. Further splitting should be behavior-driven and tested, rather than moving code solely to reduce file length.
