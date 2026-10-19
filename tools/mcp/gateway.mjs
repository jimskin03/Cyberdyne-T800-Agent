import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {safeEndpoint} from '../oauth.mjs';

export class McpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const reject = (status, message) => {
  throw new McpError(status, message);
};
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);
const clean = (value, size = 500) =>
  String(value || '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .slice(0, size);
const MAX_RESPONSE = 2 * 1024 * 1024;

export function createMcpGateway({fetcher = fetch, timeoutMs = 15000} = {}) {
  let current = null,
    pending = null,
    generation = 0;
  const redact = (entry, value) =>
    entry.token ? String(value).split(entry.token).join('[redacted]') : String(value);
  const publicValue = (entry, value) => {
    if (typeof value === 'string') return redact(entry, value);
    if (Array.isArray(value)) return value.map((item) => publicValue(entry, item));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [redact(entry, key), publicValue(entry, item)]),
      );
    return value;
  };
  const options = (signal) => ({signal, timeout: timeoutMs, maxTotalTimeout: timeoutMs});
  async function refreshCatalog(entry, signal) {
    const capabilities = entry.client.getServerCapabilities() || {};
    const settings = {...options(signal), cacheMode: 'refresh'};
    const tools = capabilities.tools ? (await entry.client.listTools({}, settings)).tools : [];
    const resources = capabilities.resources
      ? (await entry.client.listResources({}, settings)).resources
      : [];
    if (tools.length > 100 || resources.length > 100)
      reject(502, 'MCP catalog is too large; use a server with at most 100 entries per category.');
    entry.tools = tools;
    entry.resources = resources
      .filter((resource) => resource.uri.length <= 2048)
      .map((resource) => ({
        uri: resource.uri,
        name: clean(resource.name, 128),
        description: clean(resource.description),
      }));
  }

  async function close(entry) {
    if (!entry) return;
    entry.lifecycle.abort();
    await entry.client.close().catch(() => {});
  }
  async function disconnect() {
    const version = ++generation;
    const entries = [current, pending];
    current = null;
    pending = null;
    await Promise.all(entries.map(close));
    return version;
  }
  function status() {
    if (!current) return {connected: false, name: '', url: '', tools: [], resources: []};
    return publicValue(current, {
      connected: true,
      name: current.name,
      url: current.url.href,
      tools: current.tools.map((tool) => ({
        name: clean(tool.name, 128),
        description: clean(tool.description),
        available:
          tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true,
      })),
      resources: current.resources.map((resource) => ({
        uri: resource.uri,
        name: clean(resource.name, 128),
      })),
    });
  }
  async function connect(body, {signal, localPort} = {}) {
    if (!plain(body) || typeof body.url !== 'string' || body.url.length > 500)
      reject(400, 'Enter a valid MCP URL.');
    let url;
    try {
      url = safeEndpoint(body.url.trim(), 'MCP URL');
    } catch {
      reject(400, 'MCP URL requires HTTPS, or HTTP on loopback, without credentials or fragments.');
    }
    if (url.search)
      reject(400, 'MCP URL must not contain query credentials. Use the bearer token field.');
    if (
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      Number(url.port) === Number(localPort)
    )
      reject(400, 'MCP URL cannot point at this adapter.');
    const token = body.token ?? '';
    if (
      typeof token !== 'string' ||
      token.length > 4096 ||
      (token && !/^[\x21-\x7e]+$/.test(token))
    )
      reject(400, 'Bearer token must be a single printable line.');
    const version = await disconnect();
    if (version !== generation) throw new DOMException('Cancelled', 'AbortError');
    const entry = {
      url,
      token,
      name: clean(body.name, 80).trim() || 'MCP server',
      lifecycle: new AbortController(),
      tools: [],
      resources: [],
    };
    entry.client = new Client(
      {name: 'cell-computer', version: '0.1.0'},
      {
        capabilities: {},
        versionNegotiation: {
          mode: 'auto',
          probe: {timeoutMs: Math.min(timeoutMs, 5000), maxRetries: 0},
        },
        listMaxPages: 3,
      },
    );
    entry.client.onerror = () => {}; // Errors become authored HTTP diagnostics, never raw logs.
    const boundedFetch = async (target, init = {}) => {
      if (new URL(target).href !== url.href)
        reject(400, 'MCP requests must use the configured endpoint.');
      // The unit has no background push connection. POST responses may still
      // use SSE; the optional unsolicited GET stream is deliberately disabled.
      if (init.method === 'GET') return new Response(null, {status: 405});
      const requestSignal = AbortSignal.any([
        entry.lifecycle.signal,
        ...(entry.operationSignal ? [entry.operationSignal] : []),
        ...(init.signal ? [init.signal] : []),
        AbortSignal.timeout(timeoutMs),
      ]);
      const response = await fetcher(target, {...init, redirect: 'error', signal: requestSignal});
      if (!response.body) return response;
      let bytes = 0;
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const {done, value} = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            bytes += value.byteLength;
            if (bytes > MAX_RESPONSE) {
              await reader.cancel();
              controller.error(new McpError(502, 'MCP response exceeds the size limit.'));
              return;
            }
            controller.enqueue(value);
          } catch (error) {
            controller.error(error);
          }
        },
        cancel: (reason) => reader.cancel(reason),
      });
      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
    entry.transport = new StreamableHTTPClientTransport(url, {
      fetch: boundedFetch,
      requestInit: {redirect: 'error'},
      ...(token ? {authProvider: {token: async () => token}} : {}),
    });
    pending = entry;
    const connectSignal = AbortSignal.any([
      entry.lifecycle.signal,
      ...(signal ? [signal] : []),
      AbortSignal.timeout(timeoutMs),
    ]);
    entry.operationSignal = connectSignal;
    try {
      await entry.client.connect(entry.transport, options(connectSignal));
      await refreshCatalog(entry, connectSignal);
      if (version !== generation || connectSignal.aborted)
        throw new DOMException('Cancelled', 'AbortError');
      current = entry;
      pending = null;
      entry.operationSignal = null;
      return status();
    } catch (error) {
      const timedOut = connectSignal.aborted && !entry.lifecycle.signal.aborted;
      if (pending === entry) pending = null;
      await close(entry);
      if (timedOut) throw new McpError(504, 'MCP connection cancelled or timed out.');
      throw error;
    }
  }
  async function execute(body, {signal} = {}) {
    const entry = current;
    if (!entry) reject(409, 'MCP is disconnected. Connect a server in Settings.');
    if (entry.operationSignal) reject(429, 'MCP is busy. Try again later.');
    if (!plain(body)) reject(400, 'Expected an MCP action.');
    const requestSignal = AbortSignal.any([
      entry.lifecycle.signal,
      ...(signal ? [signal] : []),
      AbortSignal.timeout(timeoutMs),
    ]);
    entry.operationSignal = requestSignal;
    try {
      if (body.op === 'list') await refreshCatalog(entry, requestSignal);
      const safeTools = entry.tools.filter(
        (tool) =>
          tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true,
      );
      let result;
      if (body.op === 'list') {
        result = {
          tools: safeTools
            .filter((tool) => JSON.stringify(tool.inputSchema).length <= 8000)
            .map((tool) => ({
              name: tool.name,
              description: clean(tool.description, 500),
              inputSchema: tool.inputSchema,
            })),
          resources: entry.resources,
        };
      } else if (body.op === 'call') {
        if (typeof body.tool !== 'string' || !safeTools.some((tool) => tool.name === body.tool))
          reject(403, 'Only listed read-only MCP tools can be called.');
        if (body.arguments !== undefined && !plain(body.arguments))
          reject(400, 'MCP tool arguments must be a JSON object.');
        result = await entry.client.callTool(
          {name: body.tool, arguments: body.arguments || {}},
          options(requestSignal),
        );
        if (result.isError)
          reject(502, 'The MCP tool reported a failure. Check the tool arguments and server.');
        result = {
          content: result.content
            ?.filter((part) => part.type === 'text')
            .map((part) => ({type: 'text', text: part.text})),
          ...(result.structuredContent ? {structuredContent: result.structuredContent} : {}),
        };
      } else if (body.op === 'read') {
        if (
          typeof body.uri !== 'string' ||
          !entry.resources.some((resource) => resource.uri === body.uri)
        )
          reject(403, 'Choose a resource listed by this MCP server.');
        const read = await entry.client.readResource(
          {uri: body.uri},
          {...options(requestSignal), cacheMode: 'refresh'},
        );
        result = {
          contents: read.contents
            .filter((item) => typeof item.text === 'string')
            .map((item) => ({uri: item.uri, text: item.text, mimeType: item.mimeType})),
        };
      } else reject(400, 'Choose MCP list, call or read.');
      if (requestSignal.aborted || current !== entry)
        throw new DOMException('Cancelled', 'AbortError');
      const safeResult = publicValue(entry, result);
      const text = JSON.stringify(safeResult);
      if (!text || text === '{}' || text === '{"content":[]}' || text === '{"contents":[]}')
        reject(502, 'The MCP server returned no text data.');
      return {
        source: redact(entry, entry.name),
        text: text.slice(0, 8000),
        truncated: text.length > 8000,
        ...(body.op === 'list' ? {catalog: safeResult} : {}),
      };
    } catch (error) {
      if (requestSignal.aborted && !entry.lifecycle.signal.aborted)
        throw new McpError(504, 'MCP request cancelled or timed out.');
      throw error;
    } finally {
      entry.operationSignal = null;
    }
  }
  return {connect, disconnect, status, execute};
}
