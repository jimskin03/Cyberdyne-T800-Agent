# Cyberdyne T800 Agent Embodiment Project

A standalone Three.js containment-cell scene with a procedural robot, movable objects, physics, tool controls, water effects, climate controls, and a built-in computer. Connect your own agent through an API key, OAuth, or a local endpoint.

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
git clone https://github.com/newbmechanix-ship-it/Cyberdyne-T800-Agent-Embodiment-Project.git
cd Cyberdyne-T800-Agent-Embodiment-Project
npm ci
npm run dev
```

Open http://127.0.0.1:5340 and select **Open the feed**. No API key is needed. The local scene uses browser speech and browser storage. State is scoped to this package. **Reset session memory** starts fresh with AI off; **Restore previous session** provides one local undo slot. Neither saved state nor the undo slot is included in source exports. AI starts off for a new visitor and remembers the operator's later choice.

On desktop, use the **−** button in Unit Monitor, JSON Brain, Mind Stream, or Conversation to minimize that panel. Its title bar stays visible; select **+** to restore it. Minimizing preserves the current conversation, settings, and memory selection.

On phones and short landscape screens, **Controls** opens the operator settings, including **AI mind**, and **Memory** opens the interactive JSON brain. Each panel scrolls and has a **Close** button. Selecting a tool closes Controls so you can tap the unit in the scene.

```sh
npm test
npm run build
npm run brain:validate
npm audit
npm run privacy:check
```

The privacy check requires Git and scans tracked and untracked publication candidates, respecting `.gitignore`. It reports file names and line numbers without printing matched secrets. A clean scan does not establish that all possible personal information has been found.

## Included brain and personalization

Yes: the full [default JSON brain](src/cell/default-brain.json) ships in the repository, source ZIP and built app: **693 memory nodes, 303 pathways, and 554 associations**. It is an authored simulated biography with retrieval and experience rules, independent of any AI service. Saved play sessions and credentials are excluded. You can keep it, adapt it, replace it with your own graph, or start empty.

Start with [Make the experience your own](docs/CUSTOMIZATION.md). It includes copyable instructions for your coding agent, a map of customization points, and guidance on character identity, personality, progress and privacy.

| Guide | Use it to |
| --- | --- |
| [Personalization](docs/CUSTOMIZATION.md) | Choose a character and experience, and brief your coding agent |
| [JSON brains](docs/JSON-BRAIN.md) | Author biography, pathways, associations and evidence-based tendencies |
| [API and OAuth](docs/API-INTEGRATION.md) | Connect and name your own agent using your chosen service |
| [New scenarios](docs/SCENARIOS.md) | Build another setting with consistent physics, perception, actions and memory |
| [New features](docs/EXTENDING.md) | Add interactions, sensors, controls and backend capabilities |

The embodied character can use the implemented actions; your coding agent can change the host project's source. New scenarios and host features require implementation rather than only intercom instructions. The current cell is the included starting scenario.

## Create your own JSON brain

Follow [the JSON brain guide](docs/JSON-BRAIN.md) to create a character with our memory nodes, cue pathways, associations, explicit personality effects, optional experience learning, and live recall visualization. Start with [the validated fictional example](examples/brain.starter.json):

```sh
npm run brain:validate -- examples/brain.starter.json "repair radio"
```

## Connect your own APIs

[The API integration guide](docs/API-INTEGRATION.md) covers the service-neutral backend, agent naming, API keys or OAuth sign-in, model mapping, exact requests/responses, text and vision support, and instructions to hand to your coding agent. [AGENTS.md](AGENTS.md) gives agents the repository architecture and verification rules.

Configure your own compatible service in ignored local `.env` using `.env.example`, including `AGENT_NAME` and the service's model IDs. Run `npm run api` in another terminal. Choose API-key, OAuth or unauthenticated local-server access; OAuth requires registering your own client with the service. Enable **AI mind** when you intend to make requests, and complete sign-in if requested. Keys and OAuth tokens remain in the backend process. The development server forwards `/llm` requests to loopback port 18081; static deployment needs a separate backend and proxy.

No service or model is required or selected for you. Requests use your configured account and may incur usage charges. Automated tests use mocks. A separate private local test profile exercised a real text reply; compatibility with each user's service and OAuth registration still needs verification.

If the character does not answer, check the status below the chat input. **AI off** means AI mind is not selected. **AI unavailable** means the configured brain service is not reachable. Starting the scene alone does not start a provider. Ordinary conversation uses a compact prompt and skips fresh vision; direct replies have a 30-second deadline and explicit failure status. New chat messages wait behind an answer already in progress instead of repeatedly cancelling it.

The account-connected browser, donation/payment system, other scenes, Luna autopilot service, Si BoT provider service, and neural voice server are excluded. The local Luna character remains available for the scripted berserker sequence. The scene includes a service-neutral default JSON brain preserving the authored experiences: 693 memory nodes, 303 pathways, and 554 associations, with calendar recall and experience-driven behavior. The whole graph stays local; only selected, bounded recall enters a provider prompt. Optional AI features are not required to explore the cell.

Sensation simulation and pulse animation stay local and continuous. Heartbeats do not create model requests or append full sensation snapshots. Background thinking defaults to once every 30 wall-clock seconds, new physical events are coalesced, and direct questions take priority.

## Publication status

See [RELEASE-REVIEW.md](RELEASE-REVIEW.md) for cleanup details and remaining release decisions. The repository is initially private while the source license and bundled audio redistribution rights are finalized. The source ZIP contains only committed project files; API credentials and saved browser sessions are excluded.

## Continuous integration

A ready-to-use GitHub Actions workflow is provided in [docs/ci-workflow.example.yml](docs/ci-workflow.example.yml). Copy it to `.github/workflows/ci.yml` using a GitHub session authorized to manage workflows. It runs tests, brain validation, build, privacy checks and the dependency audit.
