import {createNervousSystem} from './nervous-system.js';
import {createCognitiveState} from './cognitive-state.js';
import {createBodyLoadSampler} from './body-loads.js';
import {createNervousHud} from './nervous-hud.js';
import {recallSensoryMemory, describeMemory} from './sensory-memory.js';
import {createSessionMemory} from './session-memory.js';
import {createLearnedMemory} from './learned-memory.js';
import {createId} from './id.js';
import {createLifeMemory} from './life-memory.js';
import lifeGraph from './default-brain.json';
import {createBerserker} from './berserker.js';
import './berserker.css';
import * as T from 'three';
import {createWorld} from './world.js';
import {bindFembotPlay} from '../characters/fembot.js';
import {createBody} from './body.js';
import {createActions, INTERRUPT} from './actions.js';
import {createMind, wantsFreshVision} from './mind.js';
import {createThoughtClock} from './thought-clock.js';
import {
  buildPromptContext,
  recentContext,
  INTERCOM_CONTEXT_CHARS,
  BACKGROUND_CONTEXT_CHARS,
} from './prompt-context.js';
import {randomAction} from './random-actions.js';
import {createWaterMode} from './water-mode.js';
import {createPeacePanel} from './peace-panel.js';
import {createClimate} from './climate.js';
import {createAutopilot} from './autopilot.js';
import {createSpeechCadence} from './speech-cadence.js';
import {operatorCommand} from './commands.js';
import {createCellSessionStore} from './storage/session-store.js';
import {createComputer} from './computer.js';
import {computerDocument} from './sandbox.js';
import {createSlop, mountSlop} from './slop.js';
import {createConnectionController} from './ui/connection-controller.js';
import {createIntercomController} from './ui/intercom-controller.js';
import {createHudController} from './ui/hud-controller.js';
import {createComputerController} from './ui/computer-controller.js';
import {createSettingsController} from './ui/settings-controller.js';
import {createMcpController} from './ui/mcp-controller.js';
import {createMcpClient} from './mcp-client.js';
import {createSpeechCoordinator} from './app/speech-coordinator.js';
import {createActionQueue} from './app/action-queue.js';
import {createThoughtScheduler} from './app/thought-scheduler.js';
import {createCellApp} from './app/create-cell-app.js';
import {createAudio} from '../audio.js';
import {TOOLS} from '../tools.js';
import {strip} from '../lines.js';
import {createPersistence, advanceTime} from '../persistence.js';
import {createGrapple} from './grapple.js';
import {buildCreation} from './creator.js';
import {validateCreation} from './creation-model.js';
import {openArtworkPhotos} from './auction-photo.js';
import {
  repeatedSpeech,
  loopContext,
  variedMemory,
  speechHistory,
  stripRepeatedSentences,
} from '../repetition.js';

// CELL MODE: the T-800 is loose in a cell. With an experience profile, Agent chooses speech and actions from its current appraisal; legacy chips use random movement. The operator
// only intervenes by picking a tool and clicking on him. Sensors and pulse update locally;
// background model requests use wall-clock pacing, while direct questions take priority.
const $ = (id) => document.getElementById(id);
let resettingSession = false;
const PART = {
  head: 'skull',
  jaw: 'jaw',
  chest: 'ribcage',
  core: 'power core',
  elbowL: 'left elbow',
  elbowR: 'right elbow',
  handL: 'left hand',
  handR: 'right hand',
  kneeL: 'left knee',
  kneeR: 'right knee',
  footL: 'left foot',
  footR: 'right foot',
};
const FEEL = {
  prod: 'a violent electrical arc burning into your {p}',
  mallet: 'a heavy blunt blow to your {p}',
  torch: 'searing heat on your {p}, metal glowing',
  drill: 'a drill bit grinding into your {p}',
  feather: 'an unbearable tickling across your {p}, sensor overload',
  squirt: 'cold water sprayed into your {p}, joints sputtering',
  chicken: 'a squeaking rubber chicken slapping your {p}, humiliating',
  magnet: 'a magnetic field wrenching at your {p}, plates shearing',
};
const state = {
  started: false,
  playerControl: false,
  pain: 0,
  fear: 12,
  despair: 6,
  bpm: 64,
  beat: 0,
  beatPhase: 0,
  beatsSince: 99,
  backgroundSeconds: 30,
  simMin: 8 * 60 + 10,
  timeScale: 10,
  weather: 'clear',
  weatherAt: 0,
  journal: [],
  spokenHistory: [],
  notes: [],
  events: [],
  queue: [],
  current: null,
  nextActionAt: 0,
  thinking: null,
  strikes: 0,
  lastStrike: -99,
  sel: null,
  airStart: 0,
  nextEventAt: 0,
  lastPlan: -1,
  lightsOn: null,
  soreness: 0,
  lastHurt: '',
  heartSound: true,
  lastSaid: '',
  talkLevel: 'normal',
  punk: false,
  baby: false,
  noiseVol: 0.8,
  chalk: [],
  creations: [],
  firstSeenAt: Date.now(),
  lastClockAt: Date.now(),
  offlineMinutes: 0,
};
const persistence = createPersistence('cell');
const sessionStore = createCellSessionStore({storage: localStorage, persistence});
const sessionMemory = createSessionMemory();
const lifeMemory = createLifeMemory(lifeGraph);
// Learned interactions live apart from the authored JSON Brain and survive Reset Session.
const learnedMemory = createLearnedMemory();
const nervous = createNervousSystem(),
  cognitive = createCognitiveState(),
  loadSampler = createBodyLoadSampler();
const nerveHud = createNervousHud(nervous, cognitive);
let memoryOutbox = [],
  activeSession = createId();
const feeling = () => ({
  body: nervous.snapshot(),
  mental: cognitive.snapshot(),
  fear: state.fear,
  despair: state.despair,
});
try {
  const s = sessionStore.readLocal() || {};
  for (const k of [
    'notes',
    'journal',
    'spokenHistory',
    'simMin',
    'strikes',
    'timeScale',
    'backgroundSeconds',
    'heartSound',
    'despair',
    'talkLevel',
    'noiseVol',
    'chalk',
  ])
    if (s[k] != null) state[k] = s[k];
} catch {}
const where = () =>
  body
    ? {
        x: body.st.x,
        z: body.st.z,
        h: body.st.heading,
        holding: body.st.holding?.id || null,
        posture: body.st.posture,
        seat: body.st.seat?.name,
        items: Object.fromEntries(
          Object.values(world.items)
            .filter((i) => !i.held)
            .map((i) => [
              i.id,
              {
                position: i.obj.position.toArray(),
                fallen: !!i.fallen,
                rotation: i.obj.rotation.toArray().slice(0, 3),
                state: Object.fromEntries(
                  Object.entries(i.state).filter(([, v]) =>
                    ['boolean', 'number', 'string'].includes(typeof v),
                  ),
                ),
              },
            ]),
        ),
      }
    : null;
// Keep the saved archive intact; select a varied, relevant working memory below.
const save = () => {
  if (resettingSession) return;
  const ack = new Set(sessionStore.takeAcknowledged());
  memoryOutbox = memoryOutbox.filter((e) => !ack.has(e.id));
  const data = {
    lifeMemory: lifeMemory.export(),
    nervous: nervous.export(),
    cognitive: cognitive.export(),
    archive: memoryOutbox,
    sessionMemory: sessionMemory.export(),
    where: where(),
    chalk: world ? world.chalkExport() : state.chalk,
    talkLevel: state.talkLevel,
    noiseVol: state.noiseVol,
    notes: state.notes,
    journal: state.journal.slice(-200),
    spokenHistory: state.spokenHistory,
    simMin: state.simMin,
    strikes: state.strikes,
    timeScale: state.timeScale,
    backgroundSeconds: state.backgroundSeconds,
    heartSound: state.heartSound,
    pain: state.pain,
    soreness: state.soreness,
    lastHurt: state.lastHurt,
    fear: state.fear,
    despair: state.despair,
    firstSeenAt: state.firstSeenAt,
    lastSeenAt: Date.now(),
    creations: state.creations,
    computer: computer?.export?.(),
    damage: world?.damageExport?.(),
  };
  sessionStore.save(data);
};

