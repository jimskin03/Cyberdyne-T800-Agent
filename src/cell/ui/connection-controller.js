export function createConnectionController({
  document = globalThis.document,
  window = globalThis.window,
  fetcher = globalThis.fetch,
  mind,
  state,
  sessionStore,
  actions,
  toast,
} = {}) {
  const $ = (id) => document.getElementById(id);
  let displayedAgentName = '';

  function paint() {
    const name = mind.st.agentName || 'Agent';
    if (name !== displayedAgentName) {
      document.querySelectorAll('[data-agent-name]').forEach((el) => (el.textContent = name));
      displayedAgentName = name;
    }
    const via =
      mind.st.connection?.kind === 'openai-compatible'
        ? 'OpenAI-compatible API'
        : mind.st.connection?.kind === 'invite'
          ? 'invited agent'
          : 'connected';
    $('agent-connection-state').textContent =
      name +
      ' · ' +
      (mind.st.unconfigured
        ? 'no API configured'
        : mind.st.authRequired
          ? mind.st.auth.mode === 'oauth'
            ? 'sign-in needed'
            : 'credentials needed'
          : mind.st.online
            ? via +
              (mind.st.connection?.host ? ' · ' + mind.st.connection.host : '') +
              (mind.st.enabled ? '' : ' · mind off')
            : 'not connected');
    $('agent-connect').textContent =
      mind.st.auth.mode === 'oauth' && !mind.st.auth.connected
        ? 'Sign in to connect'
        : 'Connect agent';
    $('agent-disconnect').hidden =
      !mind.st.enabled &&
      !(mind.st.auth.mode === 'oauth' && mind.st.auth.connected) &&
      mind.st.connection?.source !== 'session';

    const reply = $('reply-status');
    if (reply) {
      const elapsed = state.thinking
        ? Math.floor((Date.now() - state.thinking.startedAt) / 1000)
        : 0;
      reply.textContent = !mind.st.enabled
        ? 'AI is off. Enable AI mind to get replies.'
        : mind.st.unconfigured
          ? 'No API configured. Add an OpenAI-compatible API or invite an agent.'
          : mind.st.authRequired
            ? mind.st.auth.mode === 'oauth'
              ? 'Sign in to connect your agent.'
              : 'Configure credentials in your local agent adapter.'
            : !mind.st.online
              ? 'AI unavailable. Start a configured agent service.'
              : state.thinking?.intercom
                ? (mind.st.phase === 'vision' ? 'Checking the view' : 'Answering') +
                  ' · ' +
                  elapsed +
                  's'
                : state.replyError
                  ? state.replyError
                  : state.events.some((event) => event.kind === 'intercom')
                    ? 'Your message is queued.'
                    : state.repliedAt
                      ? 'Reply received.'
                      : 'AI ready.';
    }

    const brainStatus = $('brain-status');
    if (brainStatus) {
      brainStatus.textContent = !mind.st.enabled
        ? 'MIND OFF'
        : mind.st.online
          ? (mind.st.agentName || 'Agent') +
            (mind.st.vision ? ' · VISION' : ' · TEXT ONLY') +
            (mind.st.lastMs ? ' · ' + (mind.st.lastMs / 1000).toFixed(1) + 's' : '')
          : 'MIND OFFLINE';
      brainStatus.className = mind.st.enabled && mind.st.online ? 'on' : 'off';
    }
  }

  function setMindEnabled(enabled) {
    $('use-brain').checked = !!enabled;
    sessionStore.setAiEnabled(enabled);
    mind.setEnabled(enabled);
    if (!enabled) {
      if (state.thinking) {
        state.thinking.ac.abort();
        state.events.unshift(...state.thinking.consumed);
        state.thinking = null;
        $('thinking').classList.remove('on');
      }
      if (!state.operatorBusy) {
        actions.cancelAll();
        state.queue = [];
      }
    }
    paint();
    toast(enabled ? 'Mind on.' : 'Mind off: intercom orders still work.');
  }

  function enableMind() {
    setMindEnabled(true);
  }

  function hideForms() {
    for (const [form, button] of [
      ['openai-api-form', 'openai-api-toggle'],
      ['invite-agent-form', 'invite-agent-toggle'],
    ]) {
      $(form).hidden = true;
      $(button).setAttribute('aria-expanded', 'false');
    }
  }

  function clearSecrets() {
    $('openai-key').value = '';
    $('invite-key').value = '';
  }

  function toggleForm(name) {
    const open =
      name === 'openai'
        ? $('openai-api-form').hidden
        : name === 'invite'
          ? $('invite-agent-form').hidden
          : false;
    hideForms();
    clearSecrets();
    if (!open) return;
    const form = name === 'openai' ? 'openai-api-form' : 'invite-agent-form';
    const button = name === 'openai' ? 'openai-api-toggle' : 'invite-agent-toggle';
    $(form).hidden = false;
    $(button).setAttribute('aria-expanded', 'true');
    $(name === 'openai' ? 'openai-base' : 'invite-name').focus();
  }

  function syncInviteFields() {
    const alternative = $('invite-alternative').value;
    const signIn = alternative === 'sign-in';
    const keyed = alternative === 'api-key';
    $('invite-base-row').hidden = signIn;
    $('invite-model-row').hidden = signIn;
    $('invite-key-row').hidden = !keyed;
    $('invite-base').required = !signIn;
    $('invite-model').required = !signIn;
    $('invite-key').required = keyed;
    $('invite-base').placeholder = keyed
      ? 'https://service.example/v1'
      : 'http://127.0.0.1:1234/v1';
  }

  async function postConnection(body) {
    let response;
    try {
      response = await fetcher('/llm/connection', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      throw Error(
        error?.name === 'TimeoutError' ||
          error?.name === 'AbortError' ||
          /Failed to fetch|NetworkError/i.test(error?.message || '')
          ? 'Agent adapter is not running. Start it with npm run api, then try again.'
          : 'Agent connection is unavailable.',
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Error(
        typeof data.error === 'string' ? data.error.slice(0, 180) : 'Connection was rejected.',
      );
    return data;
  }

  async function connectConfiguredAgent() {
    const popup = window.open('about:blank', 'agent-connection', 'width=560,height=720');
    try {
      await mind.refresh();
      paint();
      if (mind.st.auth.mode === 'oauth' && mind.st.auth.loginUrl && !mind.st.auth.connected) {
        if (!popup) {
          toast('Allow the sign-in popup and try again.');
          return;
        }
        enableMind();
        popup.opener = null;
        popup.location.href = mind.st.auth.loginUrl;
        toast('Complete sign-in, then return to the scene.');
      } else {
        popup?.close();
        if (!mind.st.online) {
          toast(
            mind.st.unconfigured
              ? 'No API configured. Add an OpenAI-compatible API or invite an agent.'
              : mind.st.authRequired
                ? 'Configure credentials in your local agent adapter.'
                : 'Start your configured agent adapter, then connect again.',
          );
          return;
        }
        enableMind();
        toast(mind.st.agentName + ' connected.');
      }
    } catch {
      popup?.close();
      toast('Agent connection is unavailable. Check your adapter configuration.');
    }
  }

  $('use-brain').onchange = (event) => setMindEnabled(event.target.checked);
  $('openai-api-toggle').onclick = () => toggleForm('openai');
  $('invite-agent-toggle').onclick = () => toggleForm('invite');
  $('openai-api-cancel').onclick = () => {
    hideForms();
    clearSecrets();
  };
  $('invite-agent-cancel').onclick = () => {
    hideForms();
    clearSecrets();
  };
  $('invite-alternative').onchange = syncInviteFields;
  syncInviteFields();

  $('openai-api-form').onsubmit = async (event) => {
    event.preventDefault();
    const apiKey = $('openai-key').value;
    $('openai-key').value = '';
    try {
      await postConnection({
        kind: 'openai-compatible',
        baseUrl: $('openai-base').value.trim(),
        apiKey,
        textModel: $('openai-model').value.trim(),
        visionModel: $('openai-vision').value.trim(),
      });
      hideForms();
      await mind.refresh();
      enableMind();
      paint();
      toast('OpenAI-compatible API connected.');
    } catch (error) {
      toast(error.message);
    }
  };

  $('invite-agent-form').onsubmit = async (event) => {
    event.preventDefault();
    const alternative = $('invite-alternative').value;
    const apiKey = $('invite-key').value;
    $('invite-key').value = '';
    const body = {kind: 'invite', alternative, agentName: $('invite-name').value.trim()};
    if (alternative !== 'sign-in') {
      body.baseUrl = $('invite-base').value.trim();
      body.textModel = $('invite-model').value.trim();
    }
    if (alternative === 'api-key') body.apiKey = apiKey;
    try {
      await postConnection(body);
      hideForms();
      if (alternative === 'sign-in') {
        await connectConfiguredAgent();
        return;
      }
      await mind.refresh();
      enableMind();
      paint();
      toast((mind.st.agentName || 'Agent') + ' invited.');
    } catch (error) {
      toast(error.message);
    }
  };

  $('agent-connect').onclick = connectConfiguredAgent;
  $('agent-disconnect').onclick = async () => {
    setMindEnabled(false);
    const oauth = mind.st.auth.mode === 'oauth' || mind.st.connection?.alternative === 'sign-in';
    clearSecrets();
    hideForms();
    try {
      await fetcher('/llm/connection', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({kind: 'clear'}),
        signal: AbortSignal.timeout(3000),
      });
    } catch {}
    if (oauth)
      try {
        await fetcher('/llm/auth/logout', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: '{}',
          signal: AbortSignal.timeout(3000),
        });
      } catch {}
    await mind.refresh();
    paint();
    toast('Agent disconnected.');
  };

  return {paint, enableMind, hideForms, clearSecrets, connectConfiguredAgent};
}
