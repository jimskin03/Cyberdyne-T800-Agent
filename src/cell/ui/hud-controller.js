export function createHudController({
  document = globalThis.document,
  state,
  mind,
  body,
  audio,
  nerveHud,
  sessionStore,
  paintConnection,
  formatTime,
  dayPart,
  now = () => performance.now() / 1000,
} = {}) {
  const $ = (id) => document.getElementById(id);
  const meters = Object.fromEntries(
    ['pain', 'fear', 'despair', 'dignity'].map((key) => [key, [$('m-' + key), $('v-' + key)]]),
  );

  function update() {
    paintConnection();
    nerveHud.update(sessionStore.status);

    const dignity = Math.max(0, 100 - state.despair * 0.6 - state.pain * 0.3);
    for (const [key, value] of [
      ['pain', state.pain],
      ['fear', state.fear],
      ['despair', state.despair],
      ['dignity', dignity],
    ]) {
      meters[key][0].style.width = value + '%';
      meters[key][1].textContent = Math.round(value);
    }

    $('bpm').textContent = Math.round(state.bpm);
    $('clock').textContent =
      formatTime(state.simMin) +
      ' · ' +
      (state.weather === 'rain' ? 'RAIN' : dayPart(state.simMin).toUpperCase());

    const elapsed = state.started ? Math.floor(now() - state.airStart) : 0;
    $('air').textContent =
      'ON AIR ' +
      String(Math.floor(elapsed / 3600)).padStart(2, '0') +
      ':' +
      String(Math.floor(elapsed / 60) % 60).padStart(2, '0') +
      ':' +
      String(elapsed % 60).padStart(2, '0');

    const description = body.describe();
    $('status').textContent =
      `${description.posture} · near ${description.near} · facing ${description.facing} · holding ${description.holding}`;
    if (!audio.voice.speaking) $('dialogue').classList.add('dim');
  }

  return {update};
}