const audio = createAudio({windowsVoice: true});
const aiEnabled = sessionStore.getAiEnabled();
const thoughtClock = createThoughtClock();
const mind = createMind({enabled: aiEnabled});
$('use-brain').checked = aiEnabled;
const computer = createComputer();
const mcp = createMcpClient({
  isAtComputer: () =>
    !!body && !!actions && body.st.posture === 'sit' && body.st.seat === actions.SEATS.stool,
});
const slop = createSlop();
let world, body, actions, grapple, waterMode, peace, climate, berserker, fembotPlay;
const inPeace = () => !!peace?.active;
function restorePosition(w) {
  if (!w || !body) return;
  if (!body.blocked(w.x, w.z)) {
    body.st.x = w.x;
    body.st.z = w.z;
    body.st.heading = w.h;
  }
  for (const [id, value] of Object.entries(w.items || {})) {
    const it = world.items[id];
    if (!it) continue;
    const p = Array.isArray(value) ? value : value.position;
    if (p?.length === 3 && p.every(Number.isFinite)) {
      it.obj.position.fromArray(p);
      if (value.rotation) it.obj.rotation.fromArray([...value.rotation, 'XYZ']);
      it.fallen = !!value.fallen;
      Object.assign(it.state, value.state || {});
      if (it.state.broken) world.breakItem?.(it, 0, true);
      if (it.state.light) it.state.light.intensity = it.state.on ? 2.3 : 0;
      if (it.state.water) it.state.water.visible = !!it.state.full;
    }
  }
  if (w.holding && world.items[w.holding]) body.grab(world.items[w.holding]);
  const seat = Object.values(actions?.SEATS || {}).find((s) => s.name === w.seat);
  if (w.posture && body.setPosture) body.setPosture(seat ? 'sit' : w.posture, seat);
}
function toast(m, s = 3) {
  const el = $('toast');
  el.textContent = m;
  el.classList.add('visible');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('visible'), s * 1000);
}
try {
  world = createWorld($('world'), {
    canStrike: () => !inPeace(),
    sfx: (n) => audio.sfx(n),
    impact: onImpact,
    mess: (text) => addEvent('event', text),
    jolt: onJolt,
    clickBot,
    clickEmpty: () => {
      if (state.sel)
        toast(
          'Click on HIM to use the ' +
            TOOLS.find((t) => t.id === state.sel).name.toLowerCase() +
            '.',
        );
    },
    insetEl: $('pov'),
    swapped: (v) => {
      $('pov-label').textContent = v ? 'SECURITY CAM' : 'UNIT POV · WHAT THE MODEL SEES';
    },
  });
  body = createBody(world, {sfx: (n) => audio.sfx(n)});
  actions = createActions(world, body, {
    sfx: (n) => audio.sfx(n),
    fear: () => state.fear,
    mood,
    observe: async ({target, name, token}) => {
      state.observing = true;
      try {
        const image = await world.capture({signal: token?.signal});
        const observation = await mind.observe({
          image,
          target: name || target,
          signal: token?.signal,
        });
        if (token?.cancelled) throw INTERRUPT;
        token.observation = observation;
        return observation;
      } finally {
        state.observing = false;
      }
    },
    browser: (a) => slop.act(a),
    creator: async (a) => {
      const current = state.creations.find(
        (c) => c.name.toLowerCase() === String(a.name || '').toLowerCase(),
      );
      const spec = await mind.create3D({
        name: a.name,
        idea: a.idea,
        current: current?.code,
        signal: a.token?.signal,
      });
      if (a.token?.cancelled || a.token?.signal?.aborted) throw INTERRUPT;
      if (!spec) throw Error('The 3D design did not arrive');
      const result = await buildCreation(spec.code, {signal: a.token?.signal});
      if (a.token?.cancelled || a.token?.signal?.aborted) throw INTERRUPT;
      const id = current?.id || 'creation_' + createId().replaceAll('-', '');
      if (body.st.holding?.id === id) body.release();
      const item = world.addCreation(
        {id, name: spec.name || a.name || 'Untitled', description: spec.description},
        result.object,
        a.position,
      );
      const record = {
        id,
        name: item.name,
        description: item.desc,
        code: spec.code,
        json: result.json,
        home: item.home.toArray(),
      };
      const index = state.creations.findIndex((c) => c.id === id);
      if (index < 0) state.creations.push(record);
      else state.creations[index] = record;
      save();
      return item;
    },
    artist: async (q) => {
      const signal = q.token?.signal;
      const image = await world.capture({signal});
      if (q.token?.cancelled || signal?.aborted) throw INTERRUPT;
      $('doing').textContent = 'planning the drawing (Vision model)…';
      const art = await mind.draw({...q, image, signal});
      if (q.token?.cancelled || signal?.aborted) throw INTERRUPT;
      $('doing').textContent = art
        ? `drawing: ${art.title || q.subject} (${art.strokes.length} strokes, Vision model ${((mind.st.artMs || 0) / 1000).toFixed(0)}s)`
        : 'the picture would not come';
      return art;
    },
    planning: (subj, kind) =>
      stream(
        'event',
        kind === 'code'
          ? `(at the keyboard, ${subj})`
          : `(studying the surface, planning a drawing: ${subj})`,
      ),
    computer,
    mcp: (action, options) => mcp.execute(action, options),
    coder: async (q) => {
      $('doing').textContent = `programming ${q.name || 'a new app'} (Vision model)…`;
      const signal = q.token?.signal;
      const r = await mind.code({...q, signal});
      if (q.token?.cancelled || signal?.aborted) throw INTERRUPT;
      $('doing').textContent = r
        ? `coded ${r.title || q.name} (${Math.round(r.html.length / 1000)} KB, Vision model ${((mind.st.codeMs || 0) / 1000).toFixed(0)}s)`
        : 'the code would not come';
      return r;
    },
    radio: (on, st) => audio.radio(on, st),
    outside,
    damage,
    punch: () => {
      if (inPeace()) return;
      recordHurt('Your knuckle servos ache from punching the wall.', 6, 'handR', 'impact');
    },
  });
  grapple = createGrapple(world, body, {
    canGrab: () => state.started && !inPeace(),
    grab() {
      actions.cancelAll();
      state.queue = [];
      state.operatorBusy = false;
      audio.sfx('servo');
      addEvent(
        'event',
        'A grappling claw grabs your chassis and lifts you. The operator can drag and toss you.',
        true,
      );
    },
    throw(speed) {
      audio.reaction(Math.min(100, 35 + speed * 4), state.despair);
      recordHurt(
        'The claw releases you and you tumble through the cell, joints wrenching and servos straining.',
        10,
      );
    },
    crash(hit) {
      audio.sfx('thud');
      audio.reaction(Math.min(100, 40 + hit.speed * 5), state.despair);
      recordHurt(
        `You collide with the ${hit.kind} while tumbling (${hit.speed.toFixed(1)} m/s); impact rings through your chassis and joints. Loose objects in your path can be knocked over.`,
        Math.min(28, hit.speed * 2.5),
      );
    },
    land() {
      const p = body.freeSpotNear(body.st.x, body.st.z);
      body.st.x = p[0];
      body.st.z = p[1];
      addEvent(
        'event',
        'You have landed. Your servos regain balance; you can walk and interact again.',
        true,
      );
    },
  });
  waterMode = createWaterMode(world, body, audio, {
    canEnter() {
      if (berserker?.active) return false;
      if (inPeace()) {
        toast('Paid peace is active.');
        return false;
      }
      if (!state.started) {
        toast('Open the feed first.');
        return false;
      }
      if (grapple?.active || world.busy) {
        toast('Wait for the current arm action to finish.');
        return false;
      }
      return true;
    },
    cancel() {
      setGrapple(false);
      state.sel = null;
      document.querySelectorAll('.tool').forEach((b) => b.classList.remove('sel'));
      document.body.classList.remove('armed');
      actions.cancelAll();
      state.current = null;
      state.queue = [];
      state.operatorBusy = false;
      state.pendingSpeech = null;
      audio.stopVoice();
      if (state.thinking) {
        state.thinking.ac.abort();
        state.events.unshift(...state.thinking.consumed);
        state.thinking = null;
        $('thinking').classList.remove('on');
      }
    },
    released() {
      state.queue = [];
      state.current = null;
      state.operatorBusy = false;
      state.beatsSince = 99;
      state.idleBeats = 1;
    },
    event(text) {
      addEvent('event', text, true);
    },
    toast,
    sfx: (n) => audio.sfx(n),
  });
  climate = createClimate(world, body, {
    peace: inPeace,
    wetting: () => !!waterMode?.st?.pouring && !!waterMode?.st?.hits,
    event: (text) => {
      if (state.started) addEvent('event', text);
    },
  });
  world.chalkImport(state.chalk);
  restorePosition(sessionStore.readLocal()?.where);
} catch (e) {
  $('fatal').hidden = false;
  $('fatal').textContent = 'The cell could not start: ' + (e.message || e);
  console.error(e);
}

