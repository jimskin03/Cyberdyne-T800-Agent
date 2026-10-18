# Build a different scenario

You can use the embodiment, sensing, action and memory architecture for other settings: a repair workshop, an art studio, a greenhouse, a puzzle room, a research station, or an experience of your own. These are ideas for forks, not additional scenarios already included in the package.

The current implementation is a single cell application with some world-specific assumptions shared across modules. A new setting requires source work. Editing the biography or asking the character to imagine a different room does not move walls or add functional objects.

## Define a small playable slice

Write down the setting, the character's role, the objects it can interact with, the available information, and one observable task. For example:

> A repair assistant lives in a small workshop. It can walk to a workbench, inspect a lamp, toggle it, and explain what changed. Keep conversation and the JSON brain. Remove the containment narrative and operator attack controls.

That brief needs a rendered bench and lamp, valid standing positions, working interactions, truthful observation results and matching instructions. It does not require implementing an entire town first.

Decide whether your version replaces the default entry or runs alongside it:

| Approach | Implementation | Tradeoff |
| --- | --- | --- |
| Replace the cell in your fork | Update the existing world, host and entry page together | Fastest way to produce one cohesive experience |
| Keep a separate scenario | Add a dedicated entry HTML/module and isolate scenario state; update build inputs in `vite.config.js` | Preserves the cell, but requires explicit wiring and maintenance |
| Refactor for many scenarios | Introduce a scenario interface after identifying genuinely shared behavior | More initial work; no such plugin interface currently exists |

`index.html` is the real application entry. `cell.html` currently redirects to `/`; duplicating that redirect does not create a new scene. Vite's current production build uses the default entry. A new HTML route must also be included in the production build and checked in the built output.

## Keep the experience consistent across layers

| Layer | Existing implementation | Work for a new scenario |
| --- | --- | --- |
| Room and objects | `src/cell/world.js` | Geometry, lighting, features, item records, support surfaces and capture |
| Avatar | `src/bot.js`, `src/cell/body.js` | Appearance, scale, poses, interaction reach and eye attachment |
| Movement and collisions | `ROOM`, `RECTS`, `CIRCLES` in `world.js`; `body.js`, `navigation.js`, `ragdoll.js` | Boundaries, furniture footprints, reachable stands and physical behavior |
| Interaction targets | `FEATURES` in `world.js`; aliases, `SEATS`, resolution and dispatch in `actions.js` | Stable IDs, useful look points, approach positions and actual interactions |
| Current observations | `senses()` in `main.js`; nervous, cognitive, climate and body modules | Describe the actual setting and only the sensors it provides |
| Agent instructions | `mind.js`, `sensor-contract.js` | Role, world description, constraints, supported actions and dialogue/inspection modes |
| Host and UI | `main.js`, `index.html`, `public/cell.css` | Startup, controls, keyboard shortcuts, events, rendering and save/restore |
| Memory | Default brain, `life-memory.js`, `experience-state.js`, `session-memory.js` | Suitable biography, explicit learning channels and relevant recorded event types |
| Assets and audio | `src/audio.js`, `src/sound-bank.js`, `public/` | Replace or remove scenario-specific sounds and keep asset licenses |

Do not just hide a control. If a capability is removed, also remove its keyboard shortcut, model action, operator command, scripted event and reachable dispatch path as appropriate. If a locked door becomes usable, change the geometry/collision behavior, action result and prompts together. A line saying the door opened is not an implemented exit.

## Geometry, navigation and perception

World distances are in metres. The current coordinate convention is **+Y up, -Z north, +Z south, -X west, +X east**. The robot rig is scaled separately through `S` in `world.js`.

For a new fixture, keep its mesh, collision footprint, support height, `FEATURES` look point and reachable standing position consistent. Existing seat coordinates are also defined in `actions.js`. Moving only the mesh leaves the character navigating to or inspecting the old location. Audit special cases that refer directly to bed, table, stool or other cell IDs.

For loose props, follow the existing `item()` registration in `world.js`. Keep IDs unique and maintain position, state, holding and save/restore behavior. A decorative mesh is not automatically a pickable or usable item. Dynamic creations have their own registration and validation path.

Use the robot's POV for agent perception. The security camera is the audience view. `look_at`, `inspect` and `snapshot` aim/settle and acquire a fresh optical reading before reporting. Preserve that sequence when adding targets. Check close views, shadows, occlusion and small objects at actual capture resolution. `visible()` supplies geometric candidates; neither a listed candidate nor an omitted candidate establishes pixel recognition or absence.

## Isolate saved state

The current package uses browser storage, with keys including:

- `cell-public-cell.v1` for the saved scene and memory.
- `cell-public-cell.computer.v1` for the computer.
- `cell-public-cell-climate.v1` for climate settings.
- `cell-public-ai.enabled` for AI preference.
- `cell-session-reset-backup.v1` for the recoverable reset snapshot.

`src/cell/session-storage.js` resets keys with the `cell-public-` prefix and handles the undo slot. If you rename keys for a new scenario, change its reset/restore logic too. Do not leave a reset function that clears another scenario's progress. Give incompatible graph versions a new graph ID and design an explicit migration or a fresh-session path for incompatible world saves.

The supplied `src/persistence.js` is a browser-only persistence contract; it does not start a shared disk or cloud store. Adding cross-device accounts or remote persistence is a separate backend feature. Choose a distinct loopback port when running separate development servers, and make sure the build and API proxy still point where intended.

## Ask a coding agent to build your scenario

```text
Read AGENTS.md and docs/CUSTOMIZATION.md, docs/SCENARIOS.md,
docs/EXTENDING.md and docs/JSON-BRAIN.md.

Build a [setting] scenario in my checkout. Its character is [role].
The first playable task is [concrete task and visible outcome].
Keep [features]. Remove [features]. Use [the default brain / a new
fictional graph]. [Replace the current scene / preserve it and add a
separate entry]. Keep the current API/OAuth integration service-neutral.

Inspect hardcoded cell assumptions before editing. Update physical
geometry, navigation, targets, sensors, prompts, UI, shortcuts and saved
state together. Implement actual actions and report their results; do
not simulate success in dialogue. Isolate progress from other scenarios.
For a second entry, include it in the production build. Start with the
small playable task, verify it in a browser, and document how to run it.
Use local or mocked services for checks; do not make paid requests,
change account access, or publish unless I request those steps.
```

## Verify a scenario before sharing

Run the repository checks, then exercise the scenario's first task in a browser. Confirm navigation reaches its targets without crossing furniture; the correct POV image reaches the vision path; action results match what changed; cancellation stops work; reset and reload behave correctly; and UI, prompts and shortcut behavior agree. Test the production entry as well as the development page. Add focused regression tests for new mechanics rather than tests that merely match rewritten prompt text.

Update your README, API requirements, default graph description, asset attribution and known limitations. Keep private play sessions out of fixtures and screenshots intended for publication.
