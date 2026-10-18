// Authored mechanical body sensations. Pure state: no rendering, model calls or timers.
export const PAIN_LEVELS=['slight','mild','moderate','severe','overwhelming'];
export const REGIONS={head:'head',jaw:'jaw',neck:'neck',chest:'chest',core:'abdomen / power core',back:'back',pelvis:'pelvis',upperArmL:'left upper arm',upperArmR:'right upper arm',forearmL:'left forearm',forearmR:'right forearm',handL:'left hand',handR:'right hand',thighL:'left thigh',thighR:'right thigh',kneeL:'left knee',kneeR:'right knee',lowerLegL:'left lower leg',lowerLegR:'right lower leg',footL:'left foot',footR:'right foot',body:'whole body, location unspecified'};
const aliases={skull:'head',elbowL:'forearmL',elbowR:'forearmR',shL:'upperArmL',shR:'upperArmR',hipL:'thighL',hipR:'thighR',torso:'chest'};
const loadBearing=id=>/thigh|knee|lowerLeg|foot|pelvis|back|body/.test(id);
const arm=id=>/upperArm|forearm|hand/.test(id);
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
export const painLevel=value=>value<.5?'none':PAIN_LEVELS[Math.min(4,Math.floor((value-0.5)/20))];
const empty=()=>({acute:0,injury:0,temp:22,heat:0,wet:0,cause:'',age:0,motion:0,stepPeak:0,painfulSteps:0,peakInjury:0,healing:false,activity:'',activityPeak:0,activitySerial:0});
export function createNervousSystem(saved){
 let regions={},distance=0,steps=0,environment={temp:22,wet:0},motion=false;
 function restore(value,legacy={}){
  regions=Object.fromEntries(Object.keys(REGIONS).map(id=>[id,empty()]));distance=0;steps=0;
  if(value?.version===1){for(const id of Object.keys(regions)){const r=value.regions?.[id];if(!r)continue;for(const k of ['acute','injury','heat','wet','motion','stepPeak','peakInjury','activityPeak'])regions[id][k]=clamp(r[k]);regions[id].temp=clamp(r.temp,-40,150);regions[id].age=Math.max(0,Number(r.age)||0);regions[id].painfulSteps=Math.max(0,Number(r.painfulSteps)||0);regions[id].cause=String(r.cause||'').slice(0,100);regions[id].activity=String(r.activity||'').slice(0,100);regions[id].activitySerial=Math.max(0,Number(r.activitySerial)||0);regions[id].healing=!!r.healing;}steps=Math.max(0,Number(value.steps)||0);}
  else if(legacy.pain||legacy.soreness){regions.body.acute=clamp(legacy.pain);regions.body.injury=clamp(legacy.soreness||legacy.pain*.4);regions.body.peakInjury=regions.body.injury;regions.body.cause='previously recorded pain; original receptor location unavailable';}
 }
 function hit(part,tool='impact',amount=28){
  const id=REGIONS[part]?part:aliases[part]||'body',r=regions[id],strength=clamp(amount);
  r.acute=clamp(r.acute+strength);r.injury=clamp(r.injury+strength*(tool==='feather'?.02:tool==='squirt'?.08:tool==='torch'?.8:.55));r.age=0;
  r.cause={torch:'burning heat',drill:'deep grinding pain',prod:'electrical stinging',mallet:'deep bruised actuator ache',magnet:'pulling joint pain',feather:'skin-sensor irritation',squirt:'cold contact sting',impact:'impact ache',strain:'muscle-like actuator strain'}[tool]||'impact ache';
  if(tool==='squirt'){r.wet=1;r.temp=Math.max(5,r.temp-5);}
  if(tool==='torch')r.heat=clamp(r.heat+strength*1.4);r.peakInjury=Math.max(r.peakInjury,r.injury);r.healing=false;
  // Knee/foot contact also loads the adjacent lower-leg actuators.
  if(/^(knee|foot)[LR]$/.test(id)){const adjacent=regions['lowerLeg'+id.at(-1)];adjacent.injury=clamp(adjacent.injury+strength*.18);adjacent.acute=clamp(adjacent.acute+strength*.12);adjacent.cause='muscle-like actuator ache';adjacent.peakInjury=Math.max(adjacent.peakInjury,adjacent.injury);}
  return id;
 }
 function value(id){const r=regions[id],cold=clamp((18-r.temp)/14,0,1),hot=clamp((r.temp-38)/35,0,1);return clamp(r.acute+r.injury*(.55+cold*.65)+r.motion+cold*(5+Math.max(environment.wet,r.wet)*12)+hot*55);}
 function update(dt,{temperature=22,wet=0,moving=false,travel=0,external=false,resting=false,usingArms=false,active=false,loads={}}={}){
  dt=Math.max(0,Math.min(1,Number(dt)||0));environment={temp:temperature,wet:clamp(wet,0,1)};motion=!!moving&&!external;
  let count=0;if(motion&&travel>0&&travel<2){distance+=travel;count=Math.floor(distance/.55);distance-=count*.55;steps+=count;}
  for(const [id,r] of Object.entries(regions)){
   r.age+=dt;r.wet=Math.max(0,r.wet-dt/180);r.heat*=Math.exp(-dt/35);r.temp+=(temperature+r.heat-r.temp)*(1-Math.exp(-dt*(.035+Math.max(environment.wet,r.wet)*.065)));
   const cold=clamp((18-r.temp)/14,0,1),hot=clamp((r.temp-38)/35,0,1),comfort=Math.max(.15,1-cold*.75-hot*.8);
   r.acute=Math.max(0,r.acute-dt*(active&&r.age<3?0:.18)*comfort);
   const before=r.injury;r.injury=Math.max(0,r.injury-dt*(resting?.018:.008)*comfort);
   if(cold>.75||hot>.2){r.injury=clamp(r.injury+dt*(cold>.75?.006:hot*.03));if(!r.cause)r.cause=hot?'thermal burning':'cold-stiffened actuator ache';r.peakInjury=Math.max(r.peakInjury,r.injury);}
   r.healing=r.injury<before;r.motion*=Math.exp(-dt/1.6);
   if((count&&loadBearing(id))||(usingArms&&arm(id)))r.motion=clamp(r.motion+(r.injury+r.acute)*.22*(count||dt));
   const load=loads[id];if(load&&r.injury+r.acute>=.5){r.motion=clamp(r.motion+(r.injury+r.acute)*.55*clamp(load.strength,0,2)*dt);r.activity=load.description;r.activitySerial++;r.activityPeak=Math.max(r.activityPeak,value(id));}
   if(count&&loadBearing(id)&&value(id)>=.5){r.painfulSteps+=count;r.stepPeak=Math.max(r.stepPeak,value(id));}
  }
 }
 function rows(){return Object.keys(regions).map(id=>{const r=regions[id],pain=value(id);return {id,name:REGIONS[id],pain,level:painLevel(pain),temperature:r.temp,injury:r.injury,acute:r.acute,recovery:r.peakInjury?clamp(100*(1-r.injury/r.peakInjury)):100,healing:r.healing,cause:r.cause,painfulSteps:r.painfulSteps,stepLevel:painLevel(r.stepPeak),lingering:r.injury>=.5,activity:r.activity,activityLevel:painLevel(r.activityPeak)};});}
 function describe(){
  const affected=rows().filter(r=>r.pain>=.5||r.painfulSteps);
  return 'BODY SENSATIONS: '+(affected.length?affected.map(r=>`${r.name}: ${r.lingering?'lingering ':''}${r.cause||'temperature discomfort'}, ${r.level}${r.painfulSteps?`; each of ${r.painfulSteps} weight-bearing steps since the previous reading hurt (${r.stepLevel})`:motion&&loadBearing(r.id)&&r.pain>=.5?'; each step hurts':''}${r.activity?`; ${r.activity} aggravated it (${r.activityLevel})`:''}; ${r.temperature<18?'cold and stiff':r.temperature>38?'hot, burning':'temperature comfortable'}; ${r.healing?'slowly healing':'recovery slowed or ongoing irritation'}.`).join('\n'):'No pain registered. Body temperature is comfortable.')+'\nTHERMAL SENSATION: '+(environment.temp<15?'cold room; '+(environment.wet>.2?'wet surfaces intensify the chill and slow recovery.':'cold stiffens injured joints and slows recovery.'):environment.temp>30?'hot room; heat aggravates damaged regions.':'room air is comfortable; damaged regions can still ache.');
 }
 function acknowledge(reading){for(const [id,r] of Object.entries(regions)){const old=reading?.regions?.[id];r.painfulSteps=Math.max(0,r.painfulSteps-(old?.painfulSteps??r.painfulSteps));if(!r.painfulSteps)r.stepPeak=0;if(!old||r.activitySerial===old.activitySerial){r.activity='';r.activityPeak=0;}}}
 function snapshot(){return {summary:describe(),level:painLevel(total()),regions:rows().filter(r=>r.pain>=.5||r.painfulSteps).map(({name,level,temperature,painfulSteps,cause,lingering})=>({name,level,temperature:Math.round(temperature*10)/10,painfulSteps,cause,lingering})),roomTemperature:environment.temp,wetness:environment.wet,steps};}
 const total=()=>Math.max(0,...Object.keys(regions).map(value));
 restore(saved);
 return {restore,hit,update,rows,describe,snapshot,acknowledge,total,get soreness(){return Math.max(0,...Object.values(regions).map(r=>r.injury));},export:()=>({version:1,regions:structuredClone(regions),steps})};
}