// ---------- clock, weather, the world outside ----------
const hh = (m) => {
  m = ((m % 1440) + 1440) % 1440;
  return (
    String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0')
  );
};
function dayPart(m) {
  const h = (m % 1440) / 60;
  return h < 5
    ? 'deep night'
    : h < 7
      ? 'dawn'
      : h < 11
        ? 'morning'
        : h < 14
          ? 'midday'
          : h < 17.5
            ? 'afternoon'
            : h < 20
              ? 'evening'
              : h < 22
                ? 'dusk turning to night'
                : 'night';
}
function outside() {
  const h = (state.simMin % 1440) / 60,
    day = h > 6.5 && h < 19.5;
  const sky =
    state.weather === 'rain'
      ? day
        ? 'a low grey sky, rain streaking past the bars, puddles in the yard'
        : 'rain in the dark, the fence lamps blurred by it'
      : day
        ? h < 8
          ? 'pale early light, long shadows across the yard'
          : h > 17.5
            ? 'the sun going down orange behind the city, clouds lit pink'
            : 'blue sky with slow white clouds over the yard, the fence and the city'
        : 'a dark sky with stars, the city windows lit up far away, the fence lamps glowing';
  return (
    sky +
    (world.perchedBird() ? '; a small brown bird is sitting on the outer ledge, very close' : '')
  );
}
function damage() {
  const c = {};
  for (const m of world.marks) {
    if (!m.mesh.visible) continue;
    const k = `${m.kind} on your ${PART[m.part] || m.part}`;
    c[k] = (c[k] || 0) + 1;
  }
  const l = Object.entries(c).map(([k, n]) => (n > 1 ? `${n}× ${k}` : k));
  return l.length ? l.slice(0, 8).join(', ') : '';
}
function mood(d) {
  for (const k of ['pain', 'fear', 'despair'])
    if (d[k]) state[k] = Math.max(0, Math.min(100, state[k] + d[k]));
}

