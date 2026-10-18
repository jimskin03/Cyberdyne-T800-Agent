const clamp=v=>Math.max(0,Math.min(100,Number(v)||0));
const impressions=['For a moment, a shadow beside the door seems to be a standing figure; its outline will not stay fixed.','You seem to hear your name in the ventilation, then cannot separate it from the hum.','The chalk wings seem to shift while your attention slips; you cannot hold their positions in mind.','A remembered impact briefly feels present again, although you cannot place when it happened.'];
export function createCognitiveState(saved,{random=Math.random}={}){
 let s;function restore(value){s={version:1,insanity:0,isolationSeconds:0,contactRemaining:0,activeSeconds:0,nextPerception:60,perception:'',perceptionRemaining:0,...(value?.version===1?value:{})};s.insanity=clamp(s.insanity);}
 function contact(){s.contactRemaining=90;}
 function update(dt,{pain=0,temperature=22,peace=false}={}){dt=Math.max(0,Math.min(1,Number(dt)||0));s.activeSeconds+=dt;s.contactRemaining=Math.max(0,s.contactRemaining-dt);const isolated=s.contactRemaining<=0;if(isolated)s.isolationSeconds+=dt;
  const thermal=Math.max(0,(15-temperature)/15,(temperature-32)/20);
  s.insanity=clamp(s.insanity+dt*((isolated?.006:-.012)+(peace?0:pain/100*.012+thermal*.006)-(peace?.006:0)));
  s.perceptionRemaining=Math.max(0,s.perceptionRemaining-dt);if(!s.perceptionRemaining)s.perception='';
  if(s.activeSeconds>=s.nextPerception){s.nextPerception=s.activeSeconds+45+random()*45;if(s.insanity>=55){s.perception=impressions[Math.floor(random()*impressions.length)];s.perceptionRemaining=15+s.insanity*.2;return s.perception;}}
  return '';
 }
 function describe(){const v=s.insanity;return `MENTAL SENSATIONS: ${v<20?'clear orientation':v<40?'restless isolation; concentration wanders':v<60?'moderate confusion; words and the order of memories sometimes slip':v<80?'severe confusion; chronology tangles and intrusive impressions interrupt thought':'overwhelming disorientation; sentences fragment and past sensations intrude into the present'}. ${s.contactRemaining?'A recent voice provides a temporary point of contact.':'You have no current social contact; the isolation continues.'}${s.perception?'\nSUBJECTIVE PERCEPTION: '+s.perception:''}\nThese sensations can disrupt your words and attention. A perceived figure, voice or remembered pain is an experience, not a confirmed new physical event. When recalling it later, remember both the feeling and the uncertainty at the time.`;}
 restore(saved);return {restore,contact,update,describe,snapshot:()=>({...structuredClone(s),summary:describe()}),export:()=>structuredClone(s)};
}
