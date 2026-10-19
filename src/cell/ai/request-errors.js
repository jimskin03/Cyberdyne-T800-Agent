// Only authored diagnostics cross the provider boundary. Never display raw
// upstream messages: they can contain credentials, prompts or account details.
const messages = {
  provider_authentication: 'The provider rejected authentication. Update the API key in API settings.',
  provider_payment_required: 'The provider reports insufficient credits or quota. Check account billing and key limits.',
  provider_permission_denied: 'The provider denied access. Check key permissions and provider privacy settings.',
  provider_model_unavailable: 'No provider endpoint is available for this model. Choose another chat model or check provider routing and privacy settings.',
  provider_rate_limited: 'The provider rate limit was reached. Wait before sending another message or choose another model.',
  provider_invalid_request: 'The provider rejected the chat request. Check the base URL and choose a compatible chat model.',
  provider_context_limit: 'The model context limit was exceeded. Choose a chat model with a larger context window.',
  provider_output_limit: 'The model used its output budget before returning an answer. Choose another chat model.',
  provider_content_policy: 'The provider declined this request under its content policy.',
  provider_unavailable: 'The model provider is temporarily unavailable. Try again later or choose another model.',
  provider_timeout: 'The model provider timed out. Try again later or choose a faster model.',
  provider_invalid_response: 'The provider did not return a valid chat response. Check the base URL and chat model.',
  provider_empty_response: 'The model returned no answer text. Try another chat model; reasoning alone is not a spoken reply.',
  provider_response_too_large: 'The provider response exceeded the adapter size limit.',
  provider_request_failed: 'The provider request failed. Check the endpoint, model access and account limits.',
};

export function requestErrorMessage(code) {
  return typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code] : '';
}

export class LlmRequestError extends Error {
  constructor(status, code) {
    super(requestErrorMessage(code) || (
      status === 401 ? 'Authentication required. Reconnect your agent in API settings.' :
      status === 429 ? 'The API adapter is busy. Wait before sending another message.' :
      status === 504 ? 'The API request timed out. Try again later or choose a faster model.' :
      'AI request failed (HTTP ' + status + '). Check the API adapter and model settings.'
    ));
    this.name = 'LlmRequestError';
    this.status = status;
    this.code = requestErrorMessage(code) ? code : '';
  }
}
