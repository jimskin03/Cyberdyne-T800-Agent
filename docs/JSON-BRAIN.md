# Build your own JSON brain

The brain is an authored memory graph plus deterministic retrieval and experience rules. It is not a model checkpoint. You can create and inspect it without an API account; a language model is only needed for live generated dialogue and decisions.

## Start with a working example

1. Copy `examples/brain.starter.json` to your own working file and edit it. Use fictional facts intended to be public. Brain JSON is compiled into the browser bundle and visible to every visitor.
2. Give the graph a new, nonidentifying `id`, such as `workshop-unit-v1`. Change the ID when you replace the character or make incompatible memory changes.
3. Validate your file from the project root:

   ```sh
   npm run brain:validate -- examples/brain.starter.json "repair radio"
   ```

   This validates the actual runtime graph, builds its visualization layout, and exercises recall. Output lists IDs rather than printing remembered facts.
4. Replace `src/cell/default-brain.json` with your validated JSON. It is imported by `src/cell/main.js` at build time. There is no upload interface.
5. Run `npm run brain:validate`, `npm test`, and `npm run build`. Restart the development page, or rebuild and redeploy a static build.
6. For a fresh character, clear this scene's site data in your browser's developer tools. A new graph ID resets compatible biography learning, but existing journal entries, drawings, computer files and world state are stored separately. The **Wipe memory** button disables biography recall as part of its reset; it is not the recommended character-install workflow.

The distributed live graph preserves the authored simulated biography: 693 nodes, 303 pathways, 554 associations, calendar-first recall and an experience profile. Its neutral display identity is Agent; configure the running agent name independently with `AGENT_NAME` in the backend environment. The biography does not select an API service, authentication method or model. Use `examples/brain.starter.json` for a smaller alternative character or `examples/brain.empty.json` for an empty valid graph. Installing your graph makes its nodes and pathways appear in the JSON brain panel. With AI disabled, you can inspect the graph without generating dialogue. During development you can exercise live recall from your browser console:

```js
window.__CELL.lifeMemory.recall('repair radio')
```

That call highlights the actual retrieved pathways. It does not contact an API. With AI enabled, the scene automatically retrieves relevant memories and incorporates them into its thought context.

## How the parts fit together

| Layer | Source | Purpose |
| --- | --- | --- |
| Authored past | `src/cell/default-brain.json` | Facts, uncertainty, memory strengths, pathways and associations |
| Retrieval | `src/cell/life-memory.js` | Cue matching, ordered memory routes and bounded spreading activation |
| Character tendencies | `src/cell/personality-memory.js` | Explicit effects grounded in authored memory nodes |
| Optional experience profile | `src/cell/experience-state.js` | Appraisal, bounded learning and actor-specific relationships |
| Observed cell history | `src/cell/session-memory.js`, `src/cell/main.js` | Events that actually occurred during play, separate from backstory |
| Current sensation | Nervous system, cognitive state, climate and body modules | Current observations and physical state |
| Model interface | `src/cell/mind.js`, `src/cell/sensor-contract.js` | Gives the provider relevant context and parses proposed speech/actions |
| Execution and feedback | `src/cell/actions.js`, `src/cell/main.js` | Executes supported actions and records their real results |
| Inspection | `src/cell/json-brain.js`, `src/cell/memory-network.js` | Shows stored JSON and recall traces; visual regions are organizational, not biological claims |

Current observations take priority over old memories. A proposed action is not a completed action. Provider output must never silently rewrite canonical biographical facts.

## Associative graph format

Use the starter as the complete copyable example. The runtime validator is `validateLifeGraph()` in `src/cell/life-memory.js`.

| Field | Rules |
| --- | --- |
| `version` | Exactly `1` |
| `source` | Exactly `"simulated biography"`; retain this literal for compatibility |
| `id` | Nonempty stable string identifying this graph version |
| `person` | Nonempty character display name |
| `age` | Integer from 0 through 150 |
| `nodes` | Array of memory nodes; an empty array is valid |
| `pathways` | Array of cue-driven ordered routes |
| `links` | Array of `[pathwayId, pathwayId, weight]` associations |

Every node requires:

- `id`: nonempty string, globally unique across nodes **and** pathways.
- `fact`: a nonempty string of at most 200 characters. Put one concise authored fact here.
- `age`: `[earliestAge, latestAge]`, finite numbers with `0 <= earliestAge <= latestAge <= graph.age`.
- `kind`: a string. Use `"episode"` for an event, `"routine"` for merged recurring experience, or `"learned"` for secondhand information. A memory ending before age four must be `"learned"`.
- `strength`: number in `[0,1]`.

Optional fields include `feeling` (string), `fragments` (array of strings), `domain` (organizational label), and `effects`. Fragments are withheld when recalled strength is below 0.5; weak memories should not acquire invented details.

