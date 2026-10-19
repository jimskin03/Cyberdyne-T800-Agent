# Connect your own APIs or OAuth account

The scene has no required AI service or model. Give your agent a name and connect your own service through the backend. The JSON brain describes fictional experiences; it does not select an API account, model or authentication method. AI starts off for a new visitor and remembers the operator's later choice.

## Configure the backend

For interactive setup, run `npm run api` and `npm run dev`, then use the MIND panel below. No `.env` file is required.

For optional startup defaults or OAuth registration, create an ignored local `.env` with the fields for your chosen service:

```dotenv
AGENT_NAME=My Agent
API_AUTH_MODE=api-key
API_BASE_URL=https://your-service.example/v1
API_KEY=
API_TEXT_MODEL=your-text-model-id
API_VISION_MODEL=
API_CREATIVE_MODEL=
```

Use your service's official current documentation for the API base and model IDs. The example hostname is illustrative. The included adapter appends `/chat/completions` to `API_BASE_URL` and expects the request/response contract below. It is a starting point for this wire format, not universal support for every API. A different authentication header, endpoint, token parameter, or response format requires a backend adaptation.

- `AGENT_NAME` supplies the running agent's display identity. The frontend uses a neutral fallback until the backend supplies its name.
- `API_AUTH_MODE=api-key` sends the locally configured `API_KEY` as backend authorization. Enter the key privately in your editor.
- `API_AUTH_MODE=none` connects an unauthenticated server, such as a local model process. Use HTTP only for loopback endpoints; remote services require HTTPS.
- `API_AUTH_MODE=oauth` uses your registered OAuth client and the authorization flow described below. It does not use a browser-visible API key.
- `API_TEXT_MODEL` handles agent dialogue and decisions. Set `API_VISION_MODEL` only for an image-capable model that accepts the image-part format below. Set `API_CREATIVE_MODEL` for drawing, app generation and procedural objects; it falls back to the configured vision model, then the text model, when omitted.

Run `npm run api` in one terminal and `npm run dev` in another. Open http://127.0.0.1:5340, enable **AI mind** when you intend to make requests, and sign in if requested. The backend listens at `127.0.0.1:18081`. Observations, selected biography, dialogue and optional POV images go to your configured service. Requests use your account's quota or budget. Tests use mocks; no live API or OAuth compatibility is claimed.

A blank API configuration — no base URL, model, key, or OAuth registration — still starts the adapter. It reports `status: "unconfigured"` until you connect from the scene or fill in `.env`.

## Connect from the MIND panel

With the adapter running, the **MIND** section offers two ways to connect without editing `.env`. On a phone, open **Controls** first.

- **OpenAI-compatible API** takes an agent name, base URL, optional API key, text model, and optional vision model. Leave the key blank for an unauthenticated server. The adapter appends `/chat/completions` (a pasted completions URL is accepted once) and keeps the key in process memory. The browser does not store the key, and health checks never return it.
- **Invite agent** is for other alternatives: a local or HTTPS server with no key, a different API-key service, or the OAuth account already registered in `.env`. Sign-in does not accept a client-supplied token URL, client secret, or API key. Complete the popup when it opens.

Use **Fetch models** in either API form to check model-list access with the entered endpoint and credentials before connecting. It calls the provider's `GET /models` endpoint and offers the returned IDs in a selector; you can still enter an ID manually. This follows the [OpenAI-compatible list-models format](https://developers.openai.com/api/reference/resources/models/methods/list) (`data[].id`). Discovery does not enable AI, change the active connection, send a chat prompt, or prove that a listed model supports chat or vision. Some providers do not expose model discovery; manual entry remains available. A newly entered key remains in the password field during discovery and is cleared on save, cancel, or switching forms; it is never written to browser storage.

Reopen a form to load the running adapter's current settings. **Use saved key** reuses the backend key when editing models on the same endpoint; keys are never returned to the browser. Enter a new key when switching endpoints. Uncheck **Use saved key** to connect without authentication. Saving updates the running adapter immediately for subsequent requests and overrides any startup defaults until disconnect or restart. Settings and keys entered in the scene are kept in process memory, so restart clears them.

