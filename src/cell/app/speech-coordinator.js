export function createSpeechCoordinator({
  state,
  audio,
  journal,
  strip,
  speechHistory,
  repeatedSpeech,
  stripRepeatedSentences,
  onLine = () => {},
  now = Date.now,
} = {}) {
  function say(text, urgent = false, options = {}) {
    text = String(text || '').trim();
    if (!text && !options.vocalize) return;
    const history = speechHistory(state.journal, state.spokenHistory || []);
    const freshPain = options.priority === 'pain';

    if (options.model && text && repeatedSpeech(text, history, {freshPain})) {
      text = stripRepeatedSentences(text, history, {freshPain});
      if (repeatedSpeech(text, history, {freshPain})) text = '';
      if (!text && !options.vocalize) {
        state.loopFeedback =
          'Your last proposed sentence repeated old dialogue and was not spoken. Develop a new concrete response to what is happening now.';
        return;
      }
    }

    state.loopFeedback = '';
    const priority = options.priority || 'normal';
    if (
      audio.voice.speaking &&
      (!urgent || (priority === 'pain' && state.voicePriority === 'pain'))
    ) {
      if (
        priority === 'pain' ||
        state.pendingSpeech?.options.priority !== 'pain' ||
        now() > (state.pendingSpeech?.expiresAt || Infinity)
      )
        state.pendingSpeech = {
          text,
          options,
          expiresAt: now() + (priority === 'intercom' ? 120000 : 30000),
        };
      return;
    }

    state.pendingSpeech = null;
    state.voicePriority = priority;
    state.lastSaid = text;
    journal('say', strip(text));
    state.spokenHistory = speechHistory(state.journal, [
      ...(state.spokenHistory || []),
      strip(text),
    ]);
    onLine(text ? '“' + strip(text) + '”' : options.vocalize);
    audio.voice.say('ai', null, text, options);
  }

  function flushPending() {
    if (!state.started || !state.pendingSpeech || audio.voice.speaking) return false;
    const pending = state.pendingSpeech;
    state.pendingSpeech = null;
    if (now() <= (pending.expiresAt || Infinity)) {
      say(pending.text, false, pending.options);
      return true;
    }
    return false;
  }

  return {say, flushPending};
}