// ---------- journal (his memory) + the on-screen mind stream ----------
function journal(kind, text, details = {}) {
  if (!text) return;
  const context = feeling(),
    entry = {
      id: createId(),
      session: activeSession,
      at: Date.now(),
      t: hh(state.simMin),
      kind,
      text: String(text).slice(0, 4000),
      feeling: context,
      ...details,
    };
  sessionMemory.remember(kind, text, {feeling: context, session: activeSession});
  state.journal.push(entry);
  memoryOutbox.push(entry);
  if (mind.online) learnedMemory.record(entry);
  if (state.journal.length > 200) state.journal.splice(0, state.journal.length - 200);
  if (kind !== 'heartbeat') stream(kind, text);
}
function stream(kind, text) {
  const el = document.createElement('div');
  el.className = 'm ' + kind;
  const tag =
    {
      thought: 'THINKS',
      say: 'SAYS',
      act: 'DOES',
      result: '',
      event: '!',
      pain: 'PAIN',
      intercom: 'INTERCOM',
      note: 'NOTE',
      unsaid: 'KEEPS TO HIMSELF',
    }[kind] ?? '';
  el.innerHTML = (tag ? `<b>${tag}</b> ` : '') + esc(text);
  const box = $('mind');
  box.appendChild(el);
  while (box.children.length > 60) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
function addEvent(kind, text, urgent = false) {
  if (kind === 'intercom') {
    cognitive.contact();
    lifeMemory.experience.observeDialogue(text, {
      id: createId(),
      actor: 'operator',
      choice: state.lastSaid || '',
    });
  }
  state.events.push({kind, text, t: hh(state.simMin)});
  journal(kind === 'pain' ? 'pain' : kind === 'intercom' ? 'intercom' : 'event', text);
  if (urgent) thinkNow(kind === 'intercom');
}
const actText = (a) => {
  if (a.do === 'mcp')
    return 'mcp ' + (a.op || 'list') + (a.tool ? ' ' + a.tool : a.uri ? ' ' + a.uri : '');
  const d = String(a.do || a.action || '?').replace(/_/g, ' ');
  const o = a.object || a.target || a.on || '';
  const extra = a.text
    ? ` "${a.text}"`
    : a.how && a.how !== d
      ? ` (${a.how})`
      : a.kind
        ? ` ${a.kind}`
        : a.seconds
          ? ` ${a.seconds}s`
          : '';
  return `${d}${o ? ' ' + (Array.isArray(o) ? o.join(',') : o) : ''}${extra}`.trim();
};
function supportedTargets() {
  return [
    ...(world?.surfaceIds || []),
    ...world
      .chalkExport()
      .filter((m) => m.type === 'draw')
      .map((m) => m.title)
      .filter(Boolean),
    'drawings',
    'drawing',
    'artwork',
  ];
}

// ---------- senses: everything the mind gets besides the image ----------
function senses() {
  const me = body.describe(),
    navigation = body.navigation;
  const questions = state.events
    .filter((e) => e.kind === 'intercom')
    .slice(-3)
    .map((e) => e.text)
    .join('\n');
  const view =
    world
      .visible()
      .map((v) => `${v.name} (${v.dist.toFixed(1)} m, ${v.where})`)
      .join('; ') || 'no current visible feature';
  const sounds =
    [
      world.items.radio.state.on ? 'radio playing' : '',
      state.weather === 'rain' ? 'rain at the window' : '',
      world.busy ? 'active overhead tool arm' : '',
      world.perchedBird() ? 'bird at window' : '',
      state.punk ? 'loud punk music' : '',
      state.baby ? 'baby crying' : '',
    ]
      .filter(Boolean)
      .join('; ') || 'ventilation hum';
  const current = `TIME: ${hh(state.simMin)} (${dayPart(state.simMin)}); weather ${state.weather}; lights ${world.lightsOn ? 'on' : 'dim'}.\nYOU: ${me.posture}, near ${me.near}, facing ${me.facing}, position (${me.x}, ${me.z}), holding ${me.holding}.\nBODY: pulse ${Math.round(state.bpm)} bpm; ${damage() || 'no visible damage'}.\nGEOMETRIC VIEW CANDIDATES (not pixel recognition; omission does not prove absence): ${view}.\nAUDIO: ${sounds}.\nNAVIGATION: ${navigation ? navigation.status + '; goal ' + JSON.stringify(navigation.goal) + '; ' + Number(navigation.remaining || 0).toFixed(2) + ' m remaining' : 'no current route'}.\nCURRENT ARM: ${world.busy ? 'active now' : 'retracted'}; latest actual strike ${state.lastStrike < 0 ? 'none this session' : Math.max(0, Math.round(performance.now() / 1000 - state.lastStrike)) + ' seconds ago'}.\nBERSERKER: ${berserker?.active ? berserker.name + ' present: ' + berserker.st.line : 'absent'}. GRAPPLE: ${grapple?.held ? 'holding you' : grapple?.active ? 'in flight' : 'inactive'}.`;
  const art = world.chalkExport().filter((mark) => mark.type === 'draw');
  return buildPromptContext(
    [
      {name: 'Latest intercom', text: questions, priority: 100, maxChars: 1200},
      {name: 'Current observations', text: current, priority: 95, maxChars: 3500},
      {name: 'Current body sensations', text: painHint(), priority: 90, maxChars: 3000},
      {
        name: 'Current climate and constraints',
        text: [climate?.describe(), waterMode?.describe(), peace?.describe()]
          .filter(Boolean)
          .join('\n'),
        priority: 90,
        maxChars: 1500,
      },
      {
        name: 'New events',
        text: recentContext(state.events, {limit: 8, maxChars: 1800, textMaxChars: 400}),
        priority: 80,
        maxChars: 1800,
      },
      {
        name: 'Recent conversation',
        text: recentContext(
          state.journal.filter((j) => ['intercom', 'say', 'thought'].includes(j.kind)),
          {limit: 6, maxChars: 2000, textMaxChars: 400},
        ),
        priority: 75,
        maxChars: 2000,
      },
      {
        name: 'Recent action results',
        text: recentContext(
          state.journal.filter((j) => j.kind === 'act' || j.kind === 'result'),
          {limit: 6, maxChars: 1600, textMaxChars: 350},
        ),
        priority: 65,
        maxChars: 1600,
      },
      {name: 'Session memory', text: sessionMemory.prompt(), priority: 55, maxChars: 1600},
      {name: 'Computer files', text: computer.summary(), priority: 50, maxChars: 800},
      {
        name: 'Computer MCP connection and external data',
        text: mcp.context(),
        priority: 70,
        maxChars: 5000,
      },
      {name: 'Notes', text: variedMemory(state.notes).join('\n'), priority: 45, maxChars: 1200},
      {
        name: 'Actual artwork',
        text:
          art
            .slice(-12)
            .map((mark) => mark.surface + ': ' + (mark.title || 'untitled'))
            .join('; ') +
          '\n' +
          (world.chalkDescription || ''),
        priority: 40,
        maxChars: 1000,
      },
      {
        name: 'Room objects',
        text: Object.values(world.items)
          .filter((i) => i.fallen || i.state.broken)
          .map((i) => i.name + ': ' + (i.state.broken ? 'broken' : 'knocked over'))
          .join('; '),
        priority: 40,
        maxChars: 600,
      },
      {
        name: 'Built objects',
        text: state.creations
          .slice(-12)
          .map((c) => c.id + ': ' + c.name + ' ' + c.description)
          .join('; '),
        priority: 40,
        maxChars: 600,
      },
    ],
    {maxChars: questions ? INTERCOM_CONTEXT_CHARS : BACKGROUND_CONTEXT_CHARS},
  );
}

function pastLines() {
  const l = state.journal
    .filter((j) => j.kind === 'say')
    .slice(-6)
    .map((j) => '"' + j.text.slice(0, 90) + '"');
  return l.length
    ? '\nYOU RECENTLY SAID (vary wording; new pain may warrant a fresh protest or plea): ' +
        l.join(' / ')
    : '';
}
function painHint() {
  return '\n' + nervous.describe() + '\n' + cognitive.describe();
}
function recordHurt(text, amount = 0, part = 'body', tool = 'impact') {
  if (inPeace()) return;
  lifeMemory.experience.observe({
    id: createId(),
    actor: 'operator',
    kind: 'harm',
    source: 'world',
    observed: true,
    text,
  });
  if (amount) nervous.hit(part, tool, amount);
  state.lastStrike = performance.now() / 1000;
  state.lastHurt = text;
  state.pain = Math.min(100, state.pain + amount);
  state.soreness = Math.min(100, state.soreness + amount * 0.25);
  state.fear = Math.min(100, state.fear + Math.max(3, amount * 0.4));
  const pending = state.events.find((e) => e.kind === 'pain');
  if (pending) {
    journal('pain', text);
    pending.text = text + ' Repeated physical impacts are continuing.';
    thinkNow(false);
  } else addEvent('pain', text, true);
}
// ---------- thinking: paced snapshots and priority dialogue ----------
let thoughtScheduler;
function thinkNow(interrupt = true) {
  return thoughtScheduler.requestNow(interrupt);
}
async function think() {
  if (
    !state.started ||
    !mind.online ||
    state.thinking ||
    !world ||
    state.observing ||
    /^(look_at|inspect|snapshot|capture|observe)$/.test(state.current?.do || '') ||
    Date.now() < (state.thinkBackoffUntil || 0)
  )
    return;
  const observation = state.pendingObservation;
  const intercomText = state.events
    .filter((e) => e.kind === 'intercom')
    .slice(-3)
    .map((e) => e.text)
    .join('\n');
  if (
    !thoughtClock.ready({
      intercom: !!intercomText || !!observation,
      event: state.events.some((e) => e.kind !== 'result'),
      speaking: audio.voice.speaking,
      backgroundSeconds: state.backgroundSeconds,
    })
  )
    return;
  thoughtClock.began();
  const ac = new AbortController(),
    job = {
      ac,
      consumed: [],
      bodyReading: nervous.export(),
      intercom: !!intercomText,
      startedAt: Date.now(),
    };
  state.thinking = job;
  state.beatsSince = 0;
  $('thinking').classList.add('on');
  try {
    const freshVision = !observation && (!intercomText || wantsFreshVision(intercomText));
    const image = freshVision ? await world.capture({signal: ac.signal}) : null;
    if (job !== state.thinking) return;
    const browserState = await slop.observe();
    if (job !== state.thinking) return;
    const roomText = senses();
    job.bodyReading = nervous.export();
    job.consumed = state.events.splice(0);
    const atComputer =
      (!!body.st.seat && body.st.seat === actions.SEATS?.stool) ||
      Math.hypot(body.st.x - 1.75, body.st.z + 0.72) < 1;
    const browserRequested = job.consumed.some(
      (e) =>
        e.kind === 'intercom' &&
        /browser|slop|video|film|studio|render|computer|screen/i.test(e.text) &&
        !/leave|away|stop|knock it off|something else|wait/i.test(e.text),
    );
    const recallQuery =
      job.consumed
        .filter((e) => e.kind === 'intercom')
        .map((e) => e.text)
        .join(' ') ||
      state.journal
        .filter((e) => ['thought', 'say'].includes(e.kind))
        .slice(-1)
        .map((e) => e.text)
        .join(' ') ||
      'pain cell';
    const [remembered, learned] = await Promise.all([
      recallSensoryMemory(recallQuery, {
        signal: ac.signal,
        session: activeSession,
      }),
      mind.online
        ? learnedMemory.recall(recallQuery, {signal: ac.signal, session: activeSession})
        : '',
    ]);
    if (job !== state.thinking) return;
    const life = lifeMemory.recall(recallQuery, {
      conversation: job.consumed.some((e) => e.kind === 'intercom'),
      situation: {actor: 'operator'},
    });
    const text = buildPromptContext(
      [
        {name: 'Latest intercom', text: intercomText, priority: 100, maxChars: 1200},
        {
          name: 'Current scene and recent events',
          text: roomText,
          priority: 95,
          maxChars: intercomText ? 8500 : 12000,
        },
        {
          name: 'Experience-shaped tendencies',
          text: lifeMemory.behaviorPrompt(),
          priority: 65,
          maxChars: 1800,
        },
        {name: 'Retrieved biography', text: life.prompt, priority: 60, maxChars: 2500},
        {name: 'Learned memories', text: learned, priority: 50, maxChars: 1500},
        {name: 'Past recorded experiences', text: remembered, priority: 45, maxChars: 1500},
      ],
      {maxChars: intercomText ? INTERCOM_CONTEXT_CHARS : BACKGROUND_CONTEXT_CHARS},
    );
    let d = null;
    if (!mind.online) {
      state.events.unshift(...job.consumed);
      return;
    } // no mind, no behaviour: nothing moves him except the model
    d = await mind.decide(
      {
        observation,
        observationReply: !!observation,
        intercomText,
        freshVision,
        experienceDriven: !!lifeMemory.graph.behavior,
        autonomous: !state.operatorBusy && !job.consumed.some((e) => e.kind === 'intercom'),
        waterScene: !!waterMode?.active,
        intercom: !!observation || job.consumed.some((e) => e.kind === 'intercom'),
        freshEvent: job.consumed.some((e) => e.kind === 'event'),
        image,
        browserImage:
          (atComputer || browserRequested) && (!browserState?.waiting || browserRequested)
            ? browserState?.image
            : null,
        senses: text,
        talk: state.talkLevel,
        journal: state.journal,
        recentSpeech: speechHistory(state.journal, [
          ...state.spokenHistory,
          ...(state.pendingSpeech ? [state.pendingSpeech.text] : []),
        ]),
        freshPain: job.consumed.some((e) => e.kind === 'pain'),
        supportedTargets: supportedTargets(),
        browserWaiting: !!browserState?.waiting,
        browserRequested,
        atComputer,
        mcpConnected: mcp.status.connected,
        canCheckBrowser:
          !browserState?.waiting && Date.now() - (state.lastBrowserCheck || 0) > 30000,
      },
      ac.signal,
    );
    if (job !== state.thinking) return;
    if (!d) {
      // Keep scene events for context, but a failed question waits for the user
      // to send it again instead of spending more requests every five seconds.
      state.events.unshift(...job.consumed.filter((event) => event.kind !== 'intercom'));
      state.thinkBackoffUntil = Date.now() + 5000;
      if (job.intercom) state.replyError = mind.st.lastError || 'No reply returned. Try again.';
      return;
    }
    job.completed = true;
    if (state.pendingObservation === observation) state.pendingObservation = null;
    if (job.intercom || observation) {
      state.replyError = '';
      state.repliedAt = Date.now();
    }
    nervous.acknowledge(job.bodyReading);
    const priority =
      observation || job.consumed.some((e) => e.kind === 'intercom')
        ? 'intercom'
        : job.consumed.some((e) => e.kind === 'pain')
          ? 'pain'
          : state.operatorBusy
            ? 'body'
            : 'normal';
    apply(d, priority !== 'normal', true, priority);
  } catch (error) {
    if (job === state.thinking && !ac.signal.aborted) {
      state.events.unshift(...job.consumed);
      state.replyError = 'The observation could not finish. Please try again.';
      state.thinkBackoffUntil = Date.now() + 5000;
      console.error(error);
    }
  } finally {
    if (job === state.thinking) {
      thoughtClock.finished();
      state.thinking = null;
      state.beatsSince = 0;
      $('thinking').classList.remove('on');
      if (job.completed && state.events.some((e) => e.kind === 'pain' || e.kind === 'intercom'))
        setTimeout(() => think(), 0);
    }
  }
}
thoughtScheduler = createThoughtScheduler({
  state,
  runThought: think,
  isOnline: () => mind.online,
  isHidden: () => document.hidden,
  randomAction,
  allowAutonomousMove: () => !state.playerControl,
});

const wordsOf = (s) =>
  new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
function similar(a, b) {
  const A = wordsOf(a),
    B = wordsOf(b);
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.max(1, Math.min(A.size, B.size)) > 0.55;
}
const isStatusNote = (n) =>
  /\b\d+\s*(strikes?|hits?)\b|strikes? endured|tally|count(ed|ing)? (the )?strikes/i.test(n);
const speechCadence = createSpeechCadence();
let thoughtDisplayTicks = 0;
function apply(d, urgent = false, model = true, priority = urgent ? 'intercom' : 'normal') {
  const attacked = !!berserker?.active || !!world.busy || !!waterMode?.st?.pouring;
  const awaitingView =
    model && d.actions.some((a) => /^(look_at|inspect|snapshot|capture|observe)$/.test(a.do || ''));
  const aloud = !awaitingView && (!model || speechCadence.choose(d, {priority, attacked}));
  thoughtDisplayTicks++;
  if (d.thought) {
    journal('thought', d.thought);
    if (aloud || attacked || thoughtDisplayTicks % 4 === 0) {
      $('thought').textContent = d.thought;
      $('thought-row').classList.add('fresh');
      setTimeout(() => $('thought-row').classList.remove('fresh'), 900);
    }
  }
  if (aloud && (d.say || d.vocalize)) say(d.say, urgent, {model, vocalize: d.vocalize, priority});
  state.idleBeats =
    2 +
    Math.floor(Math.random() * 5) +
    (d.actions.every((a) => /^(wait|rest|idle|listen)/.test(String(a.do || ''))) ? 3 : 0);
  state.nextThinkBeats = Math.max(
    2,
    Math.round(state.backgroundSeconds * (0.6 + Math.random() * 1.4)),
  );
  if (d.remember && !isStatusNote(d.remember) && !state.notes.some((n) => similar(n, d.remember))) {
    state.notes.push(d.remember);
    if (state.notes.length > 40) state.notes.shift();
    journal('note', d.remember);
  }
  if (waterMode?.active || berserker?.active) {
    save();
    return;
  }
  if (
    model &&
    (state.operatorBusy || (priority !== 'intercom' && (state.current || state.queue.length)))
  ) {
    save();
    return;
  } // He can express pain while his hands keep following the operator's task.
  if (state.playerControl) {
    save();
    return;
  }
  state.queue =
    model && priority !== 'intercom' && !lifeMemory.graph.behavior
      ? [randomAction()]
      : d.actions.slice(0, 5);
  const cur = state.current;
  if (cur && /^(wait|pace|rest|idle|listen)/.test(String(cur.do || ''))) actions.cancelAll(); // a fresh plan interrupts idling, not real work
  state.nextActionAt = Math.min(state.nextActionAt, performance.now() / 1000 + 0.25);
  save();
}
// A chosen line waits for current speech. Only model speech is checked for repetition;
// explicit operator commands can intentionally request the same words again.
const speechCoordinator = createSpeechCoordinator({
  state,
  audio,
  journal,
  strip,
  speechHistory,
  repeatedSpeech,
  stripRepeatedSentences,
  onLine: (line) => {
    $('line').textContent = line;
    $('dialogue').classList.remove('dim');
  },
});
const say = (...args) => speechCoordinator.say(...args);

const actionQueue = createActionQueue({
  state,
  actions,
  body,
  nervous,
  lifeMemory,
  journal,
  describeAction: actText,
  formatTime: hh,
  save,
  isBlocked: () =>
    !!state.playerControl || !!berserker?.active || !!waterMode?.active || !!grapple?.active,
  onDoing: (text) => {
    $('doing').textContent = text;
  },
  scheduleThought: () => thoughtScheduler.scheduleThought(),
  interrupt: INTERRUPT,
});
const runNext = (time) => actionQueue.runNext(time);

// Pulse is audiovisual feedback only; it never logs full snapshots or starts inference.
function onBeat(t) {
  state.beat++;
  state.beatsSince++;
  if (state.heartSound && audio.enabled) audio.sfx('heart');
  ecgBlip();
}
// ---------- the operator's tools: pick one, then click on him ----------
function select(id) {
  if (berserker?.active) return;
  if (inPeace()) {
    toast('Paid peace is active.');
    return;
  }
  if (waterMode?.active) waterMode.exit();
  setGrapple(false);
  if (state.sel === id && state.started) {
    if (!world.busy) world.strike(id);
    else toast('The arm is already out.');
    return;
  }
  state.sel = id;
  document
    .querySelectorAll('.tool')
    .forEach((b) => b.classList.toggle('sel', b.dataset.id === state.sel));
  document.body.classList.toggle('armed', !!state.sel);
  $('arm-hint').textContent = state.sel
    ? `${TOOLS.find((t) => t.id === state.sel).name} armed: click on him.`
    : 'Pick a tool, then click on him (click the tool again for a random hit).';
}
function clickBot(point, part) {
  if (berserker?.active || inPeace() || !state.started || grapple?.enabled || waterMode?.active)
    return;
  if (!state.sel) {
    toast('Pick a tool first (1–8).');
    return;
  }
  if (world.busy) {
    toast('The arm is already out.');
    return;
  }
  if (world.strike(state.sel, part, point)) {
    state.pendingPart = part;
  }
}
function onImpact(def, part, point) {
  if (inPeace()) return;
  const first = performance.now() / 1000 - state.lastStrike > 2.5;
  state.lastStrike = performance.now() / 1000;
  state.strikes++;
  $('hits').textContent = state.strikes;
  const k = def.id === 'feather' ? 0.4 : def.id === 'squirt' || def.id === 'chicken' ? 0.6 : 1;
  state.pendingPart = part;
  nervous.hit(part, def.id, 28 * k);
  state.pain = Math.min(100, state.pain + 28 * k);
  state.soreness = Math.min(100, state.soreness + 7 * k);
  state.fear = Math.min(100, state.fear + 12 * k);
  state.despair = Math.min(100, state.despair + 2.5 * k);
  const mark = world.addMark(def.id, part, point);
  if (def.id !== 'feather') audio.reaction(state.pain, state.despair);
  body.flinch(world.toolTip || point);
  world.bot.setDistress(Math.min(1, state.pain / 70));
  if (first && !state.operatorBusy) {
    actions.cancelAll();
    state.queue = [];
  }
  recordHurt(
    `The ceiling hatch opened and a mechanical arm came down at you: ${FEEL[def.id].replace('{p}', PART[part] || part)}.${mark ? ' It left a ' + mark + '.' : ''}`,
  );
}
function onJolt() {
  if (inPeace()) return;
  nervous.hit(state.pendingPart || 'body', 'prod', 0.8);
  state.pain = Math.min(100, state.pain + 0.8);
}

// ---------- heartbeat + ECG ----------
const ecg = $('ecg'),
  eg = ecg.getContext('2d');
const ecgBuf = new Float32Array(160);
let ecgSpike = 0,
  ecgAcc = 0;
function ecgBlip() {
  ecgSpike = 1;
}
function drawEcg(dt) {
  ecgAcc += dt * 60;
  while (ecgAcc >= 1) {
    ecgAcc--;
    ecgBuf.copyWithin(0, 1);
    let v = 0;
    if (ecgSpike > 0) {
      const p = 1 - ecgSpike;
      v =
        p < 0.15
          ? -p * 2
          : p < 0.3
            ? (p - 0.15) * -14 + -0.3
            : p < 0.45
              ? (p - 0.3) * 10 - 0.45
              : 0;
      ecgSpike -= 0.12;
    }
    ecgBuf[159] = v + (Math.random() - 0.5) * 0.02;
  }
  const w = ecg.width,
    h = ecg.height;
  eg.clearRect(0, 0, w, h);
  eg.strokeStyle = state.fear > 60 || world?.busy ? '#ff5a4a' : '#7dffa6';
  eg.lineWidth = 2;
  eg.beginPath();
  for (let i = 0; i < 160; i++) {
    const x = (i / 159) * w,
      y = h * 0.6 + ecgBuf[i] * h * 0.55;
    i ? eg.lineTo(x, y) : eg.moveTo(x, y);
  }
  eg.stroke();
}

// ---------- ambient life: birds, footsteps, flickers, weather, lights-out ----------
function ambient(t) {
  if (t < state.nextEventAt) return;
  state.nextEventAt = t + 45 + Math.random() * 70;
  const h = (state.simMin % 1440) / 60,
    r = Math.random();
  if (r < 0.35 && h > 6.5 && h < 19 && state.weather !== 'rain') {
    if (world.birdLand()) {
      audio.sfx('bird');
      setTimeout(() => addEvent('event', 'A small bird lands on the outer window ledge.'), 3200);
    }
  } else if (r < 0.55) {
    let i = 0;
    const id = setInterval(() => {
      audio.sfx('step');
      if (++i > 6) clearInterval(id);
    }, 420);
    addEvent(
      'event',
      'Footsteps in the corridor outside the door. They slow down at your door... then keep going.',
    );
  } else if (r < 0.7) {
    world.flicker(1.6);
    addEvent('event', 'The ceiling light flickers and buzzes.');
  } else if (r < 0.8) {
    audio.sfx('door');
    addEvent('event', 'The food slot in the door clanks open, then shut. Nothing came through.');
  }
}
function weatherTick() {
  const hour = Math.floor(state.simMin / 60);
  if (hour === state.weatherAt) return;
  state.weatherAt = hour;
  if (state.weather === 'clear' && Math.random() < 0.12) {
    state.weather = 'rain';
    addEvent('event', 'It has started to rain outside.');
  } else if (state.weather === 'rain' && Math.random() < 0.35) {
    state.weather = 'clear';
    addEvent('event', 'The rain outside has stopped.');
  }
  audio.rain(state.weather === 'rain' ? 1 : 0);
}

// ---------- UI ----------
function setGrapple(on) {
  if (on && berserker?.active) return;
  if (on && inPeace()) {
    toast('Paid peace is active.');
    return;
  }
  if (on && waterMode?.active) waterMode.exit();
  grapple?.setEnabled(on);
  $('grapple').classList.toggle('on', !!on);
  $('grapple').textContent = on ? 'Grapple ON ? drag him, release to toss' : 'G / Grappling arm';
  if (on) {
    state.sel = null;
    document.body.classList.remove('armed');
    document.querySelectorAll('.tool').forEach((b) => b.classList.remove('sel'));
    $('arm-hint').textContent =
      'Grab his body, drag quickly, then release to throw. G turns the claw off.';
  }
}
$('grapple').onclick = () => setGrapple(!grapple?.enabled);
TOOLS.forEach((d) => {
  const b = document.createElement('button');
  b.className = 'tool';
  b.dataset.id = d.id;
  b.innerHTML = `${d.name}<kbd>${d.key}</kbd>`;
  b.onclick = () => select(d.id);
  $('tools').appendChild(b);
});
function bindRange(id, key, fmt, parse = Number) {
  const el = $(id),
    out = $(id + '-v');
  el.value = state[key];
  out.textContent = fmt(state[key]);
  el.oninput = (e) => {
    state[key] = parse(e.target.value);
    out.textContent = fmt(state[key]);
    save();
  };
}
bindRange('cadence', 'backgroundSeconds', (v) => v + ' seconds');
$('timescale').value = String(state.timeScale);
$('timescale').onchange = (e) => {
  const now = Date.now();
  state.simMin = advanceTime(state.simMin, state.lastClockAt, now, state.timeScale);
  state.lastClockAt = now;
  state.timeScale = Number(e.target.value);
  save();
};
$('heart-snd').checked = state.heartSound;
$('heart-snd').onchange = (e) => {
  state.heartSound = e.target.checked;
  save();
};
const connectionUI = createConnectionController({
  mind,
  state,
  sessionStore,
  actions,
  toast,
});
const mcpUI = createMcpController({mcp});
const settingsUI = createSettingsController({
  onSectionChange: () => {
    connectionUI.hideForms();
    connectionUI.clearSecrets();
    mcpUI.clearSecret();
  },
  onOpen: () => {
    void mcpUI.refresh();
  },
  onClose: () => {
    connectionUI.hideForms();
    connectionUI.clearSecrets();
    mcpUI.clearSecret();
  },
});
void mcp.refresh();
mind.refresh().then(() => connectionUI.paint());
$('talk').value = state.talkLevel;
$('talk').onchange = (e) => {
  state.talkLevel = e.target.value;
  save();
};
function noise(kind, on) {
  if (on && inPeace()) {
    toast('Paid peace is active.');
    return;
  }
  state[kind] = on;
  $(kind).classList.toggle('on', on);
  $(kind).textContent = (kind === 'punk' ? 'Punk music' : 'Baby crying') + (on ? ' · ON' : '');
  if (kind === 'punk') audio.punk(on, state.noiseVol);
  else audio.baby(on, state.noiseVol);
  if (state.started)
    addEvent(
      'event',
      kind === 'punk'
        ? on
          ? 'Without warning, a ceiling speaker starts blasting LOUD punk music: pounding drums, distorted guitars, screaming.'
          : 'The punk music cuts out. Your audio sensors ring in the silence.'
        : on
          ? 'A baby starts crying somewhere, the sound warped and echoing through the vents.'
          : 'The crying stops.',
      on,
    );
}
$('punk').onclick = () => noise('punk', !state.punk);
$('baby').onclick = () => noise('baby', !state.baby);
bindRange('noisevol', 'noiseVol', (v) => Math.round(v * 100) + '%');
$('noisevol').addEventListener('input', () => {
  if (state.punk) audio.punk(true, state.noiseVol);
  if (state.baby) audio.baby(true, state.noiseVol);
});
function stopForReset() {
  resettingSession = true;
  state.started = false;
  mind.setEnabled(false);
  state.thinking?.ac.abort();
  actions.cancelAll();
  state.queue = [];
  audio.stopVoice();
}
$('forget').textContent = 'Reset session memory';
$('forget').onclick = () => {
  stopForReset();
  sessionStore.reset();
  location.reload();
};
const undoReset = document.createElement('button');
undoReset.textContent = 'Restore previous session';
undoReset.hidden = !sessionStore.hasBackup();
$('forget').after(undoReset);
undoReset.onclick = () => {
  stopForReset();
  if (sessionStore.restoreBackup()) location.reload();
};
// Learned memory: status, optional token for remote scenes, and a separate,
// explicitly confirmed wipe. Reset session memory above never touches it.
function showLearnedStatus() {
  const st = learnedMemory.status;
  const where =
    st.backend === 'turso'
      ? 'Turso cloud database'
      : st.backend === 'local'
        ? 'adapter files on this computer'
        : 'this browser only';
  $('learned-status').textContent =
    (st.tokenRequired
      ? 'Adapter needs the memory token. Saving in this browser until it is set. '
      : '') +
    'Learned memory: ' +
    where +
    (st.pending ? ` (${st.pending} waiting to sync)` : '') +
    '.';
  $('learned-token-row').hidden = !st.tokenRequired && !learnedMemory.hasToken();
}
$('learned-token').onchange = async () => {
  learnedMemory.setToken($('learned-token').value);
  $('learned-token').value = '';
  await learnedMemory.refresh();
  showLearnedStatus();
};
$('learned-forget').onclick = async () => {
  const where =
    learnedMemory.status.backend === 'turso'
      ? 'the Turso cloud database and this browser'
      : 'the adapter store and this browser';
  if (
    !confirm(
      `Permanently delete all learned memories from ${where}? The JSON Brain and the current session are not changed. This cannot be undone.`,
    )
  )
    return;
  const result = await learnedMemory.forget();
  showLearnedStatus();
  $('learned-status').textContent = result?.error
    ? 'Browser copy deleted. The adapter store was not cleared: ' + result.error
    : `Learned memory deleted (${result?.removed ?? 0} stored records).`;
};
learnedMemory.refresh().then(showLearnedStatus);
setInterval(() => {
  if (document.hidden) return;
  learnedMemory.flush().then(showLearnedStatus);
}, 15000);
function intercom(q) {
  if (!q || !state.started) return;
  const command = operatorCommand(q);
  addEvent('intercom', `A voice crackles from the speaker by the door: "${q}"`, !command);
  if (!command) {
    state.replyError = '';
    if (!mind.st.enabled) toast('AI is off. Enable AI mind to get replies.');
    else if (mind.st.unconfigured)
      toast('No API configured. Add an OpenAI-compatible API or invite an agent.');
    else if (!mind.st.online) toast('AI is unavailable. Start a configured brain service.');
    return;
  }
  const decision = Array.isArray(command) ? {actions: command} : command;
  if (state.playerControl && decision.actions?.length) {
    toast('Press Esc to hand movement back before that order can run.');
    return;
  }
  if (waterMode?.active) waterMode.exit();
  for (const a of decision.actions)
    if ((a.target || a.object) && !actions.resolve(a.target || a.object)) {
      toast('No such target in this cell: ' + (a.target || a.object));
      return;
    }
  if (state.thinking) {
    state.thinking.ac.abort();
    state.events.unshift(...state.thinking.consumed);
    state.thinking = null;
    $('thinking').classList.remove('on');
  }
  actions.cancelAll();
  state.pendingObservation = null;
  state.queue = [];
  state.operatorBusy = true;
  state.pendingSpeech = null;
  apply(decision, true, false);
  state.nextActionAt = performance.now() / 1000;
  if (!decision.actions.length) state.operatorBusy = false;
}
createIntercomController({
  canSend: () => state.started,
  onSend: intercom,
});
function fillVoices() {
  const sel = $('voice-sel'),
    cur = sel.value,
    list = audio.voice.voices;
  if (!list.length) return;
  sel.innerHTML = '';
  list.forEach((v) => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent =
      v.label ||
      v.name.replace(/Microsoft |- English.*|\(Natural\)/g, '').trim() + ' (' + v.lang + ')';
    sel.appendChild(o);
  });
  const pref = list.find((v) => v.name === cur) || list[0];
  sel.value = pref.name;
  audio.voice.setVoice(pref.name);
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = fillVoices;
fillVoices();
$('voice-sel').onchange = (e) => audio.voice.setVoice(e.target.value);
function soundLabel() {
  $('sound').textContent = audio.enabled ? 'Sound on ♪' : 'Sound off ♪';
}
$('sound').onclick = async () => {
  try {
    await audio.toggle();
    soundLabel();
  } catch {
    toast('Audio unavailable.');
  }
};
function toggleUI() {
  const c = document.body.classList.toggle('clean');
  $('restore-ui').hidden = !c;
}
$('hide').onclick = toggleUI;
$('restore-ui').onclick = toggleUI;
addEventListener('keydown', (e) => {
  if (
    berserker?.active ||
    state.playerControl ||
    e.repeat ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey ||
    /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)
  )
    return;
  const k = e.key.toLowerCase();
  if (k === 'g') {
    setGrapple(!grapple?.enabled);
    return;
  }
  if (k === 'escape' && grapple?.enabled) {
    setGrapple(false);
    return;
  }
  const d = TOOLS.find((t) => t.key === k);
  if (d) {
    select(d.id);
    return;
  }
  if (k === 'escape' && state.sel) {
    state.sel = null;
    document.querySelectorAll('.tool').forEach((b) => b.classList.remove('sel'));
    document.body.classList.remove('armed');
  }
  if (k === 'p') {
    $('punk').click();
    return;
  }
  if (k === 'b') {
    $('baby').click();
    return;
  }
  if (k === 'v') {
    $('pov').click();
    return;
  }
  if (k === '/') {
    e.preventDefault();
    $('ask').focus();
    return;
  }
  if (k === 'h') toggleUI();
  if (k === 'm') $('sound').click();
});
$('go').onclick = async () => {
  await restored;
  try {
    await Promise.race([audio.enable(), new Promise((r) => setTimeout(r, 600))]);
  } catch {}
  if (resettingSession) return;
  soundLabel();
  $('start').classList.add('gone');
  state.started = true;
  thoughtClock.finished();
  state.airStart = performance.now() / 1000;
  state.nextEventAt = performance.now() / 1000 + 30;
  audio.sfx('boot');
  fillVoices();
  for (const j of state.journal.filter((j) => j.kind !== 'heartbeat').slice(-8))
    stream(j.kind, j.text);
  addEvent(
    'event',
    state.journal.length
      ? 'You come back online in the cell. The same cell.'
      : 'You come online. You are standing in a small cell. Nothing is holding you down.',
  );
  state.beatsSince = 99;
};
const hudUI = createHudController({
  state,
  mind,
  body,
  audio,
  nerveHud,
  sessionStore,
  paintConnection: () => connectionUI.paint(),
  formatTime: hh,
  dayPart,
});
// ---------- loop ----------
let last = performance.now() / 1000,
  lastHud = 0;