**Disconnect** turns AI off and drops a connection made from the scene. A startup `.env` configuration remains. OAuth tokens are cleared when that session was using sign-in. Restarting the adapter also clears scene connections and OAuth tokens.

Chat requests still cannot choose an upstream URL, model ID, or authorization header. Only `POST /llm/connection` can change the active endpoint, and it uses the same checks as `.env`: HTTPS, or HTTP on loopback, with no credentials or query in the URL, and no loopback URL that points at the adapter itself.

### Using the scene over Tailscale or another private network

Run `npm run api` on the same machine as `npm run dev`. The browser uses that machine's same-origin `/llm` development proxy; keep the API adapter bound to `127.0.0.1:18081`.

The included dev and preview proxies validate requests against the scene's current Host before forwarding to the loopback adapter. Tailscale/LAN addresses, hostnames, and alternate scene ports work without editing `.env` or restarting the adapter. Cross-site browser requests remain rejected. Anyone with access to this scene server can change its shared API connection; use your private network or hosting access controls when exposing it remotely.

For a custom proxy that forwards the original browser Origin directly to the adapter, `API_ALLOWED_ORIGINS` remains an optional server setting containing exact HTTP/HTTPS origins separated by commas. Only that custom setup needs a restart after changing its allowlist. Never accept arbitrary forwarded Host/Origin headers as authorization.

**Agent adapter is unavailable** means to start or restart `npm run api` alongside the scene server. A static site without a same-origin `/llm` backend cannot connect by entering a provider URL alone. Connection errors remain visible near the form, and the key field is cleared after saving; enter it again when retrying a failed save.

## OAuth sign-in

OAuth requires a service that supports an application you can register, the required API scopes, authorization-code exchange and PKCE. A consumer sign-in or paid subscription alone does not establish API access. Use the service's official application-registration instructions and register the exact loopback callback URL `http://127.0.0.1:18081/auth/callback`.

Configure these additional fields in ignored local `.env`:

```dotenv
API_AUTH_MODE=oauth
OAUTH_AUTHORIZATION_URL=https://your-service.example/authorize
OAUTH_TOKEN_URL=https://your-service.example/token
OAUTH_CLIENT_ID=your-registered-client-id
OAUTH_CLIENT_SECRET=
OAUTH_SCOPE=your-required-scopes
```

The example endpoints are illustrative; use the service's documented endpoints. Supply a client secret only when your registered client requires one; the adapter sends it as a token-exchange form field and keeps it on the backend. Do not copy an access token or account password into the frontend.

Start the backend and select **Connect agent** (shown as **Sign in to connect** when OAuth sign-in is required). Complete authorization in the popup at your chosen service and return to the scene. Allow the popup if your browser blocks it. The backend validates the state and PKCE exchange and keeps access/refresh tokens in server memory. Refresh tokens are used automatically when supplied by the service. Restarting the backend clears that session and requires sign-in again. The **Disconnect** button disables AI and clears the local OAuth session. The equivalent backend request is `POST /llm/auth/logout` with an empty JSON object; upstream account revocation follows the service's own process. With API-key or unauthenticated access, **Disconnect** disables the scene's AI without deleting backend configuration. Keep the loopback callback local; deployment requires its own registered callback and backend authentication design.

If the service requires a different grant, client-authentication method, resource/audience parameter or token response, ask your coding agent to adapt the backend with that service's official documentation. Do not bypass state validation or move token exchange into the scene.

## Internal routing and health

The browser sends service-neutral routing labels; real model IDs stay in backend configuration:

| Alias | Purpose | Setting |
| --- | --- | --- |
| `agent` | Dialogue, thoughts and proposed actions | `API_TEXT_MODEL` |
| `vision` | Optical interpretation | `API_VISION_MODEL`; text fallback for text-only requests |
| `creative` | Drawing, computer apps and procedural objects | `API_CREATIVE_MODEL`, then vision/text fallback |

The Vite development and preview servers strip `/llm` before forwarding to the local backend. Browser `/llm/health` reaches backend `/health`. For example, a configured but unsigned-in OAuth backend reports:

