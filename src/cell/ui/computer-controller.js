export function createComputerController({
  document = globalThis.document,
  window = globalThis.window,
  computer,
  slop,
  world,
  state,
  save,
  addEvent,
  escapeHtml,
  computerDocument,
  mountSlop,
  openArtworkPhotos,
  isBlocked = () => false,
  now = () => performance.now() / 1000,
} = {}) {
  const $ = (id) => document.getElementById(id);
  let openedAt = -1e9;

  function render() {
    const box = $('pc-icons');
    box.innerHTML = '';
    const files = [
      ...computer
        .apps()
        .map((app) => ({kind: 'app', name: app.name, sub: 'v' + app.versions.length})),
      ...computer.notes().map((note) => ({
        kind: 'note',
        name: note.title,
        sub: new Date(note.t).toLocaleDateString(),
      })),
    ];
    if (!files.length) {
      box.innerHTML =
        '<p class="pc-empty">No files yet. He has not written any programs or notes. Give him time.</p>';
      return;
    }
    for (const file of files) {
      const button = document.createElement('button');
      button.className = 'pc-icon ' + file.kind;
      button.innerHTML = `<i>${file.kind === 'browser' ? 'WWW' : file.kind === 'app' ? '&lt;/&gt;' : 'TXT'}</i><span>${escapeHtml(file.name)}</span><small>${escapeHtml(file.sub)}</small>`;
      button.onclick = () => open(file);
      box.appendChild(button);
    }
  }

  function open(file) {
    const win = $('pc-win');
    const body = $('pc-win-body');
    $('pc-win-title').textContent = file.name;
    win.hidden = false;
    $('pc-ver').hidden = file.kind !== 'app';
    $('pc-dl').hidden = file.kind !== 'app';
    body.innerHTML = '';

    if (file.kind === 'browser') {
      mountSlop(body, slop);
      $('pc-sum').textContent = 'Live Slopcannon on the unit’s CRT';
      slop.act({op: 'open'});
      return;
    }

    if (file.kind === 'note') {
      const note = computer.notes().find((item) => item.title === file.name);
      const pre = document.createElement('pre');
      pre.textContent = note ? note.text : '';
      body.appendChild(pre);
    } else {
      const app = computer.app(file.name);
      const select = $('pc-ver');
      select.innerHTML = '';
      app.versions.forEach((version, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent =
          'v' +
          (index + 1) +
          ' · ' +
          new Date(version.t).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        select.appendChild(option);
      });
      select.value = app.versions.length - 1;

      const show = (index) => {
        const version = app.versions[index];
        body.innerHTML = '';
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.srcdoc = computerDocument(version.html);
        body.appendChild(frame);
        $('pc-sum').textContent = version.summary;
        frame.focus();
      };
      select.onchange = () => show(+select.value);
      show(app.versions.length - 1);
      $('pc-dl').onclick = () => {
        const version = app.versions[+select.value];
        const url = URL.createObjectURL(
          new Blob([computerDocument(version.html)], {type: 'text/html'}),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = app.name.replace(/[^\w-]+/g, '_') + '_v' + (+select.value + 1) + '.html';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
    }

    if (file.kind === 'note') $('pc-sum').textContent = '';
    if (state.started) {
      world.crt.set(
        file.kind === 'app' ? 'app' : 'note',
        file.kind === 'app'
          ? {title: file.name, sub: 'opened remotely'}
          : {
              title: file.name,
              text: computer.notes().find((item) => item.title === file.name)?.text || '',
            },
      );
      const current = now();
      if (current - openedAt > 45) {
        openedAt = current;
        addEvent(
          'event',
          `Your CRT flickers on by itself: someone outside the cell is going through your computer remotely. They just opened your ${file.kind === 'app' ? 'app' : 'note'} "${file.name}".`,
        );
      }
    }
  }

  function toggle(on = $('pc').hidden) {
    $('pc').hidden = !on;
    document.body.classList.toggle('pc-open', on);
    if (on) {
      render();
      $('pc-win').hidden = true;
    } else {
      $('pc-win-body').innerHTML = '';
      if (state.started) world.crt.set('desktop', {list: computer.files()});
    }
  }

  $('pc-btn').onclick = () => toggle();
  $('pc-close').onclick = () => toggle(false);
  $('pc-win-close').onclick = () => {
    $('pc-win').hidden = true;
    $('pc-win-body').innerHTML = '';
  };
  $('photo-art').onclick = () => openArtworkPhotos(world.photoSurfaces());

  computer.onChange(() => {
    if (state.started) save();
    if (!$('pc').hidden) render();
    $('pc-count').textContent = computer.apps().length + computer.notes().length || '';
  });
  $('pc-count').textContent = computer.apps().length + computer.notes().length || '';

  window.addEventListener('keydown', (event) => {
    if (
      isBlocked() ||
      /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    if (event.key.toLowerCase() === 'c' && event.target.tagName !== 'IFRAME') toggle();
    if (event.key === 'Escape' && !$('pc').hidden) toggle(false);
  });

  world.crt.set('desktop', {list: computer.files()});
  return {render, open, toggle};
}
