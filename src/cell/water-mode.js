import * as T from 'three';
import variants from './water-variants.json';

// Cartoon prop interaction. The steel character has no simulated respiratory system.
export function createWaterMode(world, body, audio, cb) {
 const $=id=>document.getElementById(id), canvas=world.renderer.domElement;
 const st={active:false,covered:true,pouring:false,wet:0,drop:0,elapsed:0,dragging:false,splashes:0};
 const group=new T.Group();group.name='Water jug scene';group.visible=false;world.scene.add(group);
 const taskLight=new T.PointLight('#d4f3ff',5,4.5,2);taskLight.position.set(-.9,2.3,-.8);group.add(taskLight);
 const material=(color,more={})=>new T.MeshStandardMaterial({color,roughness:.45,...more});
 const blue=material('#5dbbdd',{transparent:true,opacity:.72,metalness:.18});
 const rim=material('#b6eaff',{metalness:.5}), dark=material('#174f70'), water=material('#77dfff',{transparent:true,opacity:.82,emissive:'#0d526b',emissiveIntensity:.4});
 function mesh(geo,mat,parent,pos=[0,0,0]){const m=new T.Mesh(geo,mat);m.position.set(...pos);m.castShadow=true;parent.add(m);return m;}
 const jug=new T.Group();jug.name='Giant water jug';group.add(jug);
 mesh(new T.CylinderGeometry(.24,.32,.72,24),blue,jug);
 mesh(new T.SphereGeometry(.25,24,12),blue,jug,[0,.34,0]).scale.set(1,.55,1);
 mesh(new T.CylinderGeometry(.105,.13,.21,20,true),rim,jug,[0,.49,0]);
 const mouth=mesh(new T.TorusGeometry(.108,.022,8,24),dark,jug,[0,.60,0]);mouth.rotation.x=Math.PI/2;
 const handle=mesh(new T.TorusGeometry(.23,.055,10,24,Math.PI*1.6),dark,jug,[.31,.03,0]);handle.scale.set(.8,1.35,1);handle.rotation.z=-Math.PI*.8;
 for(const y of[-.27,-.1,.07]){const ring=mesh(new T.TorusGeometry(.30-(y+.27)*.1,.016,6,24),rim,jug,[0,y,0]);ring.rotation.x=Math.PI/2;}
 const fill=mesh(new T.CylinderGeometry(.225,.285,.49,20),water,jug,[0,-.08,0]);
 const label=mesh(new T.BoxGeometry(.30,.19,.018),material('#eaf8e8'),jug,[0,-.02,.295]);
 const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=128;const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#eaf8e8';ctx.fillRect(0,0,256,128);ctx.fillStyle='#174f70';ctx.font='bold 48px monospace';ctx.textAlign='center';ctx.fillText('H2-OH!',128,62);ctx.font='22px monospace';ctx.fillText('GIANT JUG',128,99);label.material.map=new T.CanvasTexture(labelCanvas);
 const towelGeo=new T.PlaneGeometry(1.35,1.25,24,22), base=towelGeo.attributes.position.array.slice();
 const towelMat=material('#eee7c9',{side:T.DoubleSide,roughness:1});
 const towel=new T.Mesh(towelGeo,towelMat);towel.name='Liftable towel';towel.visible=false;world.bot.head.add(towel);
 towel.position.set(0,.06,.56);towel.castShadow=true;
 const straps=new T.Group();group.add(straps);
 for(const z of[-1.12,-.22]){mesh(new T.BoxGeometry(.77,.035,.12),material('#554832'),straps,[-2.06,.77,z]);mesh(new T.BoxGeometry(.12,.06,.15),rim,straps,[-1.75,.78,z]);}
 const jet=mesh(new T.CylinderGeometry(.035,.07,1,10),water,group);jet.visible=false;
 const drops=[],geo=new T.SphereGeometry(.026,7,5);for(let i=0;i<100;i++){const m=mesh(geo,water,group);m.visible=false;drops.push({m,v:new T.Vector3(),life:0});}
 const puddle=mesh(new T.CircleGeometry(.6,40),material('#58bcd1',{transparent:true,opacity:0,depthWrite:false}),group,[-1.42,.012,-1.2]);puddle.rotation.x=-Math.PI/2;puddle.scale.set(1,.65,1);
 const sound=new Audio('/audio/water-mode/'+variants[0].file);sound.preload='auto';sound.volume=.75;
 let variantIndex=-1,bag=[];
 function nextSound(){if(!bag.length){bag=variants.map((_,i)=>i);for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}if(bag[bag.length-1]===variantIndex)bag.unshift(bag.pop());}variantIndex=bag.pop();sound.src='/audio/water-mode/'+variants[variantIndex].file;body.st.waterSeed=Math.random()*100;}
 sound.addEventListener('error',()=>cb.toast('The water sound could not load.'));
 const head=new T.Vector3(),out=new T.Vector3(),end=new T.Vector3(),up=new T.Vector3(0,1,0),aim=new T.Vector3(-1.55,1.85,-1.3);
 const ray=new T.Raycaster(),ndc=new T.Vector2(),plane=new T.Plane(up,-1.85),point=new T.Vector3();
 let savedCamera=null,dropImpact=false,lastHud='';
 function hud(){const text=st.pouring?'GLUG GLUG · POURING':st.covered?'TOWEL DOWN':'TOWEL LIFTED';if(text!==lastHud){$('water-status').textContent=text;lastHud=text;}$('water-towel').textContent=st.covered?'Lift towel [R]':'Lower towel [R]';$('water-pour').textContent=st.pouring?'Stop pouring':'Pour water [Space]';$('water-pour').setAttribute('aria-pressed',String(st.pouring));$('water-towel').setAttribute('aria-pressed',String(st.covered));}
 function pour(on){if(!st.active)return;const next=!!on;if(next===st.pouring)return;st.pouring=next;st.elapsed=0;
  if(next){st.splashes++;nextSound();sound.currentTime=0;if(audio.enabled)sound.play().catch(()=>cb.toast('Enable sound to hear the bubbling effect.'));cb.event(st.covered?'The giant jug tips: water splashes across the towel on your steel face. Water distorts sound from your speaker.':'Water splashes across your uncovered steel head with a gurgling sound.');}
  else {sound.pause();st.hits=false;body.st.waterReaction=0;}hud();
 }
 function toggleTowel(){if(!st.active)return;st.covered=!st.covered;if(!st.covered)pour(false);cb.event(st.covered?'The towel is lowered over your face.':'The towel lifts clear of your face; the water stops and your voice is clear again.');hud();}
 function dropJug(){if(!st.active||st.drop)return;st.drop=.001;dropImpact=false;pour(true);}
 function enter(){if(st.active)return;if(!cb.canEnter())return;cb.cancel();st.active=true;st.covered=true;st.wet=0;st.drop=0;group.visible=towel.visible=true;
  body.stop();body.clearGesture();body.release();body.st.push.set(0,0);body.st.look=null;body.st.heading=0;body.st.lieHeading=0;body.st.lieOn='bed';body.setPosture('lie',{pos:[-2.06,-.3],exit:[-1.3,-.75]});
  aim.set(-1.35,1.85,-1.45);jug.position.copy(aim);savedCamera={pos:world.camera.position.clone(),target:world.controls.target.clone(),pov:world.povMain};world.povMain=false;world.camera.position.set(.65,2.65,.7);world.controls.target.set(-1.6,.85,-.75);world.controls.update();
  document.querySelector('header h1').innerHTML='Agent<span>WATER-BOARD MODE</span>';document.querySelector('header .sub').textContent='Steel skeleton / towel / giant water jug. Lift the towel or release him with the controls.';
  $('water-controls').hidden=false;$('water-enter').hidden=true;document.body.classList.add('water-mode');cb.event('You are lying on the cot with a towel over your face. The operator controls the oversized water jug and can lift the towel or release you. ');hud();
 }
 function exit(){if(!st.active)return;pour(false);st.active=false;st.dragging=false;st.drop=0;group.visible=towel.visible=false;jet.visible=false;drops.forEach(d=>{d.life=0;d.m.visible=false;});body.clearGesture();body.standUpNow();body.st.lieOn=null;world.controls.enabled=true;
  if(savedCamera){world.camera.position.copy(savedCamera.pos);world.controls.target.copy(savedCamera.target);world.povMain=savedCamera.pov;world.controls.update();}
  document.querySelector('header h1').innerHTML='T-800<span>FREE CONTAINMENT</span>';document.querySelector('header .sub').textContent='Random free movement. Connected agent · configurable backend. Intercom orders take priority.';
  $('water-controls').hidden=true;$('water-enter').hidden=false;document.body.classList.remove('water-mode');cb.released();cb.event('The cot straps are released. You are free to move randomly around the cell again.');
 }
 function update(t,dt){if(!st.active)return;sound.muted=!audio.enabled;
  if(document.hidden){pour(false);st.dragging=false;world.controls.enabled=true;}
  st.elapsed+=dt;if(st.pouring&&st.elapsed>4.5)pour(false);
  world.bot.head.updateWorldMatrix(true,false);world.bot.head.localToWorld(head.set(0,.03,.56));
  const lift=st.covered?0:1;towel.position.y=T.MathUtils.damp(towel.position.y,.06+lift*.9,9,dt);towel.position.z=T.MathUtils.damp(towel.position.z,.56+lift*.75,9,dt);towel.rotation.x=T.MathUtils.damp(towel.rotation.x,-lift*.7,9,dt);
  st.wet=T.MathUtils.clamp(st.wet+(st.pouring?dt*.35:-dt*.04),0,1);towelMat.color.set('#eee7c9').lerp(new T.Color('#839b9d'),st.wet);puddle.material.opacity=st.wet*.45;
  const pos=towelGeo.attributes.position;for(let i=0;i<pos.count;i++){const x=base[i*3],y=base[i*3+1];pos.setZ(i,-Math.pow(Math.abs(x),2)*.45+Math.sin(x*18+t*3+y*5)*(.018+(st.pouring?.035:0)));}pos.needsUpdate=true;towelGeo.computeVertexNormals();
  let dy=0;if(st.drop){st.drop+=dt;dy=-Math.sin(Math.min(1,st.drop/.8)*Math.PI)*.62;if(st.drop>.4&&!dropImpact){dropImpact=true;cb.sfx('squirt');}if(st.drop>=.8)st.drop=0;}
  jug.position.lerp(aim,Math.min(1,dt*12));jug.position.y=aim.y+dy+Math.sin(t*2)*.015;jug.rotation.z=T.MathUtils.damp(jug.rotation.z,st.pouring?1.95:0,9,dt);fill.scale.y=.93+Math.sin(t*10)*.05;
  jug.updateWorldMatrix(true,true);jug.localToWorld(out.set(0,.61,0));end.copy(out);end.y=Math.max(.55,head.y);jet.visible=st.pouring;
  if(st.pouring){jet.position.copy(out).add(end).multiplyScalar(.5);jet.scale.y=Math.max(.01,out.distanceTo(end));jet.quaternion.setFromUnitVectors(up,end.clone().sub(out).normalize());
   const hits=Math.hypot(end.x-head.x,end.z-head.z)<.55;st.hits=hits;
   const levels=variants[Math.max(0,variantIndex)].envelope,level=levels[Math.min(levels.length-1,Math.floor((audio.enabled?sound.currentTime:st.elapsed)/.05))]||0;
   body.st.waterReaction=hits?T.MathUtils.damp(body.st.waterReaction||0,.45+level*.55,18,dt):0;if(hits)world.bot.flash(.2);
   for(let j=0;j<4;j++){const d=drops.find(x=>x.life<=0);if(!d)break;d.life=.35+Math.random()*.5;d.m.visible=true;d.m.position.copy(end);d.v.set((Math.random()-.5)*1.8,.6+Math.random(),(Math.random()-.5)*1.8);}
  }
  for(const d of drops)if(d.life>0){d.life-=dt;d.v.y-=4*dt;d.m.position.addScaledVector(d.v,dt);d.m.visible=d.life>0&&d.m.position.y>.02;d.m.scale.setScalar(Math.min(1,d.life*4));}
 }
 canvas.addEventListener('pointerdown',e=>{if(!st.active||e.button!==0)return;const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,world.camera);if(!ray.intersectObject(jug,true).length)return;e.stopImmediatePropagation();e.preventDefault();st.dragging=true;world.controls.enabled=false;canvas.setPointerCapture(e.pointerId);},true);
 canvas.addEventListener('pointermove',e=>{if(!st.dragging)return;e.stopImmediatePropagation();const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,world.camera);if(ray.ray.intersectPlane(plane,point)){aim.x=T.MathUtils.clamp(point.x,-1.9,-.5);aim.z=T.MathUtils.clamp(point.z,-1.8,.2);}},true);
 function stopDrag(e){if(!st.dragging)return;st.dragging=false;world.controls.enabled=true;e?.stopImmediatePropagation();if(e&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
 canvas.addEventListener('pointerup',stopDrag,true);canvas.addEventListener('pointercancel',e=>{stopDrag(e);pour(false);},true);addEventListener('blur',()=>{stopDrag();pour(false);});
 addEventListener('keydown',e=>{if(!st.active||e.repeat||e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();pour(true);}if(e.code==='KeyR')toggleTowel();if(e.code==='KeyU')exit();});
 addEventListener('keyup',e=>{if(st.active&&e.code==='Space'){e.preventDefault();pour(false);}});
 $('water-enter').onclick=enter;$('water-exit').onclick=exit;$('water-pour').onclick=()=>pour(!st.pouring);$('water-towel').onclick=toggleTowel;$('water-drop').onclick=dropJug;
 return {st,enter,exit,pour,toggleTowel,dropJug,update,jug,towel,sound,get active(){return st.active;},describe(){return st.active?`WATER SCENE: on the cot; towel ${st.covered?'down':'lifted'}; jug ${st.pouring?'pouring':'upright'}. Your body stays on the cot until released. Physical actions cannot move you off it. Describe only observed effects on your mechanical body.`:'';}};
}
