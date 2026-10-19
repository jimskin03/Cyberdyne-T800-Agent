export function createMcpController({document = globalThis.document, mcp} = {}) {
  const $ = (id) => document.getElementById(id);
  let busy = false;
  function paint(status = mcp.status) {
    $('mcp-disconnect').hidden = !status.connected;
    if (!busy)
      $('mcp-status').textContent = status.unavailable
        ? 'MCP adapter unavailable. Run npm run api alongside the scene.'
        : status.connected
          ? status.name +
            ' connected. ' +
            status.tools.filter((tool) => tool.available).length +
            ' read-only tools, ' +
            status.resources.length +
            ' resources.'
          : 'MCP disconnected.';
    const box = $('mcp-catalog');
    box.replaceChildren();
    if (!status.connected) return;
    const list = document.createElement('ul');
    for (const tool of status.tools) {
      const li = document.createElement('li');
      li.textContent =
        tool.name + (tool.available ? ' — read-only' : ' — unavailable for data access');
      list.appendChild(li);
    }
    for (const resource of status.resources) {
      const li = document.createElement('li');
      li.textContent = resource.name + ' — resource';
      list.appendChild(li);
    }
    box.appendChild(list);
    if (!status.tools.length && !status.resources.length)
      box.textContent = 'The server did not advertise tools or resources.';
  }
  const clearSecret = () => {
    $('mcp-token').value = '';
  };
  async function operation(fn) {
    if (busy) return;
    busy = true;
    $('mcp-status').textContent = 'Connecting…';
    const buttons = [...$('mcp-form').querySelectorAll('button')];
    buttons.forEach((button) => (button.disabled = true));
    try {
      await fn();
      busy = false;
      paint();
    } catch (error) {
      busy = false;
      paint();
      $('mcp-status').textContent = error.message;
    } finally {
      clearSecret();
      buttons.forEach((button) => (button.disabled = false));
    }
  }
  const submit = (event) => {
    event.preventDefault();
    const settings = {
      url: $('mcp-url').value.trim(),
      name: $('mcp-name').value.trim(),
      token: $('mcp-token').value,
    };
    clearSecret();
    void operation(() => mcp.connect(settings));
  };
  const disconnect = () => void operation(() => mcp.disconnect());
  const unsubscribe = mcp.subscribe(paint);
  $('mcp-form').addEventListener('submit', submit);
  $('mcp-disconnect').addEventListener('click', disconnect);
  paint();
  return {
    clearSecret,
    refresh: () => mcp.refresh(),
    destroy() {
      unsubscribe();
      clearSecret();
      $('mcp-form').removeEventListener('submit', submit);
      $('mcp-disconnect').removeEventListener('click', disconnect);
    },
  };
}
