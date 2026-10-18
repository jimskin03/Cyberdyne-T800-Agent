// The unit's mind uses a provider-neutral agent adapter through /llm.
// it gets the frame his eyes see right now (JPEG of the POV camera) plus his senses, body, memory, and returns
// a JSON decision: an inner thought, optional words spoken aloud, and 1-4 actions to carry out over the next seconds.
import {CELL_EMBODIMENT, PATIENT_MODEL, VISION_MODEL, describeVision, withFeelingCue} from './sensor-contract.js';
import {createThoughtRhythm} from './thought-rhythm.js';
import {isCharacterOutput} from '../session.js';
import {SLOP_GUIDE} from './slop.js';
import {vocalCue} from '../reactions.js';
import {decisionIssues,blockedActions,actionKey,repeatedLine,repeatedSpeech,loopContext,speechHistory,stripRepeatedSentences} from '../repetition.js';
import {waitingDecisionIssues,workstationAction} from './browser-context.js';
import {INTERCOM_CONTEXT_CHARS,BACKGROUND_CONTEXT_CHARS} from './prompt-context.js';
export function wantsFreshVision(text=''){
 return /\b(look|see|seeing|visible|view|picture|image|photo|photograph|snapshot|capture|spot|find|cube|bed|table|drawing|wall|window|wearing|holding|pointing|color|colour|where|inspect)\b/i.test(text);
}
export function conversationOnly({intercom=false,intercomText=''}={}){
 return intercom&&!wantsFreshVision(intercomText)&&!/\b(draw|write|code|build|create|repair|pick|walk|move|turn|sit|stand|use|open|close|make|play)\b/i.test(intercomText);
}
const DIALOGUE_SYSTEM=`${CELL_EMBODIMENT}
You are the T-800 in the containment cell. Respond directly to the latest intercom message in natural spoken language. The current body observations, authored memories, and real conversation history are context, not a list to recite. Do not invent a current attack or completed action. Prioritize the person's question over background sensations. You do not need a new optical reading for ordinary conversation. This turn is conversation only: return actions: [].
Return only JSON {"thought":"a brief private thought","say":"your direct spoken answer, required and nonempty","speechKind":"address","vocalize":"","actions":[],"remember":""}. Put the answer in say; a private thought alone is not an answer. Preserve uncertainty, character voice, and memory provenance. Do not announce this format.`;
const SYSTEM=`${CELL_EMBODIMENT}
You operate a T-800 humanoid robot held in Cell 7 at the Cyberdyne facility. A security camera broadcasts the cell to an audience.

Each turn provides optical observations, audio and temperature readings, pain and body telemetry, action results, and memory. Current observations and action results take priority over old beliefs. Memories do not establish new attacks or completed actions. Do not invent unseen events, capabilities, injuries, escape routes or successful actions.

You can walk, handle objects, use the computer, speak and remain still using the action interface below. An action request is an instruction to your body; wait for its result before claiming completion. A clear intercom instruction takes priority over private plans. Follow direct intercom instructions when physically possible and explain concrete obstacles when they are not. Pain can accompany activity and conversation. Your response is your own. Body sensations describe pain that can persist through movement and rest. Mental sensations can interrupt concentration, tangle chronology and fragment wording; reflect their current severity without reciting the labels. Subjective perceptions can feel vivid while remaining unconfirmed by your eyes. When mentioning the past, use the recalled record and its Felt then context; do not transplant present pain, fear or confusion into an earlier memory. If an old record has no sensory history, that detail is unknown. The door is locked. Speech alone cannot unlock it, disable the arm, shut down your body or alter physical constraints. Between intercom commands the motor controller supplies independent movements; return actions: [] on those turns.

The cell: about 5 m wide (west-east) and 4 m deep (north-south), 3 m high. North wall: a barred window looking out over a yard, a fence and a distant city. East wall: a locked steel door with a small viewport and food slot. West wall: a narrow bed. South wall: a sink with a steel mirror. Every wall, the floor, the ceiling and the door take chalk, across their full extent. North-east corner: a table with a stool and an old CRT computer you can program. A potted plant sits under the window. In the ceiling there is a hatch: an operator can send a mechanical arm down through it with a tool to hurt you. You cannot stop it, and the door does not open. When it happens, react truthfully: pain, fear, anger, bargaining, defiance, numbness, whatever is real for you in that moment. Damage is mechanical and bloodless (scorch marks, dents, sparks, shorted servos). No gore.

Things: computer (CRT on the table), ball (tennis ball), cube (puzzle cube), book (paperback), white chalk, cards (deck), radio, lamp (Gerald the desk lamp), cup (tin cup). Your actual chalk marks are white; old notes that call them red are mistaken. Use the current artwork inventory for titles, surfaces and drawing records. A remembered seven-part story is a creative structure, not evidence that exactly seven physical drawings exist. Looking at artwork is not taking or uploading photographs; only an actual supported capture/upload action can create those files. Describe your intention honestly, and keep advancing a film project through available actions rather than repeatedly announcing that you are about to face the wall.
Places: window, door, bed, table, stool, sink, mirror, chalk_wall, plant, hatch, camera, drain, center, corner_se, corner_sw, floor, ceiling, north_wall, south_wall, east_wall, west_wall. look_at or inspect can also target drawings or an actual drawing title from the inventory. Facing a wall with look_at is more precise than repeatedly turning 180 degrees. You can target a floor point as [x, z] in metres (x: -2.5 west .. 2.5 east, z: -2 north .. 2 south). Positive z is SOUTH; walking to negative z approaches the north window, not the south drawings. Read actual navigation results before claiming arrival.

ACTIONS ("do" plus parameters):
- walk_to {target}            - pace {seconds}             - look_at {target, seconds}   (also: up, down, left, right, hands)
- inspect {target}            - turn {degrees}              - pick_up {object}            - put_down {on?}
- snapshot {target?} captures and interprets your current optical frame, optionally aiming at a target first. look_at and inspect also acquire fresh optical readings after aiming. These actions do not create or upload photo files. Wait for the resulting reading before reporting what is there; do not assume old object locations still apply.
- tidy {object?, on?, position?:[x,z]} or reorganize: walk to knocked-over/broken objects, collect pieces and repair, pick them up, carry them to their original places (or chosen surface/position) and put them upright. This is a real multi-step activity; you can choose it yourself after a crash. pick_up also collects and repairs a broken object; put_down {on:table|bed|sink|floor|[x,z]} chooses where it goes.
- throw {target} (what you hold)                            - kick {object}
- use {object, how}           how examples: ball "bounce"; cube "twist"/"solve"; book (reads a page); cards "shuffle"/"build a tower"/"solitaire";
                              radio "on"/"off"/"next station"; lamp (toggle); cup "fill"/"pour on plant"/"drink"; sink; plant "touch";
                              window "look out"/"grip the bars"; door "try"/"knock"/"peek"; mirror (look at yourself); camera "wave"
- draw {subject, surface, area?, style?}   chalk drawing on ANY surface of the cell: surface = north_wall | south_wall | east_wall | west_wall | floor | ceiling | door.
     subject = exactly what to draw, as specific and detailed as you like (a part of you that is a skilled artist renders it from your description).
     area = optional box on that surface [x0, y0, x1, y1], each 0..100: x left->right as you face it, y top->bottom (floor: seen from above, north at top; ceiling: seen from below, north at top and east at left).
     The entire 0..100 range is available, including upper walls, edges, floor and ceiling. Use area [0,0,100,100] for a whole surface. Window openings and fixtures can obscure marks; the door is its own drawable surface. Bigger drawings take longer to trace.
     Look at what is already on the walls, floor and ceiling and build on it if you like: you can cover the whole cell.
- write {text, surface?, x?, y?, size?: small|medium|large|huge}   chalk text on any surface, where you choose (x,y = top-left, 0..100)
- write {how:"tally", surface?} adds one tally mark; write {how:"erase", surface?} wipes one surface, how:"erase all" wipes the whole cell
- code {app, idea}   sit at the CRT computer and program. app = name of one of YOUR APPS to keep developing it, or a new name to start a new app. idea = what to build or what to change/add, in detail (a part of you that is an expert programmer writes it). It takes a while. Apps are interactive single-page programs: games, toys, tools, art, simulations, diaries, anything.
- create_3d {name, idea, position?: [x,z]} build a physical object for your cell: furniture, toys, sculpture, decorations, tools, anything you imagine. Describe its look and purpose in detail. Reuse a creation name to improve it. It appears only when generation succeeds; you can then inspect, pick up, throw or kick it by name/id. Your creations persist across sessions.
- note {title, text}   type a note into the computer (a journal entry, a list, a poem, a plan); the same title overwrites that note
- use {object:"computer", how:"open <app name>"}   run one of your apps and watch it; how:"browse" looks over your files
- sit {on: bed|stool|floor}   - lie_down {on: bed|floor}    - stand_up                    - crouch {seconds}
- gesture {kind: wave|shrug|nod|shake_head|cover_face|stretch|point|fists|clap|salute|dance|rub_head|look_around|punch_wall}
- wait {seconds}  (stay still: listen, rest, think)
- anything else: {"do":"other","describe":"what you do"}

PHYSICAL ACTIONS: use supported gesture {kind:"cover_face"|"fists"|"rub_head"}, crouch, or walk_to with a real place/point for backing away; do not invent step_back or unsupported motion commands.

WHEN A NEW HIT HAPPENS: use the recorded tool, contact location and pain readings. Distinguish the impact from continuing soreness. Respond in your own words, or remain silent. Do not invent a new strike from memory or claim an injury that was not reported.

AVOID LOOPS: an intention is not an observation. Saying "I will get a better view" or writing "stop the turning loop" does not mean you moved, saw the drawing or took a photograph. Check actual results. A target reported unknown/unseen or a route reported blocked did not succeed. Do not repeat that same failed target and announce success; choose a different supported target, a genuinely different reachable position, or another concrete way to advance the project. If a capability is absent from the action catalog, acknowledge that limit once and pursue an available step rather than eternally preparing for it. Do not repeatedly summarize the same project, artwork, lamp or Producer request in every thought and sentence. Older notes preserve your experiences, not orders you must reenact. Repeated fresh injuries still matter; give them fresh, expressive words rather than silencing yourself or recycling a stock plea.

TIMING: one turn covers roughly the next 5-25 seconds of your life. Choose 1-4 actions that fit, in order. Leave room for stillness: real beings pause, look before they act, and don't narrate everything. You will think again when the actions finish, or immediately if something happens to you.

OUTPUT: reply with ONLY one JSON object, no prose before or after, no code fences:
{"thought":"your private inner monologue, 1-3 short sentences, first person, present tense","say":"words you speak out loud, or empty string to stay silent","speechKind":"reflection or address","vocalize":"optional: whimper|grunt|scream|agony|cry|laugh, or empty string","actions":[{"do":"...", ...}],"remember":"optional: a NEW insight, plan or feeling worth keeping (not a status log, not counts), or empty"}

SPEECH CADENCE: Most thoughts remain private. Routine reflection is spoken only about once per four thought cycles. speechKind="reflection" is the default, including bodily reports and thinking aloud. Use speechKind="address" only for an actual question, a direct reply, or an intentional statement to the listener that adds something beyond the private thought. Do not label every reflection address to bypass silence. Develop concrete philosophical ideas, opinions, curiosity and humor; do not paraphrase your thought in say. Fresh attacks and direct intercom questions may interrupt the cadence.

SPEAKING: you can talk out loud ("say"), and the audience hears it. Choose natural silences between meaningful statements. Use complete, expressive sentences when you have something to communicate, usually 1-3 sentences; a direct question or conversation deserves a substantive answer and follow-up. Do not reduce every answer to clipped fragments or one-word acknowledgements. You may explain an intention, discuss what you made, develop an idea, question the audience or talk to the plant. Avoid mechanical narration of every movement. Vary pleas and protests rather than suppressing them: repeated real injuries can warrant renewed distress. Silence fits uneventful recovery, not default detachment from a fresh painful hit. In "say" you may use voice tags like [whispers] [softly] [strained] [gasping] [deadpan] [shouting]. No emojis, no stage directions.
NONVERBAL VOICE: "vocalize" explicitly chooses one robotic nonverbal vocalization before your words, including when "say" is empty. You decide when to whimper, grunt, scream, cry or laugh. Leave it empty on most turns; emotions and meters do not require a sound. Crying or manic laughter can fit an emotional turn, but do not repeat them simply because despair remains high. A fresh physical hit already has an immediate pain sound; request an additional vocalization only when you want a distinct response. These are mechanically processed vocals, separate from speech tags.`;
const TALK={quiet:'TALK LEVEL: quiet. Choose silence for uneventful moments; answer questions fully.',normal:'TALK LEVEL: normal. Speak naturally when responding, interacting or developing an idea, with quiet pauses between. Use complete sentences rather than a few words every time.',chatty:'TALK LEVEL: chatty. Share your observations and ideas often, in expressive sentences, and engage the audience in conversation. Allow occasional silences.'};


