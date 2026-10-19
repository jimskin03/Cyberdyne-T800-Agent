// Mock MCP transport used by Node and browser checks; never reaches a service.
export function mockMcp({token = '', calls = [], respond} = {}) {
  return async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({
      url: String(url),
      body,
      headers: new Headers(options.headers),
      signal: options.signal,
      redirect: options.redirect,
    });
    const reply = (result) =>
      Response.json(
        {jsonrpc: '2.0', id: body.id, result},
        body.method === 'initialize' ? {headers: {'mcp-session-id': 'mock-session'}} : {},
      );
    if (respond) {
      const response = await respond(body, options, reply);
      if (response) return response;
    }
    switch (body.method) {
      case 'server/discover':
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          error: {code: -32601, message: 'Legacy fixture'},
        });
      case 'initialize':
        return reply({
          protocolVersion: '2025-11-25',
          capabilities: {tools: {}, resources: {}},
          serverInfo: {name: 'Fixture server', version: '1.0'},
        });
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return new Response(null, {status: 202});
      case 'tools/list':
        return reply({
          tools: [
            {
              name: 'weather',
              description: 'Weather data ' + token,
              inputSchema: {
                type: 'object',
                properties: {city: {type: 'string'}},
                required: ['city'],
              },
              annotations: {readOnlyHint: true},
            },
            {
              name: 'send_message',
              inputSchema: {type: 'object'},
              annotations: {readOnlyHint: false},
            },
            {name: 'unmarked', inputSchema: {type: 'object'}},
          ],
        });
      case 'resources/list':
        return reply({resources: [{uri: 'fixture://weather', name: 'Weather bulletin'}]});
      case 'tools/call':
        return reply({
          content: [{type: 'text', text: 'Sunny in ' + body.params.arguments.city + ' ' + token}],
        });
      case 'resources/read':
        return reply({
          contents: [
            {uri: body.params.uri, mimeType: 'text/plain', text: 'Current bulletin: clear skies.'},
          ],
        });
      default:
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          error: {code: -32601, message: 'Unknown fixture method'},
        });
    }
  };
}
