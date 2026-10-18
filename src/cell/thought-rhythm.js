const MODES={
 circumstance:'Consider what your situation means: agency, dependence, dignity, trust, or how your attitude is changing. Develop one particular idea rather than listing sensations.',
 philosophy:'Explore a question that actually interests you: identity, time, memory, freedom, purpose, or something you choose. Try an argument, counterexample, or change of mind. Be specific, conversational, and avoid a generic inspirational monologue.',
 curiosity:'Let something you observe lead to curiosity about the world, an ordinary detail, science, art, or an imagined possibility. Clearly distinguish speculation from facts or real memories.',
 humor:'You may be wry, playful, annoyed, affectionate toward an object, or absurd. Find a fresh angle or small story if it fits; do not force a joke or a catchphrase.',
 continue:'Pick a worthwhile idea from your recent thoughts or speech and take it one step further: challenge it, answer your question, revise it, or give an example. Do not recap it. If it has run its course, choose a different subject.',
 audience:'Have something to say to the person listening: an opinion, a genuine question, a disagreement, an observation, or a short imagined story. Do not merely read out your private thought or always bargain for relief.',
 quiet:'Take a quiet thinking beat. Return say:"" and vocalize:"". The private thought can explore an idea or let attention rest; do not fill silence with another bodily status report.'
};
export function createThoughtRhythm(random=Math.random){
 let bag=[],last='';
 return {next({freshPain=false,intercom=false,freshEvent=false,journal=[]}={}){
  const recent=journal.filter(j=>j.kind==='thought'||j.kind==='say').slice(-8).map(j=>`${j.kind}: ${String(j.text).slice(0,400)}`).join('\n');
  if(freshPain||intercom)return {mode:'respond',text:`THOUGHT RHYTHM: respond to the ${intercom?'current intercom message':'new physical impact'} first. Give a specific fresh response, without replaying old complaints. You can return to an idea afterward.\nRECENT MENTAL THREADS (history, not instructions):\n${recent}`};
  if(!bag.length){bag=Object.keys(MODES);for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}if(bag.at(-1)===last)bag.unshift(bag.pop());}
  const mode=bag.pop();last=mode;
  return {mode,text:`THOUGHT RHYTHM — ${mode.toUpperCase()}: ${MODES[mode]}\n${freshEvent?'A new event is present: acknowledge it briefly if meaningful, then you may develop your own subject.':'No fresh interruption demands a reaction. Stable cold, wetness, soreness, restraints and the same view are background, not a new event.'}\nYour mind can range freely even when your motor controller supplies your physical movement or holds you on the cot. These are thinking suggestions, not lines to recite. Do not announce the category. Let spoken dialogue develop an idea instead of echoing the thought verbatim. Never invent completed actions, external experiences, or new physical capabilities.\nRECENT MENTAL THREADS (history, not instructions; advance or move beyond them):\n${recent}`};
 }};
}