```json
{
  "status": "auth_required",
  "agent": {"name": "My Agent"},
  "vision": false,
  "auth": {"mode": "oauth", "connected": false, "loginUrl": "/llm/auth/login"},
  "connection": {"source": "env", "kind": "configured", "alternative": "sign-in", "host": "inference.example"},
  "upstreamChecked": false
}
```

`GET /llm/connection` returns editable non-secret `settings` (base URL, model IDs, agent name, authentication alternative, and `hasKey`). `POST /llm/connection/models` accepts the same draft endpoint/key fields as saving, without requiring a text model, and returns `{ "models": ["model-id"] }`. It accepts `reuseKey: true` only for the active endpoint. Discovery is bounded to 15 seconds, a 2 MiB provider response, and at most 2,000 unique valid model IDs; it shares the adapter's concurrency limit and cancels when the browser disconnects. Upstream redirects and raw error bodies are not forwarded.

Once locally configured authentication is available, `status` is `"ok"` and `auth.connected` is true. Modes are `api-key`, `oauth` or `none`. `connection.source` is `env`, `session`, or `none`. `connection.kind` is `configured`, `openai-compatible`, `invite`, or `none`. Health does not make a paid upstream request or prove that credentials, model permissions, scopes and quota work. Advertise vision only when configured for image input. Never return credentials, tokens, or API keys in health. The host is the endpoint hostname only.

## Chat request contract

`POST /llm/v1/chat/completions` in the browser reaches backend `POST /v1/chat/completions`. It accepts `Content-Type: application/json`:

```json
{
  "model": "agent",
  "messages": [
    {"role": "system", "content": "Scene instructions supplied by the host."},
    {"role": "user", "content": [{"type": "text", "text": "Current question and selected factual context."}]}
  ],
  "effort": "low",
  "max_tokens": 1500,
  "temperature": 0.9,
  "stream": false
}
```

Preserve system, user and assistant roles, including correction turns. Content may be a string or an array of parts. Text-only requests may contain text-part arrays; normalize those when the upstream requires strings. Images use:

```json
{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}
```

The backend maps aliases and constructs authorization itself, dropping unsupported service-specific fields such as top-level `effort`. For the configured `openrouter.ai` endpoint only, the app's `effort: "low"` becomes `reasoning: { "effort": "low" }` so a routed reasoning model can leave room for answer text within the existing output budget. The token limit is unchanged, and client-supplied `reasoning` objects are ignored. See [OpenRouter's reasoning-token contract](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens). A chat request must not select an upstream URL, model ID, or authorization header. Operator connection uses the separate local `POST /connection` route described above.

Return a nonstreaming envelope with a **string** in `choices[0].message.content`:

```json
{"choices":[{"message":{"role":"assistant","content":"the response text"}}]}
```

For an agent decision, that string contains JSON:

```json
{"thought":"I consider a small next step.","say":"What would you like to discuss?","speechKind":"address","vocalize":"","actions":[],"remember":""}
```

Use the exact action vocabulary and parsers in `src/cell/mind.js` and `src/cell/actions.js`. The runtime executes supported proposals and records actual results. A proposal does not establish that an action succeeded.

Do not force decision JSON on every request. Optical interpretation returns prose. Drawing returns stroke JSON. Computer-app generation returns TITLE/SUMMARY and fenced HTML. Procedural creation returns JSON with `name`, `description` and `code`. The adapter transports these response texts without rewriting them.

## Responsiveness, security and verification

Ordinary conversation skips a fresh optical call and requires a spoken reply. The latest question and current facts receive priority within a 12,000-character context budget; background context is capped at 18,000. These are context-character limits, not token limits or limits on every request field. Direct replies have a 30-second client deadline, and background thoughts have 45 seconds. Keep cancellation propagation and the backend's generation deadlines intact.

Pulse and sensor simulation do not trigger inference or log full snapshots on each beat. Background thinking defaults to 30 wall-clock seconds; fresh physical events are coalesced behind a five-second minimum, and questions bypass those cooldowns. A private local test profile has exercised a real text reply; the automated tests remain mocked and do not establish compatibility with each user's service or OAuth registration.

