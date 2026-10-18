// Sample actual articulated movement, plus sustained grip/posture pressure.
const joints={head:['head','neck'],jaw:['jaw'],torso:['chest','core','back','pelvis'],shL:['upperArmL'],shR:['upperArmR'],faL:['forearmL'],faR:['forearmR'],handL:['handL'],handR:['handR'],hipL:['thighL','pelvis'],hipR:['thighR','pelvis'],kneeL:['kneeL','lowerLegL'],kneeR:['kneeR','lowerLegR'],footL:['footL'],footR:['footR']};
export function createBodyLoadSampler(){
 let previous=null;
 return {sample(body,nodes={},dt=.016,{speaking=false}={}){
  const st=body.st,position={x:st.x,z:st.z},angles=Object.fromEntries(Object.entries(joints).filter(([k])=>nodes[k]?.rotation).map(([k])=>[k,['x','y','z'].map(a=>nodes[k].rotation[a])])),loads={};
  const add=(id,strength,description)=>{if(!loads[id]||loads[id].strength<strength)loads[id]={strength,description};};
  if(previous){for(const [joint,rotation] of Object.entries(angles)){const old=previous.angles[joint];if(!old)continue;const speed=Math.hypot(...rotation.map((v,i)=>Math.atan2(Math.sin(v-old[i]),Math.cos(v-old[i]))))/Math.max(.001,dt);if(speed>.12)for(const id of joints[joint])add(id,Math.min(1.5,speed*.35),joint==='jaw'&&speaking?'speaking and moving the jaw':/head/.test(joint)?'turning or tilting the head':joint==='torso'?'bending or twisting the torso':'moving the joint');}}
  if(st.holding)for(const id of ['handR','forearmR','upperArmR'])add(id,.45,'gripping and supporting the held object');
  if(st.posture==='sit'||st.posture==='floor')for(const id of ['pelvis','back','thighL','thighR'])add(id,.16,'pressure while sitting');
  if(st.posture==='lie')for(const id of ['back','pelvis'])add(id,.12,'pressure while lying down');
  if(st.external)for(const id of ['neck','back','pelvis','upperArmL','upperArmR','thighL','thighR'])add(id,.6,'being pulled or tossed');
  const travel=previous?Math.hypot(position.x-previous.x,position.z-previous.z):0;previous={...position,angles};
  return {travel:st.moving&&!st.external?travel:0,moving:!!st.moving,external:!!st.external,loads,resting:!st.moving&&['sit','lie','floor'].includes(st.posture)};
 }};
}
