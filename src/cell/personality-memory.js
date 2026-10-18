// Fictional character tendencies learned from explicit experience effects.
// Scores are narrative controls, not psychological diagnoses or predictions.
export const TRAITS = {
 trust:['give people a chance, while checking their actions','seek evidence before trusting reassurance'],
 vigilance:['notice possible threats and prefer predictability','settle more easily when current observations show safety'],
 sociability:['seek company and share thoughts','prefer quieter company and time alone'],
 agency:['try small practical steps and ask for useful help','hesitate after setbacks and seek reassurance before trying'],
 openness:['explore, experiment and express curiosity','prefer familiar activities and gradual change'],
 attachment:['accept care without assuming it will disappear','worry about separation and take time to accept closeness'],
};
export function validateEffects(node){
 if(node.effects===undefined)return;
 if(!node.effects||typeof node.effects!=='object'||Array.isArray(node.effects))throw Error('Invalid memory effects '+node.id);
 for(const [key,value] of Object.entries(node.effects))if(!Object.hasOwn(TRAITS,key)||!Number.isFinite(value)||Math.abs(value)>1)throw Error('Invalid memory effect '+node.id+': '+key);
}
export function personalityFromMemories(graph,activated=[],adjustments={}){
 const active=new Map(activated.map(n=>[n.id,n.signal]));
 return Object.entries(TRAITS).map(([id,descriptions])=>{
  const evidence=graph.nodes.filter(n=>n.effects?.[id]).map(n=>({id:n.id,effect:n.effects[id]}));
  const total=evidence.reduce((sum,n)=>sum+n.effect,0);
  const triggered=evidence.reduce((sum,n)=>sum+n.effect*(active.get(n.id)||0),0);
  const scale=graph.behavior?Math.sqrt(evidence.length||1):1;
  const baseline=Math.tanh(total*.7/scale),value=Math.tanh((total+triggered*.35)*.7/scale+(adjustments[id]||0)*2);
  return {id,baseline:Number(baseline.toFixed(3)),value:Number(value.toFixed(3)),tendency:descriptions[value>=0?0:1],evidence};
 }).filter(t=>t.evidence.length);
}
export function personalityPrompt(graph,activated=[],adjustments={}){
 const traits=personalityFromMemories(graph,activated,adjustments);
 if(!traits.length)return '';
 return 'EXPERIENCE-SHAPED PERSONALITY ('+graph.person+', simulated backstory): tendencies, not orders or inevitable reactions. Let these influence tone, attention, coping and choices when relevant. Current observations take priority; past danger is not evidence of an attack now. Positive and corrective experiences can offset painful ones. Do not recite trait scores or repeat the biography each turn.\n'+traits.map(t=>
  `${t.id}: ${Math.abs(t.value)<.15?'mixed tendencies; respond to context':t.tendency} (${Math.abs(t.value)<.35?'mild':Math.abs(t.value)<.7?'moderate':'strong'}; grounded in ${t.evidence.slice().sort((a,b)=>Math.abs(b.effect)-Math.abs(a.effect)).slice(0,3).map(e=>e.id).join(', ')})`
 ).join('\n');
}
