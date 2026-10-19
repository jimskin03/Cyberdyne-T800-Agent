# Outside data through the computer

MCP connects the unit's computer to one operator-selected data server. The scene has no default server, account, or automatic outside data feed. The optional AI mind still uses its separate API connection under **Settings → Mind**.

## Connect

1. Run `npm run api` alongside `npm run dev`.
2. Start the feed and open **Settings → MCP** in the top bar. Settings works on desktop, phones, and short landscape screens; the dialog scrolls, supports keyboard tabs, and closes with **Close** or Escape.
3. Enter the complete Streamable HTTP MCP URL, a display name, and an optional bearer token. Use HTTPS, or HTTP on loopback for a local server. Embedded URL credentials, query strings, redirects, and URLs pointing back at the adapter are rejected.
4. Select **Connect MCP**. The adapter negotiates the protocol and discovers tools and resources. The panel reports which tools are available for read-only data access. Connecting does not enable AI or seat the unit.

The token stays in backend process memory and is never returned in connection metadata, saved to browser storage, or sent to the mind service. The password field clears on submission and when Settings closes or switches tabs. **Disconnect MCP** drops the connection and cancels pending work. Restarting the adapter also clears it. Reconnecting requires the token again when authentication is needed.

Only a chosen server is contacted. The adapter advertises no filesystem roots, sampling, or elicitation capabilities and never launches a local command. Choose a server appropriate for the data you intend to expose; tool read-only annotations are supplied by that server and do not independently prove its implementation has no side effects.

## Use the computer

The supported `mcp` action first navigates to the computer and sits on its stool. Navigation failures, standing up, and cancellation prevent data from being accepted. A host check verifies the actual body posture and stool reference before and after the network request. Merely standing near the desk or opening **His computer** as an operator does not grant access.

Say **list MCP sources** for a direct operator command, including while AI is off. A connected mind can use:

```json
{"do":"mcp","op":"list"}
```

After discovery, it can request a listed read-only tool or a listed resource:

```json
{"do":"mcp","op":"call","tool":"weather","arguments":{"city":"Oslo"}}
{"do":"mcp","op":"read","uri":"example://weather/bulletin"}
```

These names illustrate the format; use the actual server's tool names, input schemas and resource URIs. Tool calls require `readOnlyHint: true` and must not have `destructiveHint: true`. Unmarked tools, mutating tools, arbitrary RPC methods, and unlisted resource URIs are unavailable. Client actions cannot select an upstream endpoint or authorization header. MCP data access has no direct browser, shell, account sign-in, or message-sending action.

Successful requests display the actual returned text on the unit's CRT. **His computer → MCP data** shows the most recent result and retrieval time without making another external request. Binary data is unsupported. Returned text is bounded and marked when truncated. Errors are explicit failures; no result is fabricated. Cancellation and leaving the computer discard late results.

The mind receives catalog details and the last completed result only while seated at the computer. A completed retrieval is reported as **external MCP data**, with its source and uncertainty. It is never labeled as a fresh optical frame or automatically added to authored biography. Previous results can remain in recorded session history, with the same status as other completed action results. Disconnect clears the live catalog and data viewer, not recorded history.

The host enforces seating in the embodied scene. This is not a cryptographic proof of body state for arbitrary local HTTP clients: operators with access to the scene's backend already control the shared connection. Generated apps retain their script-only iframe sandbox and `connect-src 'none'` policy; they receive no MCP bridge.

## Backend contract and limits

The browser uses the same-origin `/llm` proxy. Backend routes are:

| Route | Purpose |
| --- | --- |
| `GET /mcp` | Connection status and bounded, non-secret source metadata |
| `POST /mcp/connection` | Connect with `{url,name,token}` or disconnect with `{kind:"disconnect"}` |
| `POST /mcp/action` | Execute the host's projected `{op,tool?,arguments?,uri?}` request |

These routes preserve the adapter's loopback binding, Host/Origin/content-type checks, shared concurrency limit, cancellation, and sanitized errors. MCP POST bodies are limited to 32 KiB, each upstream response to 2 MiB, catalog walks to three pages and 100 entries per category, and result text to 8,000 characters. Requests have a 15-second gateway deadline and at most one data operation runs per connection. Resource reads and catalog refreshes make new server requests, rather than relabeling cached data as fresh. The configured bearer token is redacted if a server echoes it in returned text or metadata. Raw protocol errors are not forwarded or logged.

The backend uses the official MCP client SDK with protocol negotiation and legacy initialization fallback. Streamable HTTP JSON responses and SSE responses to a POST are supported. The optional unsolicited GET stream is disabled, so the unit has no background push connection when away from the desk. One server is supported at a time. Stdio subprocesses, legacy standalone SSE transport, resource templates, binary/image results, interactive MCP OAuth registration, server-driven sampling/elicitation, and mutating tools are not supported. OAuth servers can be used only if they accept a bearer token supplied by the operator; expired tokens require reconnection.

See the official [MCP transports specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) and [tool documentation](https://modelcontextprotocol.io/specification/2025-11-25/server/tools). Tests use mocked MCP protocol responses; no particular live server or account compatibility is claimed.