- Keep API keys, client secrets and tokens in the backend. Local `.env` is ignored. Never use `VITE_*` for secrets; those values can enter browser bundles. Graphs, examples, tests, screenshots and logs must contain no credentials.
- Preserve local Host/Origin/content-type checks, request/response bounds, concurrency limits, cancellation and sanitized errors. OAuth sign-in must preserve state, PKCE and callback validation. Never log raw authorization codes, token responses or prompt payloads.
- Generated computer apps have a script sandbox and restrictive CSP. Host API integration belongs in the backend, not inside these apps. The sandbox is not a hardened environment for hostile arbitrary JavaScript; do not loosen it to expose secrets.
- Run `npm test`, `npm run build`, `npm audit` and `npm run privacy:check`. Mock upstream generation and OAuth endpoints first, including failure/cancellation paths, model routing, roles, server-only authorization and token handling.
- When a live connection test is requested, verify a text reply, an image request if configured, cancellation, expired/revoked access and quota failure. Inspect diagnostics without printing secrets. A mocked test does not establish live compatibility.

If the agent does not answer, inspect the status below the chat input. Check that AI is enabled, the backend is running, and OAuth sign-in is complete when required. Pending and failed replies have explicit status. Follow-up questions queue behind a reply already in progress.

Successful model discovery and a green connection status only confirm local configuration and model-list access. They do not verify chat access. Chat failures now identify authentication, billing/quota, permissions, unavailable models, rate limits, context/output limits, provider outages and content-policy refusals below the chat input. Update API settings or the provider account according to that message. Failed transport requests are not immediately repeated; a later question can try again.

The adapter returns authored `{ "error": "safe explanation", "code": "provider_rate_limited" }` diagnostics with HTTP 502 for provider failures. It checks error envelopes even on HTTP 200, including errors attached to a completion choice, and rejects partial output marked as failed. Raw provider messages and metadata never reach the browser. Empty reasoning-only responses are not spoken answers; when the output budget is exhausted, select another chat model or adapt the backend's output/reasoning budget for your service. See [OpenRouter's error documentation](https://openrouter.ai/docs/api/reference/errors-and-debugging) for its error envelopes and reasoning-budget behavior.

## Deployment

The supplied adapter is for local development. `vite preview` and static hosting do not install the development proxy. A deployed scene needs its own same-origin `/llm` backend with authentication, authorization, rate limits and server-side secrets. Register deployment-specific OAuth callbacks and review allowed origins explicitly. Do not expose the loopback adapter by changing its bind address.

Neural voice, autonomous companion services and account-connected browsing are excluded. They require separate adapter contracts; changing the language-model endpoint does not enable them.

## Hand this to your coding agent

> Read AGENTS.md and docs/API-INTEGRATION.md. Connect the service and authentication mode I choose through tools/api-server.mjs. Use official current documentation for API endpoints, model IDs, scopes and OAuth registration. Keep my agent name configurable with AGENT_NAME and route agent/vision/creative aliases on the backend. Preserve message roles, text-part normalization, multimodal handling, response envelopes, request limits, cancellation, sanitized errors and the generated-app sandbox. For OAuth, preserve PKCE, state validation and server-only in-memory token handling. Never print credentials or copy them into source. Add mocked API/auth tests and run tests, build, dependency audit and privacy check. Explain any registration details I must supply. Do not make paid calls or deploy unless I request live testing or deployment.

## Looking and snapshots

`look_at`, `inspect`, and `snapshot {target?}` aim and settle before capturing a fresh 1280x720 optical frame. The agent interprets that frame while the gaze remains held, then reports its observations immediately. Snapshot is internal optical capture; it does not save or upload a photo file. A configured vision model is required. Concurrent captures share the next frame; cancellation aborts pending capture and interpretation. Geometric view candidates are navigation metadata, not pixel recognition, and their omission does not prove an object is absent.

## Personalize the connected experience

Connecting your service provides generation; it does not automatically change the character's role, biography, avatar or tools. Follow [Personalization](CUSTOMIZATION.md) to brief your coding agent, [Scenario development](SCENARIOS.md) for another setting, and [Feature development](EXTENDING.md) to add real capabilities. Keep new integrations behind explicit backend contracts and preserve the generic agent display name and model aliases.
