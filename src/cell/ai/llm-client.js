export function createLlmClient({fetcher = globalThis.fetch} = {}) {
  async function json(url, options = {}) {
    const response = await fetcher(url, options);
    if (response.ok === false) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  return {
    health({signal = AbortSignal.timeout(3000)} = {}) {
      return json('/llm/health', {cache: 'no-store', signal});
    },
    complete(body, {signal} = {}) {
      return json('/llm/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body),
      });
    },
  };
}
