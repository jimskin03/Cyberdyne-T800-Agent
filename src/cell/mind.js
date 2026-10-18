// Provider-neutral cell AI orchestration. Transport, prompts, parsing, connection
// metadata, and creative generation live in src/cell/ai so this module only
// coordinates decisions and fresh vision.
import {PATIENT_MODEL, describeVision, withFeelingCue} from './sensor-contract.js';
import {createThoughtRhythm} from './thought-rhythm.js';
import {
  decisionIssues,
  blockedActions,
  actionKey,
  repeatedLine,
  repeatedSpeech,
  loopContext,
  speechHistory,
  stripRepeatedSentences,
} from '../repetition.js';
import {waitingDecisionIssues, workstationAction} from './browser-context.js';
import {createLlmClient} from './ai/llm-client.js';
import {createConnectionState, applyConnectionHealth} from './ai/connection-state.js';
import {createCreativeGenerator} from './ai/creative.js';
import {
  buildMessages,
  conversationOnly,
  wantsFreshVision,
  BUILDER,
} from './ai/prompts.js';
import {parseCreation, parseDecision} from './ai/parsers.js';

export {buildMessages, conversationOnly, wantsFreshVision, BUILDER, parseCreation, parseDecision};

export function createMind({
  enabled = true,
  client = createLlmClient(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  const rhythm = createThoughtRhythm();
  const lifecycle = new AbortController();
  let lastVision = null;
  const st = createConnectionState(enabled);
  const creative = createCreativeGenerator({client, state: st, lifecycleSignal: lifecycle.signal});

  async function poll() {
    try {
      const health = await client.health({
        signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(3000)]),
      });
      if (lifecycle.signal.aborted) return;
      applyConnectionHealth(st, health);
    } catch {
      if (lifecycle.signal.aborted) return;
      st.online = false;
      st.unconfigured = false;
    }
  }

  poll();
  const pollTimer = setIntervalFn(poll, 4000);

  async function decide(input, signal) {
    if (!st.enabled || !st.online) return null;
    const t0 = performance.now();
    signal = AbortSignal.any([
      ...(signal ? [signal] : []),
      lifecycle.signal,
      AbortSignal.timeout(input.intercom ? 30000 : 45000),
    ]);
    const job = {};
    st.inflight = job;
    st.lastError = '';

    try {
      const focus = rhythm.next(input);
      let visualObservation = 'Optical feed unavailable.';
      const freshVision =
        input.freshVision ?? (!input.intercom || wantsFreshVision(input.intercomText));
      st.visionSkipped = !freshVision;
      try {
        if (input.observationReply && input.observation)
          visualObservation =
            'Completed navigation target: ' +
            input.observation.target +
            '; captured ' +
            new Date(input.observation.capturedAt).toISOString() +
            '.\n' +
            input.observation.text;
        else if (st.vision && freshVision) {
          st.phase = 'vision';
          visualObservation = await describeVision(input, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
          });
          lastVision = {text: visualObservation, at: Date.now()};
        } else if (!freshVision)
          visualObservation =
            lastVision && Date.now() - lastVision.at < 30000
              ? 'Earlier optical observation (not a new frame): ' + lastVision.text
              : 'No new optical reading requested for this conversation. Use current nonvisual observations; do not infer unseen details.';
      } catch (error) {
        if (signal.aborted) {
          st.lastError = 'Reply cancelled or timed out.';
          return null;
        }
        st.visionError = error.message;
        visualObservation =
          'Optical feed unavailable for this observation. Use the other current sensor readings; do not infer unseen details.';
      }
      if (signal.aborted) {
        st.lastError = 'Reply cancelled or timed out.';
        return null;
      }

      const msgs = buildMessages({
        ...input,
        visualObservation,
        thoughtRhythm: focus.text,
        senses:
          input.senses +
          '\n' +
          loopContext(input.journal, {supportedTargets: input.supportedTargets}) +
          (st.loopFeedback ? '\nPrevious rejected attempt: ' + st.loopFeedback : ''),
      });
      st.contextChars = JSON.stringify(msgs).length;
      st.phase = 'answering';
      const attempts = input.browserWaiting ? 3 : 2;

      for (let i = 0; i < attempts; i++) {
        try {
          const json = await client.complete(
            {
              model: PATIENT_MODEL,
              effort: 'low',
              messages: msgs,
              max_tokens: 1500,
              temperature: 0.9,
              stream: false,
            },
            {signal},
          );
          const decision = parseDecision(json.choices?.[0]?.message?.content);
          st.calls++;
          st.lastMs = Math.round(performance.now() - t0);

          if (
            decision &&
            (decision.actions.length || decision.say || decision.thought || decision.vocalize)
          ) {
            const issues = [
              ...decisionIssues(decision, input),
              ...waitingDecisionIssues(decision, input),
              ...(input.intercom && !decision.say
                ? [
                    'Answer the current intercom message directly in a nonempty say field. Private thought alone is not a spoken answer.',
                  ]
                : []),
            ];
            if (!issues.length) {
              st.loopFeedback = '';
              return decision;
            }

            st.loopFeedback = issues.join(' ');
            st.loopRepairs++;
            if (i < attempts - 1) {
              msgs.push(
                {role: 'assistant', content: JSON.stringify(decision)},
                {
                  role: 'user',
                  content: withFeelingCue(
                    'Revise this decision before it happens. It has not been spoken or executed. ' +
                      st.loopFeedback +
                      ' Keep the current facts and personality; develop a genuinely new point rather than paraphrasing the same sensations. Follow the thought rhythm and current action restrictions. Return the full JSON decision.',
                  ),
                },
              );
              continue;
            }

            // Preserve useful, novel parts of a second decision; never replay its
            // duplicate line or the same failed action merely because repair ran out.
            const spoken = speechHistory(input.journal, input.recentSpeech);
            const failed = blockedActions(input.journal, {
              supportedTargets: input.supportedTargets,
            });
            if (repeatedSpeech(decision.say, spoken, {freshPain: input.freshPain})) {
              decision.say = stripRepeatedSentences(decision.say, spoken, {
                freshPain: input.freshPain,
              });
              if (repeatedSpeech(decision.say, spoken, {freshPain: input.freshPain}))
                decision.say = '';
              if (!decision.say && !input.freshPain) decision.vocalize = '';
            }
            decision.thought = stripRepeatedSentences(
              decision.thought,
              (input.journal || [])
                .filter((entry) => entry.kind === 'thought')
                .slice(-32)
                .map((entry) => entry.text),
              {freshPain: input.freshPain},
            );
            if (
              repeatedLine(
                decision.thought,
                (input.journal || [])
                  .filter((entry) => entry.kind === 'thought')
                  .slice(-16)
                  .map((entry) => entry.text),
                {threshold: 0.83},
              )
            )
              decision.thought = '';
            decision.actions = decision.actions.filter(
              (action) => (failed.get(actionKey(action))?.count || 0) < 2,
            );
            if (waitingDecisionIssues(decision, input).length)
              decision.actions = decision.actions.filter((action) => !workstationAction(action));
            if (waitingDecisionIssues(decision, input).length) continue;
            if (input.intercom && !decision.say) {
              st.lastError = 'The model returned no spoken answer.';
              continue;
            }
            if (
              decision.say ||
              decision.thought ||
              decision.actions.length ||
              decision.vocalize
            )
              return decision;
          }
        } catch {
          if (signal.aborted) {
            st.lastError = 'Reply cancelled or timed out.';
            return null;
          }
          st.lastError = 'AI request failed. Check the configured adapter and model access.';
          st.fails++;
          if (st.fails > 4) {
            st.online = false;
            st.fails = 0;
          }
        }
      }

      if (!st.lastError) st.lastError = 'The model did not return a usable response.';
      return null;
    } finally {
      if (st.inflight === job) {
        st.inflight = null;
        st.phase = 'idle';
      }
    }
  }

  async function observe({image, target, signal}) {
    if (!st.enabled || !st.online || !st.vision)
      throw Error('A connected vision model is required to inspect the optical frame.');
    st.phase = 'vision';
    try {
      const text = await describeVision(
        {image, target},
        {
          signal: AbortSignal.any([
            ...(signal ? [signal] : []),
            lifecycle.signal,
            AbortSignal.timeout(20000),
          ]),
        },
      );
      lastVision = {text, at: Date.now()};
      return {text, capturedAt: lastVision.at, target};
    } finally {
      st.phase = 'idle';
    }
  }

  return {
    st,
    decide,
    observe,
    draw: creative.draw,
    code: creative.code,
    create3D: creative.create3D,
    refresh: () => poll(true),
    destroy() {
      if (lifecycle.signal.aborted) return;
      lifecycle.abort(new DOMException('Mind destroyed.', 'AbortError'));
      clearIntervalFn(pollTimer);
      st.online = false;
      st.inflight = null;
      st.phase = 'idle';
    },
    setEnabled(value) {
      st.enabled = value;
      if (value) poll(true);
    },
    get online() {
      return st.online && st.enabled;
    },
  };
}
