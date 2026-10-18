// Session rules are independent of rendering and model availability.
export function chooseTool(ids, disabled, recent, forced, random = Math.random) {
 if (forced && ids.includes(forced)) return forced; // manual selection overrides rotation
 const enabled = ids.filter(id => !disabled.includes(id));
 const fresh = enabled.filter(id => !recent.includes(id));
 const pool = fresh.length ? fresh : enabled;
 return pool.length ? pool[Math.floor(random() * pool.length)] : null;
}

export function breakRemaining(minutes, rate, elapsed) {
 return Math.max(0, minutes - Math.max(0, elapsed) * rate);
}

// A backend/editorial response is not character dialogue. Fall back to authored
// fiction rather than displaying it as something the captive said.
export function isCharacterOutput(text) {
 return typeof text === 'string' && text.trim().length > 0 &&
  !/as an ai|ai language model|i (?:cannot|can't|won't|will not) (?:assist|help|provide|generate|participate)|i'm sorry,? but|i am sorry,? but|instead,? (?:let|we|i)|content policy/i.test(text);
}
