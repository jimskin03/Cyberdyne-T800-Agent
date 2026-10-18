# Make the experience your own

The included cell is a starting experience. You can keep its default character, write a different fictional biography, turn the room into a workshop or studio, change how conversation and movement work, or develop a different scenario. These are source changes you make yourself or ask a coding agent to implement.

There are two different agents in this workflow:

- **Your coding agent** works on your local checkout. It can edit the scene, implement features, write a brain, adapt an API, and run checks.
- **The embodied agent** runs inside the scene through your configured backend. It can speak and request the supported physical actions. It cannot change the host application's source just because you describe a new feature through the intercom. Its computer apps and procedural creations run through restricted generation interfaces.

There is currently no scenario marketplace, scenario JSON loader, biography upload control, or general feature installer. The guides describe how to extend the existing source.

## What comes in the package

`src/cell/main.js` imports [the default brain](../src/cell/default-brain.json) directly. Both the repository and source ZIP include its **693 memory nodes, 303 pathways, and 554 associations**, plus calendar recall and an experience profile. A production build bundles it with the application. No API account or download is needed to load and inspect the brain panel.

This is an authored simulated biography and retrieval system, not model weights or a pretrained agent. It supplies selected memories and tendencies to whichever language model you connect. Live generated dialogue and visual interpretation need the appropriate configured models. AI is off for a fresh visitor.

The source package does not include the creator's conversations, learned session adjustments, injuries, computer notes, saved room, credentials, or private test connection. New users begin with local defaults and the authored brain. Their later session state belongs to their browser.

Smaller starting points are [brain.starter.json](../examples/brain.starter.json) and [brain.empty.json](../examples/brain.empty.json). Installing a different brain is optional.

## Choose what to change

| What you want | Where to begin | What else must agree |
| --- | --- | --- |
| Keep the experience and connect your agent | [API integration](API-INTEGRATION.md) | Backend model capabilities, API format, authentication and `AGENT_NAME` |
| Change biography, interests or memory-driven tendencies | [JSON brain guide](JSON-BRAIN.md) | Graph ID, evidence links, recall tests and a fresh browser session |
| Change character voice, role or speaking style | `src/cell/mind.js`, `sensor-contract.js`, `speech-cadence.js`, `src/audio.js` | Ordinary dialogue, observation reports, action prompts, voice UI and biography |
| Change the room, lighting, props or avatar | `src/cell/world.js`, `src/bot.js`, `body.js`, `index.html`, `public/cell.css` | Collision geometry, target names, navigation, action reach and camera position |
| Build another setting or scenario | [Scenario development](SCENARIOS.md) | World, prompts, sensors, action availability, UI and saved-state namespaces |
| Add an interaction, sensor or control | [Feature development](EXTENDING.md) | Real execution, reported results, cancellation, prompts and persistence |
| Adjust responsiveness and autonomy | `main.js`, `thought-clock.js`, `prompt-context.js`, `random-actions.js` | Request pacing, experience policy, local commands and speech cadence |

Paths without a prefix in this table are under `src/cell/`. Changing `AGENT_NAME` changes the connected agent's UI name; it does not rewrite the fictional biography, replace the avatar, or change the world. Changing a graph's `person` also does not rewrite the scene's T-800 role prompts.

## A useful first customization

1. Make your own checkout or branch. Start the unchanged scene with `npm ci` and `npm run dev` so you have a working baseline.
2. Choose one concrete change, such as a quieter character who enjoys repairing objects. Decide whether to retain the shipped biography or replace it.
3. Give your coding agent the brief below. Name the behavior you want to see, not just a mood label.
4. Keep AI off while reviewing visual and local interaction changes. Use mock responses for API development. Connect your own service separately when ready.
5. Run the relevant checks and test the changed behavior in a browser. Keep your branch or fork's documentation aligned with what actually works.

```text
Read AGENTS.md, README.md and docs/CUSTOMIZATION.md first.

Personalize my local experience:
- Setting: [the current cell / a repair workshop / another setting]
- Character: [name, fictional role, interests, conversational style]
- Biography: [keep the default / adapt it / use the starter / start empty]
- Activities: [what I want the character to be able to do]
- Interaction style: [quiet, conversational, task-focused, exploratory, ...]
- Features to add or remove: [specific examples]
- Visual and audio preferences: [describe them]
- Session policy: [start fresh / preserve compatible local progress]

Inspect the actual architecture and implement this in my checkout. Read
docs/JSON-BRAIN.md, docs/SCENARIOS.md, docs/EXTENDING.md and
docs/API-INTEGRATION.md as needed. Start with a small working version.
Keep biography, current observations and completed action results separate.
Keep the host and integration service-neutral. Tell me which requested
capabilities need new implementation rather than only a prompt change.
Keep credentials and personal information out of source and examples.
Verify the changed flows and report remaining limitations. Do not make
live paid requests or deploy unless I ask for them.
```

Replace the bracketed fields; delete those you do not need. A coding agent should resolve routine implementation details and ask about choices that materially change your intended experience.

## Personality and experience

Use authored facts, pathways and node `effects` to ground the character's tendencies in evidence. Give them ordinary interests, positive experiences, uncertainty and opportunities to change. The optional `behavior` profile supports experience-shaped tendencies; its presence also affects which motor policy runs. Follow the supported fields in the brain guide rather than inventing JSON keys and assuming the runtime uses them.

The graph's experience adjustments are separate from canonical biography. New scenario events must be recorded from actual interactions, not inferred from model prose. A successful repair can inform a supported outcome channel; a proposed repair cannot. For new learning channels, update and test `experience-state.js` explicitly.

Speech style is also influenced by system prompts, speech cadence and the available model. For a consistent new role, check the compact conversation prompt, full action prompt and completed-inspection prompt in `mind.js`, the shared embodiment/vision contract, and any generation prompts used by the scenario. A single added sentence does not remove conflicting hardcoded constraints elsewhere.

## Start fresh or keep progress

**Reset session memory** clears this package's active browser state and reloads with AI off. It resets conversation, learned experience, computer files, room state and related preferences; it keeps the authored brain installed in source. **Restore previous session** restores one local undo snapshot. That snapshot can contain private dialogue and remains in browser storage, outside Git and the ZIP. Do not use reset as proof that all browser data has been permanently erased.

Changing the graph ID invalidates incompatible biography learning, but it does not by itself clear unrelated room or conversation records. After installing a different character, use reset for a fresh session. When developing independent scenarios, give each one separate storage keys so progress cannot leak between them. See the scenario guide for the current keys.

## Share your version

Brain JSON and frontend source are public to anyone who receives the app. Never put actual private biography, credentials, private endpoints, saved conversations or account exports into them. Only selected bounded recall is sent in normal agent prompts, but the complete graph is still shipped to the browser. POV frames and dialogue can go to your configured service while AI is enabled.

Run `npm test`, `npm run brain:validate`, `npm run build`, `npm audit` and `npm run privacy:check`, and review your actual Git diff before sharing. Use assets you have permission to redistribute and state the license for your version. This project's current release status is recorded in [RELEASE-REVIEW.md](../RELEASE-REVIEW.md).

For a new setting, continue with [Scenario development](SCENARIOS.md). For new capabilities, continue with [Feature development](EXTENDING.md).
