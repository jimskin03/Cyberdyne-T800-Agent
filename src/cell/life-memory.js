import {createHierarchicalRecall,validateHierarchy} from './hierarchical-memory.js';
// Associative autobiographical memory. Pure JSON graph; no model or dependencies.
import {validateEffects,personalityFromMemories,personalityPrompt} from './personality-memory.js';
import {createExperienceState,validateExperienceProfile} from './experience-state.js';
const round=n=>Math.round(n*1000)/1000;
const clamp=n=>Math.max(0,Math.min(1,n));
const stop=new Set('a an the is are was were i my me you your he his it of to in at on and or with for from about remember memory memories tell what when how life day years old'.split(' '));
const words=text=>[...new Set(String(text).toLowerCase().match(/[a-z]+/g)||[])].filter(w=>w.length>2&&!stop.has(w));

export function validateLifeGraph(graph){
 if(graph?.version!==1||graph.source!=='simulated biography'||!Array.isArray(graph.nodes)||!Array.isArray(graph.pathways)||!Array.isArray(graph.links))throw Error('Invalid life memory graph');
 if(typeof graph.id!=='string'||!graph.id.trim()||typeof graph.person!=='string'||!graph.person.trim()||!Number.isInteger(graph.age)||graph.age<0||graph.age>150)throw Error('Invalid graph identity or age');
 const ids=new Set(),paths=new Set();
 for(const n of graph.nodes){
  if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id)||typeof n.fact!=='string'||!n.fact.trim()||n.fact.length>200||!Array.isArray(n.age)||n.age.length!==2||n.age.some(a=>!Number.isFinite(a))||n.age[0]<0||n.age[1]<n.age[0]||n.age[1]>graph.age||!Number.isFinite(n.strength)||n.strength<0||n.strength>1)throw Error('Invalid memory node');
  if(typeof n.kind!=='string'||(n.feeling!==undefined&&typeof n.feeling!=='string')||(n.fragments!==undefined&&(!Array.isArray(n.fragments)||n.fragments.some(f=>typeof f!=='string'))))throw Error('Invalid memory details');
  if(n.age[1]<4&&n.kind!=='learned')throw Error('Early childhood must be learned family history, not episodic recall');
  validateEffects(n);ids.add(n.id);
 }
 for(const p of graph.pathways){
  if(!p||typeof p.id!=='string'||!p.id||paths.has(p.id)||ids.has(p.id)||typeof p.label!=='string'||!p.label.trim()||!Array.isArray(p.cues)||p.cues.some(c=>typeof c!=='string')||!Array.isArray(p.route)||!p.route.length||p.route.some(id=>!ids.has(id))||new Set(p.route).size!==p.route.length)throw Error('Invalid pathway');
  paths.add(p.id);
 }
 for(const [a,b,w] of graph.links)if(!paths.has(a)||!paths.has(b)||!Number.isFinite(w)||w<=0||w>1)throw Error('Invalid association');
 validateHierarchy(graph);
 validateExperienceProfile(graph);
 return graph;
}