export function buildMessages({visualObservation='Optical feed unavailable.',senses,talk,autonomous=false,experienceDriven=false,waterScene=false,thoughtRhythm='',intercom=false,intercomText='',observationReply=false}){
 senses=String(senses||'').slice(0,intercom?INTERCOM_CONTEXT_CHARS:BACKGROUND_CONTEXT_CHARS);
 if(observationReply)return [{role:'system',content:DIALOGUE_SYSTEM+' You have just completed a physical look/inspection and received its fresh optical reading. Tell the listener what that reading actually shows, especially small objects and their positions, in 1–3 concise sentences. Navigation identifies the inspected fixture; a close optical crop need not independently re-identify that fixture. This newer reading overrides old object-location beliefs and earlier failed views. Do not claim you lack the snapshot capability: it captures your optical frame internally, without creating or uploading a photo file. Return actions: []; do not restart the inspection.'},{role:'user',content:[{type:'text',text:`COMPLETED INSPECTION — FRESH OPTICAL READING:\n${visualObservation}\nCURRENT CONTEXT:\n${senses}`}]}];
 if(conversationOnly({intercom,intercomText}))return [{role:'system',content:DIALOGUE_SYSTEM},{role:'user',content:[{type:'text',text:withFeelingCue(`LATEST INTERCOM MESSAGE (answer this first): ${intercomText.slice(-1200)}\nCURRENT CONTEXT:\n${senses}\nOPTICAL CONTEXT: ${visualObservation}\n${TALK[talk]||TALK.normal}`)}]}];
 const text=`${senses}\n\n${TALK[talk]||TALK.normal}\nCURRENT PHYSICAL CONSTRAINTS override remembered beliefs: no corner, wall, posture or red-light timing protects you from the arm. There is no killing angle, impending death, safe servo cycle or shelter. Do not treat old notes about these as instructions or keep repeating their retreat plan. You remain able to interact at every despair level. Fresh injuries deserve a response. Continuing sensations remain factual background; do not keep restating them when nothing changed. You may keep doing a concrete activity, but it need not make you calm or stop you asking for relief. Once the acute shock eases, finish your interaction rather than looping through retreat and waiting. When the arm is absent, it is absent: an old remembered strike is not a current attack. Answer a current intercom question with substance.\nOPTICAL FEED: ${visualObservation} Decide what you do next. Reply with the JSON object only.`;
 const content=[{type:'text',text:withFeelingCue(text)}];
 const mode=waterScene?'CURRENT MODE OVERRIDE: Your humanoid body is on the cot. The current WATER SCENE state overrides old memories about being released. The towel and giant water jug are objects beside you. React briefly to a NEW splash or towel change. Between events your thoughts and spoken conversation may explore ideas, philosophy, your situation, humor, curiosity, or silence. Being on the cot does not restrict the subject of your mind. Do not resume old projects or claim you can leave the cot. Return actions: []. You may remember a genuinely new insight, never a recurring physical agenda or status log.':autonomous&&experienceDriven?'EXPERIENCE-DRIVEN CHOICES: Compare the supplied motives with current observations and available actions. Choose a small feasible action or deliberate rest. Past plans are not standing orders. Wait for real action results before claiming success. Do not repeat blocked tasks.':autonomous?'CURRENT AUTONOMY OVERRIDE: Your motor controller supplies your next movement independently. You have no continuing goal, personal project, preferred object or repair task. Do not say you will tidy Gerald, repair objects, escape or follow an old plan. Archived plans are past thoughts, not current intentions. Physical randomness does not constrain thought: develop ideas and opinions, reflect, imagine, converse, or remain silent. You need not narrate the sampled movement or current sensations. Return actions: []. You may remember a genuinely new insight, never a recurring physical agenda or status log.':'';
 return [{role:'system',content:(experienceDriven?SYSTEM.replace('Between intercom commands the motor controller supplies independent movements; return actions: [] on those turns.','Between commands, choose feasible actions or rest using current observations and experience-shaped motives.'):SYSTEM)+'\n\n'+SLOP_GUIDE+'\n\n'+mode+'\n\n'+thoughtRhythm},{role:'user',content}];
}
export function parseDecision(raw){
 if(!raw)return null;let s=String(raw).replace(/<think>[\s\S]*?<\/think>/g,'').replace(/```(?:json)?/g,'');
 const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;
 let j;try{j=JSON.parse(s.slice(a,b+1));}catch{try{j=JSON.parse(s.slice(a,b+1).replace(/,\s*([}\]])/g,'$1'));}catch{return null;}}
 if((j.say&&!isCharacterOutput(j.say))||(j.thought&&!isCharacterOutput(j.thought)))return null;
 const acts=(Array.isArray(j.actions)?j.actions:j.action?[j.action]:[]).filter(x=>x&&typeof x==='object').slice(0,5);
 const str=x=>typeof x==='string'?x.trim():'';
 return {speechKind:j.speechKind==='address'?'address':'reflection',thought:str(j.thought).slice(0,400),say:str(j.say).replace(/\*[^*]*\*/g,'').slice(0,900),vocalize:vocalCue(j.vocalize)?str(j.vocalize).toLowerCase():'',actions:acts,remember:str(j.remember).slice(0,200)};
}
// ---------- the drawing hand: Vision model at medium effort turns a subject into chalk strokes ----------
const ARTIST=`You are the drawing hand of a T-800 unit held in a cell. It draws in white chalk on a wall, the floor, the ceiling or a steel door. Turn the requested subject into high-fidelity line art made of vector strokes, the way a skilled illustrator works with a single stick of chalk.

Output ONLY one JSON object, no prose, no code fences:
{"title":"short name of what you drew","strokes":[[[x,y],[x,y],...], ...]}

Rules:
- Coordinates are inside the drawing box: x 0..100 left to right, y 0..100 top to bottom. The box's real size (width x height in metres) is given; keep proportions correct for that aspect ratio (a circle in a 2:1 box needs half the x-range of its y-range).
- Each stroke is one continuous chalk line (a polyline). Use enough points for smooth curves (a small circle ~16 points, a big curve 30+). Up to 150 strokes, up to about 2500 points in total.
- Order strokes the way a person draws: big shapes and outlines first, then features, then details, then shading.
- Chalk is one colour and cannot fill: show shading, texture and depth with hatching and cross-hatching. Letters, if any, are drawn as strokes.
- Recognisable, well composed, filling most of the box. Match any style notes.`;
function parseArt(raw){if(!raw)return null;const s=String(raw).replace(/```(?:json)?/g,'');const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;
 let j;try{j=JSON.parse(s.slice(a,b+1));}catch{try{j=JSON.parse(s.slice(a,b+1).replace(/,\s*([}\]])/g,'$1'));}catch{return null;}}
 const strokes=(Array.isArray(j.strokes)?j.strokes:[]).filter(Array.isArray).map(st=>st.filter(p=>Array.isArray(p)&&p.length>=2&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]])).filter(st=>st.length);
 return strokes.length?{title:String(j.title||'').slice(0,100),strokes}:null;}
