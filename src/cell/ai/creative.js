import {ARTIST, CODER, BUILDER} from './prompts.js';
import {parseArt, parseCode, parseCreation} from './parsers.js';

export function createCreativeGenerator({
  client,
  state,
  lifecycleSignal,
  now = () => performance.now(),
  logger = console,
} = {}) {
  const requestSignal = (signal) => {
    const signals = [signal, lifecycleSignal].filter(Boolean);
    return signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  };
  async function draw({subject, style, surface, box, image, signal}) {
    const user = `Draw: ${subject}${style ? '\nStyle: ' + style : ''}
Surface: ${surface.name} (${surface.W} m x ${surface.H} m).
Drawing box: ${box[0].toFixed(2)} m wide x ${box[1].toFixed(2)} m tall (aspect ${(box[0] / box[1]).toFixed(2)}:1).
Already on this surface: ${surface.marks || 'nothing yet'}.
${image ? 'The attached image is what the unit sees as it faces the surface.' : ''}
Reply with the JSON object only.`;
    const content = [{type: 'text', text: user}];
    if (image && state.vision) content.push({type: 'image_url', image_url: {url: image}});
    const started = now();
    try {
      const json = await client.complete(
        {
          model: 'creative',
          effort: 'medium',
          messages: [
            {role: 'system', content: ARTIST},
            {role: 'user', content},
          ],
        },
        {signal: requestSignal(signal)},
      );
      const art = parseArt(json.choices?.[0]?.message?.content);
      state.artMs = Math.round(now() - started);
      return art;
    } catch (error) {
      if (signal?.aborted || lifecycleSignal?.aborted || error?.name === 'AbortError')
        throw error?.name === 'AbortError' ? error : new DOMException('Creative request cancelled.', 'AbortError');
      logger.error('artist', error);
      return null;
    }
  }

  async function code({name, idea, current, signal}) {
    const user = `App: ${name || '(new app, choose a good name)'}
Idea / change: ${idea}
${current ? 'CURRENT SOURCE (improve this, return the full updated file):\n' + current : 'This is a new app.'}`;
    const started = now();
    try {
      const json = await client.complete(
        {
          model: 'creative',
          effort: 'medium',
          messages: [
            {role: 'system', content: CODER},
            {role: 'user', content: [{type: 'text', text: user}]},
          ],
        },
        {signal: requestSignal(signal)},
      );
      const output = parseCode(json.choices?.[0]?.message?.content);
      state.codeMs = Math.round(now() - started);
      return output;
    } catch (error) {
      if (signal?.aborted || lifecycleSignal?.aborted || error?.name === 'AbortError')
        throw error?.name === 'AbortError' ? error : new DOMException('Creative request cancelled.', 'AbortError');
      logger.error('coder', error);
      return null;
    }
  }

  async function create3D({name, idea, current, signal}) {
    try {
      const json = await client.complete(
        {
          model: 'creative',
          effort: 'medium',
          max_tokens: 10000,
          messages: [
            {role: 'system', content: BUILDER},
            {
              role: 'user',
              content: `Name: ${name || 'choose your own'}
Idea: ${idea || 'a personal decoration for the cell'}${current ? '\nCurrent builder to improve:\n' + current : ''}`,
            },
          ],
        },
        {signal: requestSignal(signal)},
      );
      return parseCreation(json.choices?.[0]?.message?.content);
    } catch (error) {
      if (signal?.aborted || lifecycleSignal?.aborted || error?.name === 'AbortError')
        throw error?.name === 'AbortError' ? error : new DOMException('Creative request cancelled.', 'AbortError');
      logger.error('3D builder', error);
      return null;
    }
  }

  return {draw, code, create3D};
}
