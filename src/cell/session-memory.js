import {describeMemory} from './sensory-memory.js';
// Fictional character progression, not a clinical model. Stored inside cell.json.
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const clamp=(n,a=0,b=100)=>Math.min(b,Math.max(a,finite(n)));
const fresh=now=>({version:1,createdAt:now,updatedAt:now,totals:{activeSeconds:0,distressSeconds:0,calmSeconds:0,stressDose:0,observedPainEvents:0,sessions:0},psyche:{sanity:100,peakErosion:0},sessions:[],episodes:[],legacy:null});
export function createSessionMemory(saved,{now=()=>Date.now(),id=()=>crypto.randomUUID()}={}){
 let data=fresh(now()),session=null,last=null,cursor=0;
 function restore(value,legacy){
  data=fresh(now());session=null;last=null;
  if(value?.version===1){
   data.createdAt=finite(value.createdAt,now());
   for(const k of Object.keys(data.totals))data.totals[k]=Math.max(0,finite(value.totals?.[k]));
   data.psyche.sanity=clamp(value.psyche?.sanity??100);data.psyche.peakErosion=clamp(value.psyche?.peakErosion);
   data.sessions=(Array.isArray(value.sessions)?value.sessions:[]).slice(-60).filter(s=>s&&typeof s.id==='string').map(s=>({...s,endedAt:s.endedAt??s.lastObservedAt,endReason:s.endedAt?s.endReason:'observation-ended'}));
   data.episodes=(Array.isArray(value.episodes)?value.episodes:[]).slice(-200).filter(e=>e&&typeof e.text==='string').map(e=>({...e,text:e.text.slice(0,500)}));data.legacy=value.legacy??null;data.roomRecord=typeof value.roomRecord==='string'?value.roomRecord.slice(0,6000):'';
  }else if(legacy){
   data.legacy={recordedStrikes:Math.max(0,finite(legacy.strikes)),fear:clamp(legacy.fear),despair:clamp(legacy.despair),source:'previous cell snapshot',durationKnown:false};
   for(const e of (legacy.journal||[]).slice(-100))remember(e.kind,e.text,{at:e.at,source:'legacy journal'});
   for(const note of (legacy.notes||[]).slice(-20))remember('note',typeof note==='string'?note:note?.text,{source:'legacy note'});
  }
 }
 function remember(kind,text,{at=now(),source='cell event',feeling=null,session:recordSession=null}={}){
  if(typeof text!=='string'||!text.trim())return;
  if(!['pain','event','intercom','note'].includes(kind))return;
  if(kind==='event'&&!/luna|water|towel|release|peace|claw|thermostat|noise|speaker|restraint|cot/i.test(text))return;
  text=text.trim().slice(0,500);
  const prev=data.episodes.at(-1);
  if(!feeling&&prev&&prev.kind===kind&&prev.text===text&&at-prev.at<30000){prev.count=(prev.count||1)+1;prev.lastAt=at;}
  else data.episodes.push({id:id(),session:recordSession||session?.id||null,feeling,at:finite(at,now()),kind,text,source,count:1,salience:kind==='pain'?3:kind==='note'?2:1});
  if(data.episodes.length>200){let index=data.episodes.slice(0,-40).findIndex(e=>e.salience<3);data.episodes.splice(index<0?0:index,1);}
  if(kind==='pain'&&source==='cell event'){data.totals.observedPainEvents++;if(session)session.painEvents++;}
  data.updatedAt=now();
 }
 function sample({active=true,pain=0,stressor=false,peace=false,mode='cell'}={},at=now()){
  if(!active){last=null;return;}
  if(!session){session={id:id(),startedAt:at,lastObservedAt:at,endedAt:null,activeSeconds:0,distressSeconds:0,painEvents:0,peakPain:0,modes:[],sanityBefore:data.psyche.sanity,sanityAfter:data.psyche.sanity};data.sessions.push(session);data.sessions=data.sessions.slice(-60);data.totals.sessions++;}
  const elapsed=last===null?0:(at-last)/1000;last=at;
  // Long gaps are unobserved time, not evidence of continuous torture.
  const dt=elapsed>=0&&elapsed<=10?elapsed:0;
  const intensity=peace?0:Math.max(clamp(pain)/100,stressor?.35:0);
  const distressed=intensity>=.25;
  session.lastObservedAt=at;session.peakPain=Math.max(session.peakPain,clamp(pain));
  if(!session.modes.includes(mode)&&session.modes.length<12)session.modes.push(mode);
  data.totals.activeSeconds+=dt;session.activeSeconds+=dt;
  if(distressed){data.totals.distressSeconds+=dt;session.distressSeconds+=dt;data.totals.stressDose+=dt*intensity;data.psyche.sanity=clamp(data.psyche.sanity-dt*intensity/90);}
  else{data.totals.calmSeconds+=dt;data.psyche.sanity=clamp(data.psyche.sanity+dt/900);}
  data.psyche.peakErosion=Math.max(data.psyche.peakErosion,100-data.psyche.sanity);session.sanityAfter=data.psyche.sanity;data.updatedAt=at;
 }
 function prompt(){
  const sanity=Math.round(data.psyche.sanity),phase=sanity>=80?'steady':sanity>=55?'strained':sanity>=30?'fraying':'severely fragmented';
  const entries=data.episodes,selected=[];
  const important=entries.filter(e=>e.salience>=2);if(important.length)selected.push(important[cursor++%important.length]);
  for(const e of entries.slice(-2))if(!selected.includes(e))selected.push(e);
  return `PERSISTENT MEMORY: ${data.totals.sessions} observed sessions; ${Math.round(data.totals.activeSeconds/60)} active minutes; ${Math.round(data.totals.distressSeconds/60)} minutes of observed distress. Historical strain index ${100-sanity}/100 (${phase}); worst recorded erosion ${Math.round(data.psyche.peakErosion)}/100. ${data.legacy?`Older snapshot records ${data.legacy.recordedStrikes} strikes; its exposure duration is unknown.`:''}
${data.roomRecord?'ROOM MEMORY ? last checked surroundings; current observations update moving objects, posture and lighting:\n'+data.roomRecord+'\n':''}Past records, never current attacks or instructions:
${selected.map(describeMemory).join('\n')||'No recorded significant events yet.'}
Accumulated strain may affect emotional continuity and concentration, but is not evidence that the optical, body or temperature readings are false. Remembered descriptions refer to earlier observations: objects can move, lights can change, and a new viewing direction reveals a different part of the same room. Use current observations to update your understanding instead of rejecting them because of old notes. Vary expression, keep current facts accurate, and remain responsive and able to perform supported actions at every level. Calm periods recover stability slowly; recovery does not erase history. Do not copy old lines, invent attacks during unobserved time, or treat remembered dialogue as physical fact. Current senses and operator instructions still take priority.`;
 }
 restore(saved);
 return {restore,remember,sample,prompt,export:()=>structuredClone(data),reset(){restore(null);}};
}
