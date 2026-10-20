import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createBot} from '../src/bot.js';
import {createBody} from '../src/cell/body.js';
import {createRagdoll} from '../src/cell/ragdoll.js';
import {RECTS, CIRCLES, FEATURES, S} from '../src/cell/world.js';
import {attachFembot, FEMBOT_JOINTS, facingFromHeading, planPlayerMove, placeFollowCamera, turnView} from '../src/characters/fembot.js';

const toon = color => new T.MeshStandardMaterial({color});
async function load() {
  const bytes = await readFile(new URL('../public/characters/fembot/fembot.glb', import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

test('Fembot loads and inherits the original joints, animation callback and hit targets', async () => {
  let bot;
  bot = createBot(toon, {free:true, pose: () => {bot.nodes.shR.rotation.x = -.8;}});
  const nodes = {...bot.nodes}, targets = {...bot.targets}, originals = [...bot.pickables];
  const asset = await load();
  const skin = attachFembot(bot, asset.scene);
  skin.setEnabled(true);
  bot.update(1, .016, false);
  for (const name of FEMBOT_JOINTS) assert.equal(bot.nodes[name], nodes[name]);
  for (const [name, target] of Object.entries(targets)) assert.equal(bot.targets[name], target);
  assert.equal(bot.nodes.shR.rotation.x, -.8);
  assert.ok(bot.pickables.length > 0);
  for (const m of bot.pickables) {
    assert.equal(m.parent.parent, bot.nodes[m.userData.hostJoint]);
    assert.ok(m.visible && m.parent.visible);
    for (const value of m.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
  }
  assert.ok(originals.every(m => !m.visible));
  assert.equal(bot.root.name, 'Fembot');
  skin.setEnabled(false);
  assert.deepEqual(bot.pickables, originals);
  assert.equal(bot.root.name, 'T-800');
  assert.ok(originals.every(m => m.visible));
  skin.dispose();
});

function jointExtentY(bot, joint) {
  let min = Infinity, max = -Infinity;
  for (const mesh of bot.pickables) {
    if (mesh.userData.hostJoint !== joint) continue;
    const attr = mesh.geometry.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      const y = attr.getY(i);
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  return {min, max};
}

test('Fembot neck is short enough for the jaw to meet the collar', async () => {
  const bot = createBot(toon, {free: true});
  const hostNeck = bot.nodes.head.position.y;
  const skin = attachFembot(bot, (await load()).scene);
  skin.setEnabled(true);
  const neck = jointExtentY(bot, 'neck');
  const head = jointExtentY(bot, 'head');
  const headBase = bot.nodes.head.position.y;
  assert.ok(headBase < hostNeck - 0.2, `head pivot ${headBase} did not drop from ${hostNeck}`);
  assert.ok(neck.min < 0.08, 'neck should start at the collar');
  assert.ok(neck.max < 0.4, `neck column still reaches ${neck.max}`);
  assert.ok(headBase + head.min < neck.max, 'gap between the neck and the head');
  assert.ok(neck.max < headBase - 0.12, 'neck crosses the jaw into the face');
  skin.setEnabled(false);
  assert.equal(bot.nodes.head.position.y, hostNeck);
  skin.dispose();
});

test('Fembot mesh follows the existing ragdoll and its restore operation', async () => {
  const bot = createBot(toon, {free:true});
  bot.root.scale.setScalar(.38);bot.root.position.y=.91*.38;
  const scene = new T.Scene();scene.add(bot.root);
  const skin=attachFembot(bot,(await load()).scene);skin.setEnabled(true);
  const headMesh=bot.pickables.find(m=>m.userData.hostJoint==='head');
  const before=headMesh.getWorldPosition(new T.Vector3());
  const doll=createRagdoll(bot,scene,{x0:-3,x1:3,z0:-3,z1:3,h:3});
  for(let i=0;i<30;i++)doll.update(1/60);
  assert.equal(headMesh.parent.parent,bot.nodes.head);
  assert.ok(headMesh.getWorldPosition(new T.Vector3()).distanceTo(before)>.005);
  doll.restore();
  assert.equal(bot.nodes.head.parent,bot.nodes.neck);
  assert.ok(headMesh.getWorldPosition(new T.Vector3()).distanceTo(before)<1e-6);
  skin.dispose();
});

test('player movement, camera and mouse share one +Z heading', () => {
  const up = new T.Vector3(0, 1, 0);
  const target = new T.Vector3(0, 1.2, .25);
  const cam = new T.PerspectiveCamera(50, 1, .1, 30);
  placeFollowCamera(cam, 0, target, 2, .4);
  cam.updateMatrixWorld(true);
  const view = new T.Vector3();
  cam.getWorldDirection(view); view.y = 0; view.normalize();
  const camRight = new T.Vector3().crossVectors(view, up);
  const ahead = planPlayerMove(0, {forward: 1}, 1, 1);
  const side = planPlayerMove(0, {strafe: 1}, 1, 1);
  const back = planPlayerMove(0, {forward: -1}, 1, 1);
  assert.ok(new T.Vector3(ahead.dx, 0, ahead.dz).normalize().dot(view) > .9);
  assert.ok(new T.Vector3(side.dx, 0, side.dz).normalize().dot(camRight) > .9);
  assert.ok(new T.Vector3(back.dx, 0, back.dz).normalize().dot(view) < -.9);
  assert.ok(Math.abs(ahead.heading) < 1e-6);
  const east = planPlayerMove(Math.PI / 2, {forward: 1}, 1, 1);
  assert.ok(east.dx > .9 && Math.abs(east.dz) < 1e-6);
  const turned = turnView(0, Math.PI / 2 / .006);
  const turnedCam = new T.PerspectiveCamera(50, 1, .1, 30);
  placeFollowCamera(turnedCam, turned, target, 2, .4);
  turnedCam.updateMatrixWorld(true);
  const turnedView = new T.Vector3();
  turnedCam.getWorldDirection(turnedView); turnedView.y = 0; turnedView.normalize();
  assert.ok(turnedView.dot(camRight) > .9, 'mouse-right turns the view toward camera-right');
  assert.ok(facingFromHeading(0).dot(view) > .9);
});

test('Fembot faces the direction direct control actually walks, and walls stop her', async () => {
  let pose; const bot = createBot(toon, {free: true}); bot.root.scale.setScalar(S);
  const world = {bot, RECTS, CIRCLES, features: FEATURES, items: {}, setPose(fn) { pose = fn; }, pushItems() {}};
  const body = createBody(world, {sfx() {}});
  const skin = attachFembot(bot, (await load()).scene); skin.setEnabled(true);
  let t = 0;
  const step = dt => { t += dt; bot.update(t, dt, false); pose(t, dt); bot.root.updateMatrixWorld(true); };
  const front = () => {
    const iris = bot.pickables.find(m => m.name === 'head_iris');
    const center = new T.Box3().setFromObject(iris).getCenter(new T.Vector3());
    const origin = bot.nodes.head.getWorldPosition(new T.Vector3());
    return center.sub(origin).setY(0).normalize();
  };
  body.st.x = 0; body.st.z = .25; body.st.heading = 0;
  const start = new T.Vector3(body.st.x, 0, body.st.z);
  for (let i = 0; i < 40; i++) {
    const plan = planPlayerMove(0, {forward: 1}, 1.35, 1 / 60);
    body.drive(plan.dx, plan.dz, plan.heading);
    step(1 / 60);
  }
  const moved = new T.Vector3(body.st.x, 0, body.st.z).sub(start);
  assert.ok(moved.z > .5 && Math.abs(moved.x) < .05);
  assert.ok(front().dot(moved.clone().normalize()) > .9);
  assert.ok(body.st.walkW > .5);
  assert.equal(body.blocked(body.st.x, body.st.z), false);
  body.st.x = 0; body.st.z = .25; body.st.heading = 0;
  const sideStart = body.st.x;
  for (let i = 0; i < 30; i++) {
    const plan = planPlayerMove(0, {strafe: 1}, 1.35, 1 / 60);
    body.drive(plan.dx, plan.dz, plan.heading);
    step(1 / 60);
  }
  assert.ok(body.st.x < sideStart - .3);
  assert.ok(front().dot(new T.Vector3(-1, 0, 0)) > .9);
  body.st.x = 0; body.st.z = 0; body.drive(5, 0, Math.PI / 2); step(1 / 60);
  assert.ok(body.st.x < 2.4);
  assert.equal(body.blocked(body.st.x, body.st.z), false);
  skin.dispose();
});

test('an incompatible asset fails before changing the original bot', () => {
  const bot=createBot(toon,{free:true});const original=[...bot.pickables];
  assert.throws(()=>attachFembot(bot,new T.Group()),/Incompatible character joint/);
  assert.deepEqual(bot.pickables,original);
  assert.ok(original.every(m=>m.visible));
});