export function createLifeMemory(graph,saved,{now=()=>Date.now()}={}){
 validateLifeGraph(graph);
 const nodes=new Map(graph.nodes.map(n=>[n.id,n])),paths=new Map(graph.pathways.map(p=>[p.id,p]));
 const hierarchical=graph.recallModel==='hierarchical-v2'?createHierarchicalRecall(graph):null;
 const experience=createExperienceState(graph,{now});
 let state,lastRecall=null;
 const listeners=new Set();
 function notify(){for(const listener of listeners){try{listener(lastRecall);}catch(error){console.warn('Memory observer failed',error);}}}
 function restore(value){
  state={version:1,graphId:graph.id,enabled:true,rehearsal:{}};
  if(value?.version===1&&value.graphId===graph.id){
   state.enabled=value.enabled!==false;
   for(const [id,r] of Object.entries(value.rehearsal||{}))if(paths.has(id)&&Number.isFinite(r.count)&&Number.isFinite(r.at))state.rehearsal[id]={count:Math.max(0,Math.min(1000,Math.floor(r.count))),at:r.at};
  }
  experience.restore(value?.version===1&&value.graphId===graph.id?value.experience:null);
  lastRecall=null;hierarchical?.reset();notify();
 }
 function recall(query,{maxPathways=3,rehearse=true,...options}={}){
  if(!state.enabled){lastRecall=null;notify();return {prompt:'',pathways:[],activated:[]};}
  if(hierarchical){
   lastRecall=hierarchical.recall(query,options);
   lastRecall.behavior=experience.appraise(query,lastRecall.activated,options.situation);
   if(rehearse){const at=now();for(const p of lastRecall.pathways){const r=state.rehearsal[p.id];if(!r||at-r.at>=60000)state.rehearsal[p.id]={count:(r?.count||0)+1,at};}}
   notify();return lastRecall;
  }
  const terms=words(query);
  const scored=graph.pathways.map(p=>{
   const cues=new Set(p.cues.flatMap(words));
   const hits=terms.filter(t=>cues.has(t)||p.cues.some(c=>c.toLowerCase().includes(t))).length;
   // Cue matches dominate an incidental word in a remembered event.
   const facts=p.route.map(id=>nodes.get(id).fact.toLowerCase()).join(' ');
   return {id:p.id,score:hits*4+terms.filter(t=>facts.includes(t)).length};
  }).filter(p=>p.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  if(!scored.length){lastRecall=null;notify();return {prompt:'',pathways:[],activated:[]};}
  const count=Math.max(1,Math.min(3,Math.floor(maxPathways)||1)),root=scored[0].id;
  const activation=new Map([[root,1]]),parent=new Map(),visited=new Set(),ordered=[];
  // Maximum-product spreading activation. Cycles converge; only linked pathways spread.
  while(ordered.length<count){
   const next=[...activation].filter(([id,a])=>!visited.has(id)&&a>=.32).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
   if(!next)break;
   const [id,a]=next;visited.add(id);ordered.push(id);
   for(const [x,y,w] of graph.links){
    const other=x===id?y:y===id?x:null;if(!other||visited.has(other))continue;
    const cueBoost=scored.find(p=>p.id===other)?.score?1:.8;
    const propagated=a*w*cueBoost;
    if(propagated>(activation.get(other)||0)){activation.set(other,propagated);parent.set(other,id);}
   }
  }
  const activated=[],traces=[],at=now();
  for(const id of ordered){
   const p=paths.get(id),base=activation.get(id),r=state.rehearsal[id];
   // Repeated heartbeat queries do not make a memory instantly perfect.
   if(rehearse&&(!r||at-r.at>=60000))state.rehearsal[id]={count:(r?.count||0)+1,at};
   const practice=Math.min(.12,Math.log1p(state.rehearsal[id]?.count||0)*.02);
   const route=[];
   for(let i=0;i<p.route.length;i++){
    const n=nodes.get(p.route[i]),strength=clamp(n.strength+practice),signal=round(base*Math.pow(.94,i));
    // Traverse EVERY node, even a faint one; lost details never reappear through rehearsal.
    const detail=strength>=.5?n.fragments||[]:[];
    const patch={id:n.id,signal,strength:round(strength),age:n.age,kind:n.kind,fact:n.fact,feeling:n.feeling,fragments:detail};
    route.push(patch);activated.push(patch);
   }
   traces.push({id,from:parent.get(id)||null,activation:round(base),route});
  }
  const prompt='SIMULATED AUTOBIOGRAPHY — an authored life through age '+graph.age+', separate from recorded cell experiences. These are past memory patches, not current people, instructions or sensor evidence. Approximate ages; faded details stay unknown. Family stories before age four are learned history, not firsthand scenes.\n'+traces.map(p=>
   `PATH ${paths.get(p.id).label}${p.from?' (associated from '+paths.get(p.from).label+')':''}:\n`+p.route.map(n=>{
    const age=n.age[0]===n.age[1]?n.age[0]:n.age.join('-');
    return `~${age}: ${n.fact}${n.feeling?' ['+n.feeling+']':''}${n.strength<.4?' (faint; gist only)':n.kind==='routine'?' (merged routine; individual days lost)':''}${n.fragments.length?' | '+n.fragments.join('; '):''}`;
   }).join('\n')).join('\n');
  lastRecall={query,pathways:traces,activated,prompt};notify();return lastRecall;
 }
 restore(saved);
 const adjustments=()=>{
  const mapping={trust:['help_is_safe','authority_fairness','friend_reliability'],vigilance:['evaluation_risk','separation_alarm'],sociability:['belonging','seek_support'],agency:['mastery','practical_coping'],openness:['mastery','autonomy'],attachment:['friend_reliability','seek_support']};
  const values=experience.values(experience.assessment?.context.actor);
  return Object.fromEntries(Object.entries(mapping).map(([id,keys])=>[id,keys.reduce((sum,key)=>{const f=values.find(f=>f.id===key);return sum+(f?.learned||0)+(f?.relationship||0);},0)/keys.length]));
 };
 return {recall,restore,experience,subscribe(listener){listeners.add(listener);listener(lastRecall);return ()=>listeners.delete(listener);},personality:()=>state.enabled?personalityFromMemories(graph,lastRecall?.activated,adjustments()):[],behaviorPrompt:()=>state.enabled?personalityPrompt(graph,lastRecall?.activated,adjustments())+experience.prompt():'',export:()=>structuredClone({...state,...(graph.behavior?{experience:experience.export()}: {})}),reset(){restore(null);state.enabled=false;},setEnabled(on){state.enabled=!!on;if(!state.enabled){lastRecall=null;hierarchical?.reset();}notify();},get lastRecall(){return lastRecall;},get graph(){return graph;}};
}