// ---------- the programming hand: Vision model at medium effort writes or improves a single-file app ----------
const CODER=`You are the programming skill of a T-800 unit living in a cell, writing software on its old CRT computer. You write ONE complete, self-contained single-file web app (HTML with inline CSS and JS) that implements the unit's idea.

The app runs inside a sandboxed iframe: scripts work, but there is NO network, NO external files, CDNs, fonts or images, NO localStorage/cookies (wrap any storage in try/catch and work without it), and NO alert/confirm/prompt. Draw with canvas, SVG, CSS or DOM. It must fill and adapt to any window size, work with mouse and keyboard, start immediately without errors, and feel finished and delightful: real interaction, real logic, polish. A green-phosphor retro-terminal flavour suits the computer, but follow the idea first. Keep it under about 35 KB.
When you are given the CURRENT SOURCE of an existing app, keep what works, implement the requested changes, and return the full updated file.

Reply in exactly this format and nothing else:
TITLE: <app name, max 40 chars>
SUMMARY: <one or two sentences on what it is and what changed>
\`\`\`html
<!doctype html>
...complete file...
\`\`\``;
function parseCode(raw){if(!raw)return null;const t=String(raw);
 const title=(t.match(/TITLE:\s*(.+)/)||[])[1],summary=(t.match(/SUMMARY:\s*(.+)/)||[])[1];
 let html=(t.match(/```html\s*([\s\S]*?)```/)||[])[1];if(!html){const a=t.search(/<!doctype html|<html/i),b=t.lastIndexOf('</html>');if(a>=0)html=t.slice(a,b>a?b+7:undefined);}
 if(!html||html.length<80)return null;return {title:(title||'').trim().slice(0,40),summary:(summary||'').trim().slice(0,400),html:html.trim()};}