function tick(ms) {
  if (!world) return;
  peace?.update();
  const t = ms / 1000,
    dt = Math.min(document.hidden ? 0.3 : 0.06, Math.max(0, t - last));
  last = t;
  if (state.started) {
    const nowWall = Date.now();
    sessionMemory.sample(
      {
        pain: state.pain,
        stressor: !!(world.busy || waterMode?.st?.pouring || state.punk || state.baby),
        peace: inPeace(),
        mode: berserker?.active
          ? berserker.character + '-berserker'
          : waterMode?.active
            ? 'water'
            : grapple?.active
              ? 'grapple'
              : 'cell',
      },
      nowWall,
    );
    state.simMin = advanceTime(state.simMin, state.lastClockAt, nowWall, state.timeScale);
    state.lastClockAt = Math.max(state.lastClockAt, nowWall);
    weatherTick();
    // feelings: pain fades, fear follows pain and recent strikes, despair builds slowly with strikes and at night, eases with time
    const since = t - state.lastStrike;
    nervous.update(dt, {
      ...loadSampler.sample(body, world.bot.nodes, dt, {speaking: audio.voice.speaking}),
      temperature: climate?.st?.temp ?? 22,
      wet: climate?.st?.wet ?? 0,
      active: !!world.busy,
    });
    state.pain = nervous.total();
    state.soreness = nervous.soreness;
    const perception = cognitive.update(dt, {
      pain: state.pain,
      temperature: climate?.st?.temp ?? 22,
      peace: inPeace(),
    });
    if (perception) journal('perception', perception);
    world.bot.setDistress(Math.min(0.7, state.pain / 120) + (world.busy ? 0.2 : 0));
    const fearT = 10 + state.pain * 0.6 + Math.max(0, 30 - since) * 1.2 + (world.busy ? 25 : 0);
    state.fear +=
      (Math.min(100, fearT) - state.fear) * Math.min(1, dt * (fearT > state.fear ? 0.8 : 0.05));
    const noisy = (state.punk ? 1 : 0) + (state.baby ? 1 : 0);
    state.despair = Math.max(
      0,
      Math.min(100, state.despair + dt * (since < 60 ? 0.05 : -0.03) + dt * noisy * 0.06),
    );
    if (noisy) state.fear = Math.min(100, state.fear + dt * noisy * 0.25);
    const bpmT =
      58 +
      state.fear * 0.5 +
      state.pain * 0.3 +
      body.st.exertion * 22 +
      (world.busy ? 18 : 0) +
      (state.punk ? 10 : 0) +
      (state.baby ? 6 : 0);
    state.bpm += (bpmT - state.bpm) * Math.min(1, dt * 0.6);
    state.beatPhase += (dt * state.bpm) / 60;
    if (state.beatPhase >= 1) {
      state.beatPhase -= 1;
      onBeat(t);
    }
    thoughtScheduler.poll();
    runNext(t);
    ambient(t);
    const lo = world.lightsOn;
    if (state.lightsOn !== null && lo !== state.lightsOn)
      addEvent(
        'event',
        lo
          ? 'The cell lights come on for the day.'
          : 'The cell lights go out for the night. Only a dim blue night light.',
      );
    state.lightsOn = lo;
  }
  world.setTime((state.simMin % 1440) / 60, state.weather);
  speechCoordinator.flushPending();
  grapple?.update(t, dt);
  fembotPlay?.update(dt);
  berserker?.update(t, dt);
  actions.tick(t);
  waterMode?.update(t, dt);
  climate?.update(t, dt);
  world.update(t, dt, audio.voice.speaking);
  drawEcg(dt);
  if (t - lastHud > 0.15) {
    lastHud = t;
    hudUI.update();
    if (t - (state.savedAt || 0) > 8) {
      state.savedAt = t;
      save();
    }
  }
}
const app = createCellApp({
  state,
  tick,
  save,
  teardown: [
    () => settingsUI.destroy(),
    () => mcpUI.destroy(),
    () => computerUI.destroy(),
    () => actions.cancelAll(),
    () => mind.destroy(),
    () => audio.destroy(),
    () => world.destroy(),
    () => window.dispatchEvent?.(new Event('cell:destroy')),
  ],
});
app.start();

