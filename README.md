# Cyberdyne T800 Agent Embodiment Project

[![Verify project](https://github.com/jimskin03/Cyberdyne-T800-Agent/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jimskin03/Cyberdyne-T800-Agent/actions/workflows/ci.yml)

A standalone Three.js containment-cell scene with a procedural T-800 robot, movable objects, physics, tool controls, water effects, climate controls, and a built-in computer. You can explore it offline, or connect your own agent through an API key, OAuth, or a local endpoint.

This repository is a fork of [newbmechanix-ship-it/Cyberdyne-T800-Agent-Embodiment-Project](https://github.com/newbmechanix-ship-it/Cyberdyne-T800-Agent-Embodiment-Project). It adds the responsive and minimizable UI, browser CI, and the staged refactor from issue #8.

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
git clone https://github.com/jimskin03/Cyberdyne-T800-Agent.git
cd Cyberdyne-T800-Agent
npm ci
npm run dev
```

Open http://127.0.0.1:5340 and select **Open the feed**. No API key is needed: the offline scene uses browser speech and browser storage, and AI starts off for a new visitor. **Reset session memory** starts fresh with AI off; **Restore previous session** restores the one local undo slot.

`npm run build` writes a static production build to `dist/`, and `npm run preview` serves it on http://127.0.0.1:5340.

## Using the interface

- **Desktop:** the **−** button on JSON Brain, Mind Stream, Thoughts, or Dialogue minimizes that panel independently, leaving its title or label visible; **+** restores it. Minimizing keeps the conversation, settings, and memory selection, and the intercom stays available. To move the JSON Brain box, drag its title bar (no hold needed; the minimize button stays clickable). You can also focus the title bar and use the arrow keys, or press **Home** to reset its position.
- **Phones and short landscape screens:** **Controls** opens the operator settings, including **AI mind**, and **Memory** opens the interactive JSON brain. Each panel scrolls and has a **Close** button (Escape also closes it). Selecting a tool closes Controls so you can tap the unit.
- **Keyboard:** 1–8 arm a tool, G grapple, C his computer, V swap POV, P punk, B baby, M mute, H hide UI.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on 127.0.0.1:5340, proxying `/llm` to the backend |
| `npm run build` / `npm run preview` | Production build to `dist/` and local preview |
| `npm run api` (alias `npm run brain`) | Optional AI backend adapter on loopback port 18081, reading `.env` |
| `npm test` | Node unit and integration tests (`test/*.test.mjs`) |
| `npm run test:browser` | Playwright Chromium smoke tests against a mocked model server |
| `npm run format:check` / `npm run format` | Prettier check or fix for `src/cell/main.js` and `src/cell/actions.js` |
| `npm run brain:validate` | Validate a JSON brain through the runtime |
| `npm run privacy:check` | Scan publication candidates for secrets, emails, and local paths |
| `npm audit` | Dependency vulnerability audit |

The browser tests start `test/browser/mock-llm.mjs` and the dev server themselves. They need Playwright's Chromium (`npx playwright install --with-deps chromium`). The privacy check needs Git. It reports file names and line numbers without printing matched values, and a clean scan does not guarantee that all personal information was found.

## Project structure

The issue #8 staged refactor split the former large modules into tested boundaries. See [the refactor baseline](docs/refactor-baseline.md) and [the staged refactor results](docs/refactor-results.md) for details and measurements.

| Path | Responsibility |
| --- | --- |
| `src/cell/main.js` | Scene entry point that wires the modules together |
| `src/cell/app/` | App lifecycle, thought scheduling, action queue, speech coordination |
| `src/cell/ai/` | Service-neutral LLM client, connection state, prompts, parsers, creative generation |
| `src/cell/actions/` | Shared supported-action catalog and explicit action results (`completed`, `blocked`, `unavailable`, `cancelled`, `failed`) |
| `src/cell/actions.js` | Behavior-specific action executors |
| `src/cell/ui/` | Connection, intercom, HUD, and computer controllers |
| `src/cell/world/` | Renderer-free room definition, POV capture, geometry helpers (`world.js` keeps the renderer) |
| `src/cell/storage/` | Browser session persistence with reset and undo |
| `src/cell/responsive-ui.*`, `panel-minimize.*`, `panel-drag.*` | Compact layout, panel minimize, and draggable JSON Brain |
| `tools/api-server.mjs`, `tools/api/` | Backend CLI plus config, connection state, request validation, and upstream transport |
| `test/`, `test/browser/` | Node tests and Playwright smoke tests with a mock LLM |

## Included brain and personalization

The full [default JSON brain](src/cell/default-brain.json) ships in the repository and the built app: **693 memory nodes, 303 pathways, and 554 associations**. It is an authored, fictional simulated biography that is independent of any AI service. The whole graph stays local; only selected, bounded recall enters a provider prompt. You can keep it, adapt it, replace it, or start from [the starter example](examples/brain.starter.json):

```sh
npm run brain:validate -- examples/brain.starter.json "repair radio"
```

| Guide | Use it to |
| --- | --- |
| [Personalization](docs/CUSTOMIZATION.md) | Choose a character and experience, and brief your coding agent |
| [JSON brains](docs/JSON-BRAIN.md) | Author biography, pathways, associations and evidence-based tendencies |
| [API and OAuth](docs/API-INTEGRATION.md) | Connect and name your own agent using your chosen service |
| [New scenarios](docs/SCENARIOS.md) | Build another setting with consistent physics, perception, actions and memory |
| [New features](docs/EXTENDING.md) | Add interactions, sensors, controls and backend capabilities |

[AGENTS.md](AGENTS.md) gives coding agents the repository architecture and verification rules.

## Connecting an AI mind (optional)

1. Copy `.env.example` to `.env` (ignored by Git) and set `AGENT_NAME`, `API_BASE_URL`, the model IDs, and either `API_KEY` or the OAuth settings. Base URLs must be HTTPS, or HTTP on loopback.
2. Run `npm run api` in a second terminal. The adapter listens on loopback port 18081 only, and keys and OAuth tokens stay in that backend process.
3. Run `npm run dev`. The dev server forwards `/llm` requests to the adapter.
4. Turn on **AI mind** in Controls and complete sign-in if asked. Alternatively, leave the API fields in `.env` blank and use **OpenAI-compatible API** or **Invite agent** in the MIND controls once the adapter is running.

A static deployment (`dist/` on any web server) has no `/llm` backend, so the scene runs offline and AI shows as unavailable unless you add your own backend and proxy. No service or model is chosen for you; requests use your account and may incur charges. Automated tests use mocks only. See [the API integration guide](docs/API-INTEGRATION.md) for request and response formats and OAuth details.

If the character does not answer, check the status below the chat input: **AI off** means AI mind is not selected, and **AI unavailable** means the backend is not reachable. Background thinking defaults to once every 30 wall-clock seconds, and direct questions take priority.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request using Node 22. It runs `npm ci`, installs Playwright Chromium, then runs `npm test`, `npm run test:browser`, `npm run brain:validate`, `npm run build`, `npm run privacy:check`, and `npm audit`. Browser failure traces are uploaded as an artifact. The older [workflow example](docs/ci-workflow.example.yml) remains as a minimal reference.

## Publication status

This fork is public on GitHub. No source license has been chosen yet (there is no LICENSE file), and redistribution rights for the bundled audio are still unresolved. See [RELEASE-REVIEW.md](RELEASE-REVIEW.md) for the cleanup record and the remaining release decisions. The account-connected browser, donation and payment system, other scenes, and external voice and autopilot services from the original project are excluded.
