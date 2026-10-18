const pick = (value, allowed) => (allowed.includes(value) ? value : '');

export function createConnectionState(enabled = true) {
  return {
    online: false,
    vision: false,
    enabled,
    lastMs: 0,
    calls: 0,
    fails: 0,
    inflight: null,
    loopFeedback: '',
    loopRepairs: 0,
    lastError: '',
    phase: 'idle',
    contextChars: 0,
    visionSkipped: false,
    agentName: 'Agent',
    auth: {mode: 'none', connected: false},
    authRequired: false,
    unconfigured: false,
    connection: {source: 'none', kind: 'none', alternative: '', host: ''},
  };
}

export function applyConnectionHealth(state, health = {}) {
  state.agentName =
    typeof health.agent?.name === 'string' && health.agent.name.trim()
      ? health.agent.name.trim().slice(0, 80)
      : 'Agent';
  state.auth = {
    mode: ['api-key', 'oauth', 'none'].includes(health.auth?.mode) ? health.auth.mode : 'none',
    connected: health.auth?.connected !== false,
    ...(health.auth?.loginUrl === '/llm/auth/login' ? {loginUrl: '/llm/auth/login'} : {}),
  };
  const host =
    typeof health.connection?.host === 'string' &&
    /^(?:\[::1\]|[A-Za-z0-9.-]{1,253})$/.test(health.connection.host)
      ? health.connection.host
      : '';
  state.connection = {
    source:
      pick(health.connection?.source, ['env', 'session', 'none']) ||
      (health.status === 'ok' || health.status === 'auth_required' ? 'env' : 'none'),
    kind:
      pick(health.connection?.kind, ['openai-compatible', 'invite', 'configured', 'none']) ||
      'none',
    alternative: pick(health.connection?.alternative, ['api-key', 'local', 'sign-in']) || '',
    host,
  };
  state.unconfigured = health.status === 'unconfigured';
  state.authRequired =
    health.status === 'auth_required' || state.unconfigured || !state.auth.connected;
  state.online = health.status === 'ok' && state.auth.connected;
  state.vision = !!health.vision;
  state.model = state.agentName;
  return state;
}