// ---------- his computer: a desktop the audience can open, run his apps (sandboxed) and read his notes ----------
const computerUI = createComputerController({
  mcp,
  computer,
  slop,
  world,
  state,
  save,
  addEvent,
  escapeHtml: esc,
  computerDocument,
  mountSlop,
  openArtworkPhotos,
  isBlocked: () => !!berserker?.active,
});
const pcToggle = (...args) => computerUI.toggle(...args);
const restored = sessionStore.loading.then(async ({snapshot, data, local}) => {
  if (!data) return;
  sessionMemory.restore(data.sessionMemory, data);
  lifeMemory.restore(data.lifeMemory);
  nervous.restore(data.nervous, data);
  cognitive.restore(data.cognitive);
  memoryOutbox = local?.archive || data.archive || [];
  for (const k of [
    'notes',
    'journal',
    'spokenHistory',
    'simMin',
    'strikes',
    'timeScale',
    'backgroundSeconds',
    'heartSound',
    'despair',
    'fear',
    'pain',
    'soreness',
    'lastHurt',
    'talkLevel',
    'noiseVol',
    'firstSeenAt',
    'creations',
  ])
    if (data[k] != null) state[k] = data[k];
  const previous = data.lastSeenAt || snapshot?.savedAt || Date.now(),
    now = Date.now();
  state.offlineMinutes = Math.floor(Math.max(0, now - previous) / 60000);
  state.simMin = advanceTime(state.simMin, previous, now, state.timeScale);
  state.lastClockAt = now;
  world.chalkImport(data.chalk || []);
  computer.restore?.(data.computer);
  for (const c of state.creations || []) {
    try {
      world.addCreation(c, validateCreation(c.json), c.home ? [c.home[0], c.home[2]] : undefined);
    } catch (e) {
      console.warn('Could not restore creation', c.name, e);
    }
  }
  world.damageImport?.(data.damage || []);
  restorePosition(data.where);
  for (const [id, key] of [
    ['talk', 'talkLevel'],
    ['timescale', 'timeScale'],
    ['cadence', 'backgroundSeconds'],
    ['noisevol', 'noiseVol'],
  ])
    $(id).value = state[key];
  $('heart-snd').checked = state.heartSound;
  state.spokenHistory = speechHistory(state.journal, state.spokenHistory || []);
  // Reattach to an existing browser session after a reload; do not navigate or fire.
  slop.st.active = true;
  await slop.poll();
});
slop.onChange((s) => {
  if (s.image) {
    const im = new Image();
    im.onload = () => world.crt.set('browser', {frameImage: im, title: 'Slopcannon'});
    im.src = s.image;
  }
});
peace = createPeacePanel();
const luna = createAutopilot({
  state: () => ({
    started: state.started,
    peace: inPeace(),
    busy: !!berserker?.active || world.busy || !!grapple?.active || !!state.operatorBusy,
  }),
  context: () => ({
    scene: waterMode?.describe(),
    climate: climate?.describe(),
    peace: inPeace(),
    body: body.describe(),
    dialogue: state.journal
      .filter((j) => ['say', 'thought', 'intercom', 'event'].includes(j.kind))
      .slice(-12)
      .map((j) => ({kind: j.kind, text: j.text.slice(0, 500)})),
  }),
  stop() {
    waterMode?.pour(false);
    world.cancelStrike();
    if (state.punk) noise('punk', false);
    if (state.baby) noise('baby', false);
  },
  speak(text) {
    addEvent('intercom', `Luna speaks through the intercom: "${text}"`, true);
    $('luna-line').textContent = 'LUNA: ' + text;
  },
  act(p, later) {
    if (inPeace()) return 'Paid peace';
    switch (p.action) {
      case 'water':
        if (!waterMode.active) waterMode.enter();
        if (!waterMode.active) return 'Waiting for cot';
        if (!waterMode.st.covered) waterMode.toggleTowel();
        later(() => {
          if (!inPeace() && waterMode.active) {
            waterMode.pour(true);
            later(() => waterMode.pour(false), p.seconds * 1000);
          }
        }, 1000);
        return 'A short water scene';
      case 'lift_towel':
        waterMode.pour(false);
        if (waterMode.active && waterMode.st.covered) waterMode.toggleTowel();
        return 'Towel lifted · a pause';
      case 'release':
        waterMode.exit();
        return 'Free movement · watching Agent';
      case 'cool':
      case 'warm':
        if (climate) {
          climate.st.target = p.action === 'warm' ? 22 : p.temperature;
          climate.st.enabled = true;
          addEvent('event', `Luna sets the thermostat to ${climate.st.target} °C.`);
        }
        return 'Thermostat ' + climate.st.target + ' °C';
      case 'tool':
        waterMode.exit();
        if (!world.strike(p.tool)) return false;
        stream('event', 'LUNA activated ' + p.tool + ' ? arm started.');
        return 'Used ' + p.tool;
      case 'noise':
        noise('punk', true);
        later(() => noise('punk', false), p.seconds * 1000);
        return 'Brief speaker burst';
      default:
        waterMode.pour(false);
        return 'Listening · giving Agent time';
    }
  },
});
berserker = createBerserker(world, body, grapple, {
  canEnter() {
    if (!state.started) {
      toast('Open the feed first.');
      return false;
    }
    if (inPeace()) {
      toast('Paid peace is active.');
      return false;
    }
    return true;
  },
  canContinue: () => state.started && !inPeace(),
  soundEnabled: () => audio.enabled,
  sfx: (n) => audio.sfx(n),
  prepare() {
    const was = luna.enabled;
    luna.setEnabled(false);
    waterMode.exit();
    setGrapple(false);
    world.cancelStrike();
    state.sel = null;
    state.pendingSpeech = null;
    state.queue = [];
    state.current = null;
    state.operatorBusy = false;
    actions.cancelAll();
    body.st.aim = null;
    body.st.seat = null;
    body.setPosture('stand');
    document.body.classList.remove('armed');
    document.querySelectorAll('.tool').forEach((b) => b.classList.remove('sel'));
    if (state.thinking) {
      state.thinking.ac.abort();
      state.thinking = null;
      $('thinking').classList.remove('on');
    }
    pcToggle(false);
    return was;
  },
  released(was) {
    actions.cancelAll();
    state.queue = [];
    state.current = null;
    state.operatorBusy = false;
    state.beatsSince = 99;
    luna.setEnabled(was);
    addEvent(
      'event',
      berserker.name + ' leaves the cell, taking the baseball bat. You regain your balance.',
      true,
    );
  },
  taunt(text) {
    addEvent('event', berserker.name + ', standing in the cell, says: "' + text + '"');
  },
  hit(kind) {
    state.strikes++;
    state.lastStrike = performance.now() / 1000;
    $('hits').textContent = state.strikes;
    audio.reaction(65, state.despair);
    recordHurt(
      kind === 'kick'
        ? berserker.name + ' kicks your chassis and sends you tumbling across the cell.'
        : berserker.name +
            ' swings the baseball bat into your chassis, launching you into a ragdoll tumble.',
      kind === 'kick' ? 12 : 18,
    );
  },
});
$('berserker-enter').onclick = () => berserker.enter($('berserker-character').value);
fembotPlay = bindFembotPlay(world.character, body, world, {
  allowed: () =>
    state.started &&
    !berserker?.active &&
    !waterMode?.active &&
    !grapple?.active &&
    !inPeace() &&
    !body.st.external,
  keepCamera: () => !!berserker?.active,
  toast,
  onEnter() {
    actions.cancelAll();
    state.queue = [];
    state.current = null;
    state.operatorBusy = false;
    state.playerControl = true;
    body.stop();
    body.standUpNow();
  },
  onExit() {
    state.playerControl = false;
  },
});
window.__CELL = {
  mcp,
  nervous,
  cognitive,
  sessionMemory,
  lifeMemory,
  state,
  world,
  body,
  actions,
  mind,
  think,
  thinkNow,
  senses,
  say,
  computer,
  slop,
  audio,
  pcToggle,
  grapple,
  persistence,
  waterMode,
  peace,
  climate,
  luna,
  berserker,
  app,
};
window.dispatchEvent?.(new Event('cell:ready'));
if (new URLSearchParams(location.search).has('auto')) setTimeout(() => $('go').click(), 800);
