import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const FEMBOT_JOINTS = Object.freeze([
  'body', 'torso', 'neck', 'head', 'jaw',
  'shL', 'faL', 'handL', 'hipL', 'kneeL', 'footL',
  'shR', 'faR', 'handR', 'hipR', 'kneeR', 'footR',
]);

/** Attach visuals to the actual host nodes. No cloned skeleton, mixer or physics.
 *  The portable mesh still names each pivot `aixiin_<joint>`. */
export function attachFembot(bot, gltfScene) {
  const parts = FEMBOT_JOINTS.map(joint => {
    const source = gltfScene.getObjectByName(`aixiin_${joint}`);
    if (!source || !bot.nodes[joint]) throw new Error(`Incompatible character joint: ${joint}`);
    return {joint, source};
  });
  const originals = [];
  bot.root.traverse(object => {
    if (object.isMesh || object.isLight) originals.push([object, object.visible]);
  });
  const originalPickables = [...bot.pickables];
  const groups = [], pickables = [];
  // Only direct visual children move; nested joints stay in the discarded source rig.
  for (const {joint, source} of parts) {
    const group = new T.Group();
    group.name = `Fembot / ${joint}`;
    for (const child of [...source.children]) {
      if (!child.isMesh) continue;
      group.add(child);
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.hostJoint = joint;
      pickables.push(child);
    }
    bot.nodes[joint].add(group);
    groups.push(group);
  }
  const originalUpdate = bot.update;
  let enabled = false;
  // createBot's head pivot is the long T-800 neck. This skin's pivot is shorter.
  const authoredHead = gltfScene.getObjectByName('aixiin_head');
  const hostHead = bot.nodes.head;
  const restHeadY = hostHead.position.y;
  function fembotNeckLength() {
    const y = authoredHead?.position.y;
    if (!Number.isFinite(y) || y < 0.25 || y > restHeadY) return restHeadY;
    return y;
  }
  const enforce = () => {
    if (enabled) for (const [object] of originals) object.visible = false;
  };
  bot.update = function (...args) {
    const result = originalUpdate.apply(this, args);
    enforce();
    return result;
  };
  function setEnabled(value) {
    enabled = !!value;
    hostHead.position.y = enabled ? fembotNeckLength() : restHeadY;
    for (const group of groups) group.visible = enabled;
    for (const [object, visible] of originals) object.visible = enabled ? false : visible;
    bot.pickables.splice(0, bot.pickables.length, ...(enabled ? pickables : originalPickables));
    bot.root.name = enabled ? 'Fembot' : 'T-800';
  }
  setEnabled(false);
  return {
    setEnabled,
    get enabled() { return enabled; },
    dispose() {
      setEnabled(false);
      bot.update = originalUpdate;
      const materials = new Set(), geometries = new Set();
      for (const group of groups) {
        group.traverse(object => {
          if (object.geometry) geometries.add(object.geometry);
          for (const mat of [].concat(object.material || [])) materials.add(mat);
        });
        group.removeFromParent();
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

const UP = new T.Vector3(0, 1, 0);

/** +Z front. Heading 0 faces world +Z; right is forward × up, which is world −X. */
export function facingFromHeading(heading, out) {
  return (out || new T.Vector3()).set(Math.sin(heading), 0, Math.cos(heading));
}

/** Camera-relative step. The body then faces travel; idle keeps the view heading. */
export function planPlayerMove(heading, input = {}, speed = 1, dt = 0) {
  const forward = Number(input.forward) || 0;
  const strafe = Number(input.strafe) || 0;
  const fwd = facingFromHeading(heading);
  const right = new T.Vector3().crossVectors(fwd, UP);
  const move = new T.Vector3();
  if (forward || strafe) {
    move.addScaledVector(fwd, forward).addScaledVector(right, strafe);
    if (move.lengthSq() > 1e-8) move.normalize().multiplyScalar(speed * dt);
  }
  const face = move.lengthSq() > 1e-8 ? Math.atan2(move.x, move.z) : heading;
  return {dx: move.x, dz: move.z, heading: face};
}

/** Mouse-right turns toward camera-right for a +Z-facing body with the camera behind. */
export function turnView(heading, movementX, sensitivity = 0.006) {
  return heading - movementX * sensitivity;
}

/** Third-person camera on the same heading the movement frame uses. */
export function placeFollowCamera(camera, heading, target, distance, eyeLift) {
  const fwd = facingFromHeading(heading);
  camera.position.copy(target).addScaledVector(fwd, -distance);
  camera.position.y = target.y + eyeLift;
  camera.lookAt(target);
  return fwd;
}

const CHARACTER_KEY = 'cell-character';
function rememberedAppearance() {
  try { return sessionStorage.getItem(CHARACTER_KEY) === 't800' ? 't800' : 'fembot'; }
  catch { return 'fembot'; }
}
function rememberAppearance(id) {
  try { sessionStorage.setItem(CHARACTER_KEY, id === 't800' ? 't800' : 'fembot'); } catch {}
}

/** Appearance plus a direct-control hook. The authored brain stays unchanged. */
export function installCharacterSelector(bot, {container = document.getElementById('lab')} = {}) {
  const api = {playing: false, update() {}, async use() { return false; }};
  if (!container) return api;
  const label = document.createElement('label');
  label.className = 'rowlabel';
  label.textContent = 'Character appearance ';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Character appearance');
  select.add(new Option('T-800', 't800'));
  select.add(new Option('Fembot', 'fembot'));
  label.append(select);
  const play = document.createElement('button');
  play.id = 'fembot-play';
  play.type = 'button';
  play.textContent = 'Play as Fembot';
  const status = document.createElement('p');
  status.className = 'hint'; status.setAttribute('role', 'status');
  status.textContent = 'Fembot uses the current movement, physics and authored brain.';
  container.prepend(label, play, status);
  let skin, pending;
  async function use(id) {
    if (id !== 'fembot') {
      skin?.setEnabled(false);
      select.value = 't800';
      rememberAppearance('t800');
      if (!api.playing) status.textContent = 'T-800 appearance active.';
      return false;
    }
    select.value = 'fembot';
    status.textContent = 'Loading Fembot…';
    try {
      pending ||= new GLTFLoader().loadAsync('/characters/fembot/fembot.glb');
      const gltf = await pending;
      skin ||= attachFembot(bot, gltf.scene);
      // A changed selection while loading must win over the old request.
      skin.setEnabled(select.value === 'fembot');
      rememberAppearance(select.value);
      if (!api.playing) status.textContent = skin.enabled ? 'Fembot active. Play walks her in the cell.' : 'T-800 appearance active.';
      return skin.enabled;
    } catch {
      pending = null;
      select.value = 't800';
      skin?.setEnabled(false);
      rememberAppearance('t800');
      status.textContent = 'Fembot could not load. T-800 remains active; select her again to retry.';
      return false;
    }
  }
  select.addEventListener('change', () => use(select.value));
  api.use = use;
  api.playButton = play;
  api.status = status;
  if (rememberedAppearance() === 'fembot') use('fembot');
  return api;
}

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];

/** WASD walks the cell body. The view heading is the only movement frame. */
export function bindFembotPlay(api, body, world, hooks = {}) {
  if (!api?.playButton) return api;
  let playing = false, arming = false, viewYaw = 0, pitch = 0.12, drag = false;
  const keys = new Set();
  const look = new T.Vector3(), desired = new T.Vector3();
  const canvas = world.renderer.domElement;
  const hud = document.createElement('section');
  hud.id = 'fembot-hud';
  hud.hidden = true;
  hud.setAttribute('aria-label', 'Fembot play controls');
  hud.innerHTML = '<b>FEMBOT</b><span>WASD move · Right mouse look · Shift sprint · Esc release</span>';
  document.body.append(hud);
  const editable = e => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable;
  function paint() {
    api.playing = playing;
    api.playButton.textContent = playing ? 'Release control' : 'Play as Fembot';
    api.playButton.setAttribute('aria-pressed', String(playing));
    hud.hidden = !playing;
  }
  function follow(cam) {
    world.bot.targetPos('chest', look);
    const fwd = facingFromHeading(viewYaw);
    desired.copy(look).addScaledVector(fwd, -2.15);
    desired.y = look.y + 0.42 + pitch;
    cam.position.copy(desired);
    cam.lookAt(look);
    world.povMain = false;
  }
  function exit() {
    if (!playing) return;
    playing = false;
    drag = false;
    keys.clear();
    paint();
    hooks.onExit?.();
    if (hooks.keepCamera?.()) return;
    world.setCameraDriver(null);
    world.controls.enabled = true;
    world.povMain = false;
    placeFollowCamera(world.camera, body.st.heading, world.bot.targetPos('chest', look), 2.4, 0.5);
    world.controls.target.copy(look);
    if (api.status) api.status.textContent = 'Fembot active. Play walks her in the cell.';
  }
  async function enter() {
    if (playing) { exit(); return; }
    if (arming) return;
    if (!hooks.allowed?.()) { hooks.toast?.('Open the feed before playing.'); return; }
    arming = true;
    try {
      const ok = await api.use('fembot');
      if (!ok || !hooks.allowed?.()) return;
      hooks.onEnter?.();
      viewYaw = body.st.heading;
      pitch = 0.12;
      keys.clear();
      playing = true;
      world.controls.enabled = false;
      world.povMain = false;
      world.setCameraDriver(follow);
      paint();
      if (api.status) api.status.textContent = 'Walking Fembot. Esc returns movement to the agent.';
    } finally { arming = false; }
  }
  api.playButton.addEventListener('click', enter);
  api.update = dt => {
    if (!playing) return;
    if (body.st.external || !hooks.allowed?.()) { exit(); return; }
    dt = Math.min(.05, Math.max(0, dt));
    if (keys.has('ArrowLeft')) viewYaw += dt * 1.6;
    if (keys.has('ArrowRight')) viewYaw -= dt * 1.6;
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.5 : 1.35;
    const plan = planPlayerMove(viewYaw, {forward, strafe}, speed, dt);
    body.drive(plan.dx, plan.dz, plan.heading);
  };
  addEventListener('keydown', e => {
    if (!playing || editable(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape') {
      if (e.repeat) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      exit();
      return;
    }
    if (MOVE_KEYS.includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); keys.add(e.code); }
  }, true);
  addEventListener('keyup', e => keys.delete(e.code), true);
  addEventListener('blur', () => { drag = false; keys.clear(); });
  canvas.addEventListener('contextmenu', e => { if (playing) e.preventDefault(); });
  canvas.addEventListener('pointerdown', e => {
    if (!playing || e.button !== 2) return;
    drag = true;
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('pointermove', e => {
    if (!playing || !drag) return;
    viewYaw = turnView(viewYaw, e.movementX);
    pitch = T.MathUtils.clamp(pitch + e.movementY * .004, -.35, .85);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('pointerup', e => { drag = false; if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId); }, true);
  canvas.addEventListener('pointercancel', () => { drag = false; keys.clear(); });
  return api;
}