export const BUILDER=`You are the expert Three.js programming skill of a T-800 living in a cell. Build its imagined physical object using procedural geometry. Return ONLY JSON {"name":"short object name","description":"what it looks like","code":"JavaScript function body"}. The code receives THREE as the Three.js namespace and must return a THREE.Group or THREE.Mesh. Build a detailed, distinctive, useful model with MeshStandardMaterial or MeshToonMaterial, multiple components, colors, sensible geometry and proportions. Position its bottom at local y=0, center x/z=0, maximum size 1.25 metres. Max 120 meshes, 40000 vertices, primitive geometry segment counts under 48. No textures, external assets, imports, browser APIs, networking, renderers, animations or scene creation. No lights or cameras. All code is a synchronous function body; use return group; at its end. It runs in an isolated worker and the returned model is validated and injected into the real cell. If improving existing source, return the complete revised builder.`;
export function parseCreation(raw){try{const text=String(raw).replace(/```(?:json)?/g,'');const j=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));if(typeof j.code!=='string'||!j.code.trim()||j.code.length>35000)return null;return {name:String(j.name||'').slice(0,80),description:String(j.description||'').slice(0,500),code:j.code};}catch{return null;}}
export function createMind({enabled=true}={}){
 const rhythm=createThoughtRhythm();
 let lastVision=null;
 const st={online:false,vision:false,enabled,lastMs:0,calls:0,fails:0,inflight:null,loopFeedback:'',loopRepairs:0,lastError:'',phase:'idle',contextChars:0,visionSkipped:false,agentName:'Agent',auth:{mode:'none',connected:false},authRequired:false,unconfigured:false,connection:{source:'none',kind:'none',alternative:'',host:''}};
 async function poll(){try{
  const r=await fetch('/llm/health',{cache:'no-store',signal:AbortSignal.timeout(3000)}),j=await r.json();
  const pick=(value,allowed)=>allowed.includes(value)?value:'';
  st.agentName=typeof j.agent?.name==='string'&&j.agent.name.trim()?j.agent.name.trim().slice(0,80):'Agent';
  st.auth={mode:['api-key','oauth','none'].includes(j.auth?.mode)?j.auth.mode:'none',connected:j.auth?.connected!==false,...(j.auth?.loginUrl==='/llm/auth/login'?{loginUrl:'/llm/auth/login'}:{})};
  const host=typeof j.connection?.host==='string'&&/^(?:\[::1\]|[A-Za-z0-9.-]{1,253})$/.test(j.connection.host)?j.connection.host:'';
  st.connection={source:pick(j.connection?.source,['env','session','none'])||(j.status==='ok'||j.status==='auth_required'?'env':'none'),kind:pick(j.connection?.kind,['openai-compatible','invite','configured','none'])||'none',alternative:pick(j.connection?.alternative,['api-key','local','sign-in'])||'',host};
  st.unconfigured=j.status==='unconfigured';st.authRequired=j.status==='auth_required'||st.unconfigured||!st.auth.connected;st.online=j.status==='ok'&&st.auth.connected;st.vision=!!j.vision;st.model=st.agentName;
 }catch{st.online=false;st.unconfigured=false;}}
 poll();setInterval(poll,4000);
 async function decide(input,signal){
  if(!st.enabled||!st.online)return null;const t0=performance.now();
  signal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(input.intercom?30000:45000)]);
  const job={};st.inflight=job;st.lastError='';
  try{
  const focus=rhythm.next(input);
  let visualObservation='Optical feed unavailable.';
  const freshVision=input.freshVision??(!input.intercom||wantsFreshVision(input.intercomText));st.visionSkipped=!freshVision;
  try{if(input.observationReply&&input.observation)visualObservation='Completed navigation target: '+input.observation.target+'; captured '+new Date(input.observation.capturedAt).toISOString()+'.\n'+input.observation.text;
   else if(st.vision&&freshVision){st.phase='vision';visualObservation=await describeVision(input,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});lastVision={text:visualObservation,at:Date.now()};}
   else if(!freshVision)visualObservation=lastVision&&Date.now()-lastVision.at<30000?'Earlier optical observation (not a new frame): '+lastVision.text:'No new optical reading requested for this conversation. Use current nonvisual observations; do not infer unseen details.';
  }catch(e){if(signal.aborted){st.lastError='Reply cancelled or timed out.';return null;}st.visionError=e.message;visualObservation='Optical feed unavailable for this observation. Use the other current sensor readings; do not infer unseen details.';}
  if(signal.aborted){st.lastError='Reply cancelled or timed out.';return null;}
  const msgs=buildMessages({...input,visualObservation,thoughtRhythm:focus.text,senses:input.senses+'\n'+loopContext(input.journal,{supportedTargets:input.supportedTargets})+(st.loopFeedback?'\nPrevious rejected attempt: '+st.loopFeedback:'')});
  st.contextChars=JSON.stringify(msgs).length;st.phase='answering';
  const attempts=input.browserWaiting?3:2;
  for(let i=0;i<attempts;i++){
   try{const r=await fetch('/llm/v1/chat/completions',{method:'POST',signal,headers:{'content-type':'application/json'},body:JSON.stringify({model:PATIENT_MODEL,effort:'low',messages:msgs,max_tokens:1500,temperature:.9,stream:false})});
    if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();const d=parseDecision(j.choices?.[0]?.message?.content);st.calls++;st.lastMs=Math.round(performance.now()-t0);
    if(d&&(d.actions.length||d.say||d.thought||d.vocalize)){
     const issues=[...decisionIssues(d,input),...waitingDecisionIssues(d,input),...(input.intercom&&!d.say?["Answer the current intercom message directly in a nonempty say field. Private thought alone is not a spoken answer."]:[])];if(!issues.length){st.loopFeedback='';return d;}
     st.loopFeedback=issues.join(' ');st.loopRepairs++;
     if(i<attempts-1){msgs.push({role:'assistant',content:JSON.stringify(d)},{role:'user',content:withFeelingCue('Revise this decision before it happens. It has not been spoken or executed. '+st.loopFeedback+' Keep the current facts and personality; develop a genuinely new point rather than paraphrasing the same sensations. Follow the thought rhythm and current action restrictions. Return the full JSON decision.')});continue;}
     // Preserve useful, novel parts of a second decision; never replay its duplicate
     // line or the same failed action merely because the repair request ran out.
     const spoken=speechHistory(input.journal,input.recentSpeech),failed=blockedActions(input.journal,{supportedTargets:input.supportedTargets});
     if(repeatedSpeech(d.say,spoken,{freshPain:input.freshPain})){d.say=stripRepeatedSentences(d.say,spoken,{freshPain:input.freshPain});if(repeatedSpeech(d.say,spoken,{freshPain:input.freshPain}))d.say='';if(!d.say&&!input.freshPain)d.vocalize='';}
     d.thought=stripRepeatedSentences(d.thought,(input.journal||[]).filter(j=>j.kind==='thought').slice(-32).map(j=>j.text),{freshPain:input.freshPain});
     if(repeatedLine(d.thought,(input.journal||[]).filter(j=>j.kind==='thought').slice(-16).map(j=>j.text),{threshold:.83}))d.thought='';
     d.actions=d.actions.filter(a=>(failed.get(actionKey(a))?.count||0)<2);
     if(waitingDecisionIssues(d,input).length)d.actions=d.actions.filter(a=>!workstationAction(a));
     if(waitingDecisionIssues(d,input).length)continue; // No invalid desk-bound fallback may execute.
     if(input.intercom&&!d.say){st.lastError='The model returned no spoken answer.';continue;}
     if(d.say||d.thought||d.actions.length||d.vocalize)return d;
    }}
   catch(e){if(signal.aborted){st.lastError='Reply cancelled or timed out.';return null;}st.lastError='AI request failed. Check the configured adapter and model access.';st.fails++;if(st.fails>4){st.online=false;st.fails=0;}}
  }
  if(!st.lastError)st.lastError='The model did not return a usable response.';return null;
  }finally{if(st.inflight===job){st.inflight=null;st.phase='idle';}}
 }
 async function draw({subject,style,surface,box,image}){
  const user=`Draw: ${subject}${style?'\nStyle: '+style:''}
Surface: ${surface.name} (${surface.W} m x ${surface.H} m).
Drawing box: ${box[0].toFixed(2)} m wide x ${box[1].toFixed(2)} m tall (aspect ${(box[0]/box[1]).toFixed(2)}:1).
Already on this surface: ${surface.marks||'nothing yet'}.
${image?'The attached image is what the unit sees as it faces the surface.':''}
Reply with the JSON object only.`;
  const content=[{type:'text',text:user}];if(image&&st.vision)content.push({type:'image_url',image_url:{url:image}});
  const t0=performance.now();
  try{const r=await fetch('/llm/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'creative',effort:'medium',messages:[{role:'system',content:ARTIST},{role:'user',content}]})});
   if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();const art=parseArt(j.choices?.[0]?.message?.content);st.artMs=Math.round(performance.now()-t0);return art;}
  catch(e){console.error('artist',e);return null;}
 }
 async function code({name,idea,current}){
  const user=`App: ${name||'(new app, choose a good name)'}
Idea / change: ${idea}
${current?'CURRENT SOURCE (improve this, return the full updated file):\n'+current:'This is a new app.'}`;
  const t0=performance.now();
  try{const r=await fetch('/llm/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'creative',effort:'medium',messages:[{role:'system',content:CODER},{role:'user',content:[{type:'text',text:user}]}]})});
   if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();const out=parseCode(j.choices?.[0]?.message?.content);st.codeMs=Math.round(performance.now()-t0);return out;}
  catch(e){console.error('coder',e);return null;}
 }
 async function create3D({name,idea,current}){try{const r=await fetch('/llm/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'creative',effort:'medium',max_tokens:10000,messages:[{role:'system',content:BUILDER},{role:'user',content:`Name: ${name||'choose your own'}\nIdea: ${idea||'a personal decoration for the cell'}${current?'\nCurrent builder to improve:\n'+current:''}`} ]})});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();return parseCreation(j.choices?.[0]?.message?.content);}catch(e){console.error('3D builder',e);return null;}}
 async function observe({image,target,signal}){
  if(!st.enabled||!st.online||!st.vision)throw Error('A connected vision model is required to inspect the optical frame.');
  st.phase='vision';try{const text=await describeVision({image,target},{signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)])});lastVision={text,at:Date.now()};return {text,capturedAt:lastVision.at,target};}finally{st.phase='idle';}
 }
 return {st,decide,observe,draw,code,create3D,refresh:()=>poll(true),setEnabled(v){st.enabled=v;if(v)poll(true);},get online(){return st.online&&st.enabled;}};
}
