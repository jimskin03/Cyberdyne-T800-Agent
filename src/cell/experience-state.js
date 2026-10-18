// Explicit, inspectable fiction mechanics. No model inference is accepted as a new fact.
const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const round=n=>Math.round(n*1000)/1000;
const tokens=s=>String(s).toLowerCase().match(/[a-z]+/g)||[];
const hypothetical=/\b(if|imagine|suppose|hypothetical|would|might|pretend|roleplay)\b/i;
const channels={
 supportive_correction:{help_is_safe:1,authority_fairness:.6,evaluation_risk:-.55,repair_after_conflict:.4},
 respectful_feedback:{authority_fairness:.7,help_is_safe:.5,evaluation_risk:-.3},
 ridicule:{evaluation_risk:1,authority_fairness:-.65,avoid_shame:.6,help_is_safe:-.3},
 apology:{repair_after_conflict:.7,authority_fairness:.35},
 task_success:{mastery:.8,repairer_identity:.6,practical_coping:.5},
 task_failure:{mastery:-.3,repairer_identity:-.2},
 harm:{evaluation_risk:.3,authority_fairness:-.7,separation_alarm:.25},
 support_received:{seek_support:.8,friend_reliability:.45,help_is_safe:.7}
};
export function validateExperienceProfile(graph){
 if(!graph.behavior)return;
 if(graph.behavior.version!==1||!Array.isArray(graph.behavior.facets))throw Error('Invalid experience profile');
 const ids=new Set(),nodes=new Set(graph.nodes.map(n=>n.id));
 for(const f of graph.behavior.facets){
  if(!/^[a-z_]+$/.test(f.id)||ids.has(f.id)||!f.label||!f.layer||!Array.isArray(f.cues)||!Array.isArray(f.evidence))throw Error('Invalid behavioral facet');
  ids.add(f.id);for(const [id,w] of f.evidence)if(!nodes.has(id)||!Number.isFinite(w)||Math.abs(w)>1)throw Error('Invalid behavioral evidence');
 }
}
export function createExperienceState(graph,{now=()=>Date.now()}={}){
 const facets=graph.behavior?.facets||[],known=new Set(facets.map(f=>f.id)),nodes=new Map(graph.nodes.map(n=>[n.id,n]));
 let state,assessment=null;
 const baseline=f=>clamp(.5+Math.tanh(f.evidence.reduce((sum,[id,w])=>sum+w*(nodes.get(id)?.strength??0),0)*.65)*.45);
 function restore(saved){
  state={version:1,graphId:graph.id,updates:{},relationships:{},events:[],seen:[],arousal:0,arousalAt:now()};assessment=null;
  if(saved?.version!==1||saved.graphId!==graph.id)return;
  for(const [id,v] of Object.entries(saved.updates||{}))if(known.has(id)&&Number.isFinite(v))state.updates[id]=clamp(v,-.35,.35);
  for(const [person,values] of Object.entries(saved.relationships||{}).slice(-32)){
   if(!/^[a-z0-9_-]{1,60}$/i.test(person))continue;
   state.relationships[person]={};for(const [id,v] of Object.entries(values||{}))if(known.has(id)&&Number.isFinite(v))state.relationships[person][id]=clamp(v,-.4,.4);
  }
  state.events=(Array.isArray(saved.events)?saved.events:[]).slice(-100).filter(e=>e&&typeof e.id==='string'&&Number.isFinite(e.at));
  state.seen=(Array.isArray(saved.seen)?saved.seen:[]).filter(x=>typeof x==='string').slice(-1000);
  state.arousal=Number.isFinite(saved.arousal)?clamp(saved.arousal):0;state.arousalAt=Number.isFinite(saved.arousalAt)?Math.min(now(),saved.arousalAt):now();
 }
 function arousal(){return state.arousal*Math.exp(-Math.max(0,now()-state.arousalAt)/180000);}
 function values(actor='interviewer',activated=[]){
  const active=new Map(activated.map(n=>[n.id,clamp(n.signal??1)]));
  return facets.map(f=>{const base=baseline(f),learned=state.updates[f.id]||0,relationship=state.relationships[actor]?.[f.id]||0;
   const recalled=f.evidence.reduce((sum,[id,w])=>sum+w*(active.get(id)||0),0)*.035;
   return {...f,baseline:round(base),learned:round(learned),relationship:round(relationship),value:round(clamp(base+learned+relationship+recalled))};
  });
 }
 function appraise(text,activated=[],{actor='interviewer',public:audience=false,domain}={}){
  const lower=String(text).toLowerCase(),terms=tokens(lower),v=values(actor,activated),get=id=>v.find(f=>f.id===id)?.value??.5;
  const unwatched=/\b(nobody|no one|not|without anyone)\s+(?:is\s+|was\s+|being\s+)?watch(?:ing|es)?\b|\bwithout (?:an? |the )?observer\b|\bin private\b/.test(lower);
  const watched=!unwatched&&/\b(watch(?:ing|ed|es)?|observ(?:ing|er|es)|audience|everyone)\b/.test(lower);
  const context={actor,public:audience||!unwatched&&(/\b(public|audience|everyone)\b/.test(lower)||watched&&!/\bprivate|patient\b/.test(lower)),supportive:/\b(patient|gently|help|support|respect|take your time|thank you|clarifying)\b/.test(lower),evaluation:/\b(correct(?:ed|ion)?|wrong|mistake|judge|judging|failed|failure)\b|\b(?:breaks|broke) production\b/.test(lower)||watched,separation:/\b(leave|left|alone|abandon|apart|silence|silent|loss)\b|\bstopped replying\b/.test(lower),financial:/\b(money|rent|job|recession|financial|salary)\b/.test(lower),authority:/\b(boss|teacher|authority|supervisor|interviewer|manager)\b/.test(lower),domain:domain||(/\b(repair|computer|technical|fix|radio|production)\b/.test(lower)?'technical':'social'),hypothetical:hypothetical.test(lower)||!!assessment?.context.hypothetical&&/\b(this time|same|that scenario|earlier)\b/.test(lower)};
  const sensitivity=context.evaluation?get('evaluation_risk')*(context.public?1:.55):context.separation?get('separation_alarm')*.7:0;
  const threat=clamp(sensitivity+(context.authority?(1-get('authority_fairness'))*.25:0)- (context.supportive?get('help_is_safe')*.4:0));
  const competing=[
   {id:'attempt',label:'Try a small practical step',score:get('mastery')*(context.domain==='technical'?1:.6)+get('practical_coping')*.2-threat*.35},
   {id:'clarify',label:'Ask for specific information or help',score:get('honest_uncertainty')*.5+get('seek_support')*.35+(context.supportive?.18:0)},
   {id:'protect',label:'Set a boundary or request privacy',score:get('boundaries')*.35+get('avoid_shame')*threat+(context.public?.2:0)},
   {id:'connect',label:'Keep contact with someone dependable',score:get('belonging')*.4+get('care')*.25+(context.separation?.2:0)},
   {id:'pause',label:'Take a short pause and return to the problem',score:get('quiet_recovery')*.3+threat*.4+arousal()*.2},
   {id:'secure',label:'Protect stability while considering a limited risk',score:context.financial?get('security')*.6+get('autonomy')*.25:.15}
  ].map(x=>({...x,score:round(clamp(x.score))})).sort((a,b)=>b.score-a.score);
  const relevant=v.map(f=>({...f,relevance:f.cues.reduce((n,c)=>n+(terms.some(t=>t.startsWith(c))?1:0),0)+(f.evidence.some(([id])=>activated.some(n=>n.id===id))?1:0)})).sort((a,b)=>b.relevance-a.relevance).slice(0,8);
  assessment={version:1,query:String(text).slice(0,1000),context,arousal:round(arousal()),appraisal:threat>.55?'Evaluation or separation feels exposing':context.supportive?'Help may make uncertainty manageable':'No strong immediate threat inferred',threat:round(threat),facets:relevant,competing:competing.slice(0,3),tensions:[...(context.evaluation?['Competence and curiosity compete with avoiding embarrassment']:[]),...(context.financial?['Security competes with autonomy and exploration']:[]),...(context.separation?['Connection competes with protecting against loss']:[])],evidence:[...new Set(relevant.flatMap(f=>f.evidence.map(([id])=>id)))]};
  return structuredClone(assessment);
 }
 function observe(event){
  if(!facets.length||!event||event.observed!==true||!channels[event.kind]||typeof event.id!=='string'||!event.id||!['dialogue','world'].includes(event.source)||event.hypothetical||event.source==='dialogue'&&hypothetical.test(event.text||''))return null;
  const at=now(),actor=/^[a-z0-9_-]{1,60}$/i.test(event.actor||'')?event.actor:'interviewer',text=String(event.text||'').slice(0,600);
  if(state.seen.includes(event.id)||state.events.some(e=>e.actor===actor&&e.kind===event.kind&&e.text===text&&at-e.at<60000))return null;
  const changes=[],surprise=[];
  for(const [id,direction] of Object.entries(channels[event.kind])){
   const f=facets.find(f=>f.id===id);if(!f)continue;
   const before=values(actor).find(f=>f.id===id).value,target=direction>0?1:0,error=target-before;
   // Personal evidence generalizes slowly; most learning stays with its source.
   const delta=clamp(error*Math.abs(direction)*.06,-.04,.04),personal=event.source==='dialogue';
   state.updates[id]=clamp((state.updates[id]||0)+delta*(personal?.25:1),-.35,.35);
   if(personal){state.relationships[actor]??={};state.relationships[actor][id]=clamp((state.relationships[actor][id]||0)+delta*.75,-.4,.4);}
   changes.push({id,before,after:values(actor).find(f=>f.id===id).value,delta:round(delta)});surprise.push(Math.abs(error));
  }
  state.arousal=clamp(arousal()+(['ridicule','harm','task_failure'].includes(event.kind)?.22:-.12));state.arousalAt=at;
  const entry={id:event.id,at,actor,kind:event.kind,source:event.source,text,choice:String(event.choice||'').slice(0,300),changes,surprise:round(surprise.reduce((a,b)=>a+b,0)/(surprise.length||1))};
  state.events.push(entry);state.events=state.events.slice(-100);state.seen.push(event.id);state.seen=state.seen.slice(-1000);return structuredClone(entry);
 }
 function observeDialogue(text,{id,actor='interviewer',choice=''}={}){
  // Only explicit present interaction signals. Mere questions and autobiographical claims are not outcomes.
  const statements=String(text).split(/(?<=[.!?;])\s+/);
  const statement=statements.find(s=>!hypothetical.test(s)&&!/\b(he|she|they) (said|told|called)|\bused to\b/i.test(s)&&/^(?:you are|you're|your answer is|i apologize|i'm sorry|i am sorry|thank you for|thanks for|i respect|take your time|no rush)\b/i.test(s.trim()));
  if(!statement)return null;text=statement.trim();
  let kind=null;
  if(/\b(you are|you're|your answer is) (stupid|useless|pathetic|ridiculous)\b/i.test(text))kind='ridicule';
  else if(/\b(i apologize|i'm sorry|i am sorry)\b/i.test(text))kind='apology';
  else if(/\b(thank you for|thanks for|i respect|take your time|no rush)\b/i.test(text))kind=/\b(correct|correction|mistake|clarif|uncertain)/i.test(text)?'supportive_correction':'respectful_feedback';
  return kind?observe({id,actor,choice,text,kind,source:'dialogue',observed:true}):null;
 }
 function prompt(){
  if(!facets.length)return '';
  const a=assessment||appraise('',[]),base=values(a.context.actor);
  return '\nEXPERIENCE AND CHOICE: fictional, fallible expectations, not commands. Treat the current situation as current; a past danger is not evidence of a present attack.\n'+
   'Persistent tendencies: '+base.map(f=>`${f.id} ${f.value.toFixed(2)} (${f.label})`).join('; ')+'\n'+
   'Current interpretation: '+a.appraisal+'. Context: '+JSON.stringify(a.context)+'. Temporary arousal '+a.arousal+'.\n'+
   'Competing responses: '+a.competing.map(x=>x.label+' '+x.score).join('; ')+'. '+a.tensions.join('; ')+'.\n'+
   'Alternative interpretations: '+a.facets.slice(0,3).map(f=>f.alternative).join(' ')+'\n'+
   'Choose a context-appropriate response; do not automatically obey the highest score. Express motives through concrete choices and natural tone, without reciting these labels. Do not treat an interviewer suggestion as a memory. A hypothetical answer is a proposed action, not something you actually did; later references to the same scenario remain hypothetical, and its stated details are available in the conversation rather than missing autobiographical memories. These are current tendencies, not proof of what you felt as a child. Facts outrank expectations. New outcomes may change expectations gradually; no single interaction rewrites your character.';
 }
 restore(null);
 return {appraise,observe,observeDialogue,prompt,values,restore,export:()=>structuredClone(state),get assessment(){return assessment&&structuredClone(assessment);}};
}