Each pathway needs a distinct `id`, nonempty `label`, `cues` as an array of strings, and a nonempty `route` of existing node IDs without duplicates. Order the route as the memory should be traversed. A node may occur in more than one pathway.

Each link joins two **pathways**, with a weight greater than zero and at most one. Links are treated as bidirectional. Normal associative recall starts at the best cue match and follows sufficiently strong connected pathways, returning at most three by default. A second unrelated cue match is not automatically a second recalled route. Choose cues that match how the character will describe its interests and experiences.

## Shape tendencies with evidence

An optional node `effects` object can assign values from `-1` through `1` to these supported keys:

| Key | Positive direction | Negative direction |
| --- | --- | --- |
| `trust` | Give people a chance while checking actions | Require evidence before reassurance |
| `vigilance` | Notice threats and prefer predictability | Settle when observations indicate safety |
| `sociability` | Seek company and share thoughts | Prefer quiet and time alone |
| `agency` | Take practical steps and seek useful help | Hesitate after setbacks |
| `openness` | Explore and experiment | Prefer familiar, gradual change |
| `attachment` | Accept care | Worry about separation |

These are fictional narrative controls. They are not diagnoses. Include positive, corrective and ordinary experiences as well as setbacks; avoid treating one event as a deterministic personality rule.

## Optional experience and behavior profile

The starter deliberately omits `behavior`. Add it only when you want the experience-driven policy: its presence changes the live motor policy so AI can choose actions between intercom instructions, replacing the legacy random free-movement policy in that mode.

For example, the starter's node IDs support this addition at the top level:

```json
"behavior": {
  "version": 1,
  "facets": [
    {
      "id": "mastery",
      "label": "Small repairs feel achievable",
      "layer": "motives",
      "cues": ["repair", "fix", "learn"],
      "evidence": [["m-radio-repair", 0.6]],
      "alternative": "Ask for help when the task exceeds available tools."
    }
  ]
}
```

Facet IDs use lowercase letters and underscores, are unique, and refer to explicit evidence node IDs. Evidence weights are finite numbers in `[-1,1]`. Supply a label, layer and string-array cues. `alternative` keeps the authored interpretation revisable.

Built-in appraisal and outcome learning recognize IDs including `help_is_safe`, `authority_fairness`, `evaluation_risk`, `repair_after_conflict`, `avoid_shame`, `mastery`, `repairer_identity`, `practical_coping`, `separation_alarm`, `seek_support`, `friend_reliability`, `honest_uncertainty`, `boundaries`, `belonging`, `care`, `quiet_recovery`, `security`, and `autonomy`. Inspect `experience-state.js` before adding channels; arbitrary facet IDs do not automatically acquire outcome-learning rules. Learned adjustments stay separate from canonical facts.

## Advanced calendar-first recall

Keep the basic associative format unless you need dated life-history questions. To opt into the existing hierarchy, set `recallModel` to `"hierarchical-v2"` and add:

- `biography`: ISO date strings `dateOfBirth` and `asOf`, plus an authored `birthplace` string used by the prompt. The exact dates must agree with graph `age`.
- `eras`: an array of `{ "id": "school", "years": [startYear, endYear] }`. IDs must be unique; years must be integers within the biography calendar bounds.
- Integer `years: [startYear, endYear]` on every node and pathway, within those same bounds.
- Integer `depth` from 0 through 3 on every node. Add a meaningful `certainty` string because hierarchy prompts display it.
- A calendar anchor pathway for every year from birth through the as-of year, with the exact ID `year-YYYY` and `years: [YYYY, YYYY]`. These exact IDs are used by retrieval.

Retrieval also recognizes conventional pathway IDs `identity`, `era-<era.id>`, and `<era.id>-<domain>`. Use pathway `tier:0` for broad anchors, `tier:1` for topics, and `tier:2` for episodes. Optional `unknowns` can record gaps instead of fabricating details. Inspect `hierarchical-memory.js` and test queries for a year, a year range, a topic and follow-up detail. Do not add the hierarchy flag to an otherwise unchanged associative graph: validate the complete dated graph first.

## Ask your agent to create a character

> Read AGENTS.md and docs/JSON-BRAIN.md. Create a fictional character graph using examples/brain.starter.json and the existing retrieval architecture. Use globally distinct IDs, concise facts, explicit uncertainty, balanced experience effects and routes connected by intentional associations. Keep actual personal data and credentials out of the graph. Do not enable hierarchy or behavior unless requested. Validate the graph, exercise representative recall queries, install it in src/cell/default-brain.json, and run the tests, build and privacy check. Tell me which browser storage I should clear for a fresh character. Do not make live provider calls or publish anything.
