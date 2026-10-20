# Fembot — cyborg assistant

An initial stylized 3D interpretation of the supplied portrait: blonde updo,
warm face, chrome body panels, black jacket, raised collar, and cyan lighting.
The legs and boots are an original extension of the upper-body reference.

## Play in the cell

Run `npm run dev` and open the feed. Fembot loads as the character in the cell.
Press **Play as Fembot** in the operator controls.

WASD walks. Hold the right mouse button, or the left and right arrow keys, to look.
Shift sprints. Esc returns movement to the agent.

**Character appearance** can switch the mesh for this page session. The switch
makes no AI calls.

The meshes attach directly to the existing 17 `createBot` joint objects.
The portable file still names each pivot `aixiin_<joint>`. Movement, postures,
gestures, picking, hand-held items, hit reactions, sensors, collision shapes
and ragdoll physics remain owned by the original runtime. There is no
replacement skeleton, animation mixer or physics simulation.

This is an appearance asset. It does not replace the default authored brain,
change the server's `AGENT_NAME`, or rewrite the existing T-800 role prompts.
Longer hair and jacket tails are rigid joint attachments; they have no cloth or
hair simulation. Coarse body collision remains identical to the original robot.

## Blender

Open `tools/render-fembot.py` in Blender's **Scripting → Text Editor → Open**,
then choose **Run Script**. It creates a separate studio scene, imports the
game asset, adds a camera and warm/cyan/magenta lighting, and saves:

- `assets/fembot/Fembot.blend` — editable scene with named joint pivots.
- `assets/fembot/Fembot-preview.png` — 1400 × 1800 Cycles render.

The script requires the repository's relative directory layout. It preserves
other scenes in the currently opened file. Save unrelated work before running
it because Save As makes the asset file the active Blender project.

Or, from a terminal where Blender can run:

```sh
blender --background --factory-startup --python tools/render-fembot.py
```

The studio file and preview from the asset folder are
`assets/fembot/Fembot.blend` and `assets/fembot/Fembot-preview.png`.
The GLB itself is the portable mesh built by `build_geometry.py`.

## Rebuild and files

```sh
python assets/fembot/build_geometry.py
node --test test/fembot.test.mjs
```

`public/characters/fembot/fembot.glb` is the portable game asset;
`fembot.mesh.json` is its editable mesh source and `asset.json` describes its
joint contract and geometry budget. Coordinates use the existing rig units,
with +Y up and +Z forward; the cell applies its existing scale of 0.38.

The source portrait is not redistributed. No new license or third-party asset
rights claim is made. No external meshes, textures or model services are used.
