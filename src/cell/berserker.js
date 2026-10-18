import {createWindowsRobotVoice} from '../railway-windows-voice.js';
import {createSiBotActor} from '../sibot-actor.js';
import {createSiBotController} from '../sibot-controller.js';
import * as T from 'three';
import {createLunaActor} from '../luna-actor.js';
import {createNavigation} from './navigation.js';
import {ROOM} from './world.js';
import {ATTACKS,canHit,TAUNTS} from './berserker-combat.js';

export function createBerserker(world,body,grapple,cb){
 const actors={luna:createLunaActor(world.scene),sibot:createSiBotActor(world.scene)};for(const a of Object.values(actors))a.root.visible=false;let luna=actors.luna,character='luna',name='Luna',aiAction='wait',aiUntil=0,modelStatus='';
 const spanishVoice=createWindowsRobotVoice({language:'es-ES'});
 const nav=createNavigation(ROOM,world.RECTS,world.CIRCLES,.23);
 const bat=new T.Group(),wood=new T.MeshStandardMaterial({color:'#ba7640',roughness:.65}),tape=new T.MeshStandardMaterial({color:'#222d32'});
 function piece(geo,material,y){const m=new T.Mesh(geo,material);m.position.y=y;m.castShadow=true;bat.add(m);return m;}
 // The grip sits in the original revolver rig's right hand; local scale is 0.38.
 piece(new T.CylinderGeometry(.17,.07,1.75,16),wood,1.15);
 piece(new T.CylinderGeometry(.072,.072,.55,12),tape,.1);
 piece(new T.SphereGeometry(.09,12,8),wood,-.2);
 piece(new T.SphereGeometry(.17,12,8),wood,2.02);
 luna.arms.R.hand.add(bat);bat.rotation.z=-.16;
 const canvas=world.renderer.domElement,keys=new Set();
 const st={active:false,manual:false,paused:false,hits:0,swings:0,kicks:0,misses:0,phase:'off',line:'',attack:null,heading:-Math.PI/2,yaw:-Math.PI/2,pitch:.18,gait:0};
 let elapsed=0,time=0,nextAttack=0,nextLine=0,lineIndex=0,speakingUntil=0,path=[],routeAt=0,previous=null,drag=false,savedAuto=false,utterance=null;
 const hud=document.createElement('section');hud.id='berserker-hud';hud.hidden=true;hud.setAttribute('aria-label','Luna berserker controls');
 hud.innerHTML='<div class="berserker-title"><span>LUNA <b>BERSERKER</b></span><span id="berserker-score">0 HITS</span></div><div id="berserker-caption" aria-live="polite"></div><div class="berserker-buttons"><button id="berserker-control">Control Luna</button><button id="berserker-pause">Pause</button><button id="berserker-exit">Exit mode · Esc</button></div><p id="berserker-help"></p><div id="berserker-result" role="status"></div>';
 document.body.append(hud);
 const $=id=>hud.querySelector('#'+id);
 const controller=createSiBotController({mode:'berserker',scene:'cell',snapshot:()=>({position:luna.root.position.toArray(),target:target().toArray(),phase:st.phase,hits:st.hits,misses:st.misses,lastWords:st.line,manual:st.manual}),onStatus(text){modelStatus=text;if(st.active&&character==='sibot')paint();},onDecision(d){if(!st.active||st.manual||st.paused)return;aiAction=d.action;aiUntil=time+d.duration;talk(d.spoken||d.speech,d.language,d.speech);if(d.action==='leave')exit();}});
 function paint(){
  hud.querySelector('.berserker-title span').textContent=name.toUpperCase()+' BERSERKER';hud.setAttribute('aria-label',name+' berserker controls');
  $('berserker-control').textContent=st.manual?'Let '+name+' take over':'Control '+name;$('berserker-control').setAttribute('aria-pressed',String(st.manual));
  $('berserker-pause').textContent=st.paused?'Resume':'Pause';$('berserker-pause').setAttribute('aria-pressed',String(st.paused));
  $('berserker-score').textContent=`${st.hits} HITS · ${st.kicks} KICKS`;
  $('berserker-help').textContent=st.manual?'WASD move · Mouse look (hold right button) · Left click bat · E kick · Shift sprint · Esc exit':character==='sibot'?modelStatus:'Luna hunts him down automatically. Take control whenever you like.';
  $('berserker-result').textContent=st.paused?'PAUSED':st.phase==='entering'?'HERE COMES TROUBLE':st.manual?'YOU ARE '+name.toUpperCase():character==='sibot'?'RIVAL / '+aiAction.toUpperCase():'AUTONOMOUS RAMPAGE';
 }
 function talk(line,language='en-US',subtitle=line){
  const text=line??(character==='luna'?TAUNTS[lineIndex++%TAUNTS.length]:'');if(!text)return;st.line=subtitle||text;$('berserker-caption').textContent='“'+(subtitle||text)+'”';speakingUntil=time+Math.max(2.5,text.length/16);cb.taunt?.(subtitle||text);
  if(cb.soundEnabled?.()&&language==='es-ES'){spanishVoice.say(text);return;}
  if(cb.soundEnabled?.()&&'speechSynthesis' in window&&!speechSynthesis.speaking){utterance=new SpeechSynthesisUtterance(text);utterance.lang=language;utterance.rate=1.12;utterance.pitch=1.25;const voices=speechSynthesis.getVoices();utterance.voice=language==='es-ES'?voices.find(v=>/^es/i.test(v.lang))||null:voices.find(v=>/zira|jenny|samantha|aria/i.test(v.name))||voices.find(v=>/^en/.test(v.lang))||null;speechSynthesis.speak(utterance);}
 }
 function unlock(){drag=false;keys.clear();if(document.pointerLockElement===canvas)document.exitPointerLock();}
 function setManual(on){st.manual=!!on;controller.setEnabled(character==='sibot'&&!st.manual&&!st.paused);aiAction='wait';unlock();st.attack=null;path=[];st.yaw=st.heading;paint();}
 function pause(on){st.paused=!!on;controller.setEnabled(character==='sibot'&&!st.manual&&!st.paused);aiAction='wait';st.attack=null;unlock();paint();}
 function enter(id='luna'){
  if(st.active)return;if(cb.canEnter?.()===false)return false;
  character=id==='sibot'?'sibot':'luna';name=character==='sibot'?'Si BoT':'Luna';luna=actors[character];luna.arms.R.hand.add(bat);aiAction='wait';aiUntil=0;
  previous={position:world.camera.position.clone(),quaternion:world.camera.quaternion.clone(),target:world.controls.target.clone(),enabled:world.controls.enabled,pov:world.povMain};
  savedAuto=cb.prepare?.()||false;grapple.settle();body.stop();body.clearGesture();
  Object.assign(st,{active:true,manual:false,paused:false,hits:0,swings:0,kicks:0,misses:0,phase:'entering',attack:null,heading:-Math.PI/2,yaw:-Math.PI/2,pitch:.18,gait:0});elapsed=0;time=0;lineIndex=0;nextAttack=1.7;nextLine=9;path=[];routeAt=0;
  luna.root.position.set(2.85,0,.6);luna.root.rotation.y=st.heading;luna.root.visible=true;world.controls.enabled=false;world.povMain=false;world.setCameraDriver(camera);world.setDoorOpen(1);hud.hidden=false;document.body.classList.add('berserker-mode');paint();talk();controller.setEnabled(character==='sibot');cb.sfx?.('thud');return true;
 }
 function exit(){
  if(!st.active)return;spanishVoice.stop();controller.setEnabled(false);unlock();st.active=false;st.attack=null;st.phase='off';luna.root.visible=false;hud.hidden=true;document.body.classList.remove('berserker-mode');world.setDoorOpen(0);world.setCameraDriver(null);grapple.settle();
  if(utterance&&speechSynthesis.speaking)speechSynthesis.cancel();utterance=null;
  world.camera.position.copy(previous.position);world.camera.quaternion.copy(previous.quaternion);world.controls.target.copy(previous.target);world.controls.enabled=previous.enabled;world.povMain=previous.pov;cb.released?.(savedAuto);
 }
 function target(){return grapple.ragdoll?.center.clone()||world.bot.targetPos('chest',new T.Vector3());}
 function swing(kind='bat'){
  if(!st.active||st.paused||st.phase==='entering'||st.attack||time<nextAttack)return false;
  st.attack={kind,at:time,hit:false};st.swings++;nextAttack=time+ATTACKS[kind].duration+.13;cb.sfx?.('servo');return true;
 }
 function impact(attack){
  const goal=target(),spec=ATTACKS[attack.kind];
  // A swing must be in reach, facing the victim, and unobstructed by room furniture.
  const a=[luna.root.position.x,luna.root.position.z],b=nav.closestFree(goal.x,goal.z);
  if(!canHit(luna.root.position,st.heading,goal,spec.range)||!b||!nav.segmentClear(a,b)){st.misses++;$('berserker-result').textContent='WHIFF';return;}
  const direction=goal.clone().sub(luna.root.position);
  if(!grapple.launch(direction,spec.force,attack.kind==='kick'?'body':'torso'))return;
  st.hits++;if(attack.kind==='kick')st.kicks++;
  world.burst(goal,24,'#ffbf63',2.7,.38);world.ring(goal,'#ffbb55');world.bot.flash(.7);cb.sfx?.('thud');cb.hit?.(attack.kind);paint();$('berserker-result').textContent=attack.kind==='kick'?'BOOTED!':'CLANG!';
 }
 function move(dx,dz){
  const p=luna.root.position,start=[p.x,p.z],both=[p.x+dx,p.z+dz];
  if(nav.segmentClear(start,both)){p.x=both[0];p.z=both[1];}
  else {if(nav.segmentClear(start,[p.x+dx,p.z]))p.x+=dx;if(nav.segmentClear([p.x,p.z],[p.x,p.z+dz]))p.z+=dz;}
 }
 function animate(dt,speed){
  luna.update(time,dt,time<speakingUntil);st.gait+=speed*dt*12;
  luna.root.rotation.y=st.heading;luna.torso.rotation.set(0,0,0);luna.root.position.y=Math.abs(Math.sin(st.gait))*.025*Math.min(1,speed);
  for(const [side,sign]of[['L',1],['R',-1]]){const phase=st.gait+(sign<0?Math.PI:0),stride=Math.min(.65,speed*.32);luna.legs[side].hip.rotation.set(Math.sin(phase)*stride,0,0);luna.legs[side].knee.rotation.set(Math.max(0,-Math.sin(phase))*stride,0,0);luna.arms[side].sh.rotation.set(-Math.sin(phase)*stride*.5,0,sign*.12);luna.arms[side].fa.rotation.set(-.35,0,0);luna.arms[side].el.rotation.set(0,0,0);}
  luna.arms.R.sh.rotation.x=-.55;luna.arms.R.fa.rotation.x=-.8;bat.rotation.set(0,0,-.16);
  if(st.attack){const {kind,at}=st.attack,age=time-at,spec=ATTACKS[kind],wind=T.MathUtils.smoothstep(age,0,spec.contact),follow=T.MathUtils.smoothstep(age,spec.contact,spec.duration),snap=Math.sin(Math.PI*Math.min(1,age/(spec.contact*2)));
   if(kind==='kick'){luna.legs.R.hip.rotation.x=-1.6*snap;luna.legs.R.knee.rotation.x=.35*(1-snap);luna.torso.rotation.x=-.18*snap;}
   else{luna.torso.rotation.y=.65*wind-1.3*follow;luna.arms.R.sh.rotation.set(-1.7*wind+1.2*follow,.7*wind-1.6*follow,-.65*wind);luna.arms.R.fa.rotation.x=-.8+.65*snap;bat.rotation.z=-.4+1.6*follow;const low=target().y<.65;luna.torso.rotation.x=low?.65*snap:.12*snap;luna.legs.L.hip.rotation.x-=.25*snap;}
   if(age>=spec.contact&&!st.attack.hit){st.attack.hit=true;impact(st.attack);}
   if(age>=spec.duration)st.attack=null;
  }
  luna.root.updateMatrixWorld(true);
  // Orient the bat through the contact point, then follow through across the body.
  if(st.attack?.kind==='bat'){
   const age=time-st.attack.at,spec=ATTACKS.bat,hand=luna.arms.R.hand,grip=hand.getWorldPosition(new T.Vector3()),aim=target().sub(grip).normalize(),wind=new T.Vector3(0,.85,-.5).applyAxisAngle(new T.Vector3(0,1,0),st.heading),contact=T.MathUtils.smoothstep(age,.12,spec.contact),follow=T.MathUtils.smoothstep(age,spec.contact,spec.duration);
   const direction=wind.lerp(aim,contact).normalize().applyAxisAngle(new T.Vector3(0,1,0),-follow*1.15),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction);
   bat.quaternion.copy(hand.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
  }
 }
 function update(t,dt){
  if(!st.active)return;if(cb.canContinue?.()===false){exit();return;}
  if(document.hidden||st.paused){keys.clear();return;}dt=Math.min(.05,dt);time+=dt;elapsed+=dt;
  const old=luna.root.position.clone();
  if(st.phase==='entering'){luna.root.position.x=2.85-1.05*Math.min(1,elapsed/.9);if(elapsed>1.2){st.phase='hunting';world.setDoorOpen(0);paint();}}
  else if(st.manual){
   let f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),r=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));const length=Math.hypot(f,r);
   if(length&&!st.attack){f/=length;r/=length;const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?2.6:1.55,dx=(Math.sin(st.yaw)*f-Math.cos(st.yaw)*r)*speed*dt,dz=(Math.cos(st.yaw)*f+Math.sin(st.yaw)*r)*speed*dt;move(dx,dz);st.heading=Math.atan2(dx,dz);}
  }else if(!st.attack&&(character==='luna'||(time<aiUntil&&['approach','bat','kick'].includes(aiAction)))){
   const p=target(),d=p.clone().sub(luna.root.position);st.heading=Math.atan2(d.x,d.z);const dist=Math.hypot(d.x,d.z);
   if(dist>.83){if(time>routeAt){const result=nav.route([luna.root.position.x,luna.root.position.z],[p.x,p.z]);path=result.path;routeAt=time+.35;}
    if(path.length){const next=path[0],dx=next[0]-luna.root.position.x,dz=next[1]-luna.root.position.z,length=Math.hypot(dx,dz),step=Math.min(length,dt*1.9);if(length>.01){move(dx/length*step,dz/length*step);st.heading=Math.atan2(dx,dz);}if(length<.09)path.shift();}
   }else if(time>=nextAttack){if(character==='luna'||aiAction!=='approach')swing(character==='sibot'?aiAction:st.swings%4===2?'kick':'bat');nextAttack=time+1.2+Math.random()*.55;}
  }
  if(character==='sibot'&&!st.manual)controller.update();
  if(character==='luna'&&time>=nextLine){talk();nextLine=time+8+Math.random()*5;}
  animate(dt,old.distanceTo(luna.root.position)/Math.max(dt,.001));
 }
 function camera(cam,dt){
  if(!st.active)return;world.povMain=false;
  const center=luna.root.position.clone().setY(1.05),yaw=st.manual?st.yaw:st.heading;
  if(!st.manual)center.lerp(target(),.28);
  const distance=st.manual?1.8:2.2,viewYaw=st.manual?yaw:yaw+.85,desired=center.clone().add(new T.Vector3(-Math.sin(viewYaw)*distance,.7+st.pitch,-Math.cos(viewYaw)*distance));
  desired.x=T.MathUtils.clamp(desired.x,ROOM.x0+.15,ROOM.x1-.15);desired.z=T.MathUtils.clamp(desired.z,ROOM.z0+.15,ROOM.z1-.15);desired.y=T.MathUtils.clamp(desired.y,.65,2.8);
  cam.position.lerp(desired,1-Math.exp(-dt*10));cam.lookAt(center.clone().add(new T.Vector3(Math.sin(yaw)*.45,-st.pitch*.3,Math.cos(yaw)*.45)));
 }
 const editable=e=>/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable;
 addEventListener('keydown',e=>{if(!st.active||editable(e)||e.ctrlKey||e.metaKey||e.altKey)return;if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();exit();return;}if(!st.manual||st.paused)return;if(['KeyW','KeyA','KeyS','KeyD','KeyE','ShiftLeft','ShiftRight','Space'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();keys.add(e.code);if(e.code==='KeyE'&&!e.repeat)swing('kick');}},true);
 addEventListener('keyup',e=>keys.delete(e.code),true);addEventListener('blur',()=>{if(st.active)pause(true);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&st.active)pause(true);});
 canvas.addEventListener('contextmenu',e=>{if(st.active)e.preventDefault();});
 canvas.addEventListener('pointerdown',e=>{if(!st.active)return;e.preventDefault();e.stopImmediatePropagation();if(st.manual&&!st.paused){if(e.button===0)swing();if(e.button===2){drag=true;canvas.setPointerCapture(e.pointerId);}}},true);
 canvas.addEventListener('pointermove',e=>{if(st.active&&st.manual&&drag){st.yaw-=e.movementX*.006;st.pitch=T.MathUtils.clamp(st.pitch+e.movementY*.004,-.3,1);e.stopImmediatePropagation();}},true);
 canvas.addEventListener('pointerup',e=>{if(!st.active)return;drag=false;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);e.stopImmediatePropagation();},true);
 canvas.addEventListener('pointercancel',()=>{drag=false;keys.clear();});
 $('berserker-control').onclick=()=>setManual(!st.manual);$('berserker-pause').onclick=()=>pause(!st.paused);$('berserker-exit').onclick=exit;
 return {enter,exit,update,swing,setManual,pause,get luna(){return luna;},get name(){return name;},get character(){return character;},st,get active(){return st.active;}};
}
