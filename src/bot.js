import * as T from 'three';

// Procedural T-800-style endoskeleton strapped to a chair. Toon-shaded, built from primitives.
export function createBot(toon,opts={}){
 const free=!!opts.free;   // cell mode: no chair, no straps, stands on his own feet and is posed by opts.pose
 const root=new T.Group();root.name='T-800';
 const steel=toon('#66727b'),dark=toon('#232a30'),mid=toon('#424c53'),strap=toon('#2b211d'),chairM=toon('#4a4038');
 const sph=new T.SphereGeometry(1,20,14),box=new T.BoxGeometry(1,1,1),cyl=new T.CylinderGeometry(1,1,1,10);
 const pickables=[];
 function part(parent,geo,mat,pos,scale,rot){const m=new T.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);if(rot)m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;parent.add(m);pickables.push(m);return m;}
 const pivot=(parent,pos)=>{const g=new T.Group();g.position.set(...pos);parent.add(g);return g;};

 // ---- chair ----
 const chair=new T.Group();if(!free)root.add(chair);
 part(chair,box,chairM,[0,1,.1],[1.9,.14,1.6]);
 part(chair,box,chairM,[0,2.35,-.72],[1.9,2.7,.14]);
 for(const sx of[-1,1])for(const sz of[-1,1])part(chair,box,dark,[sx*.85,.5,sz*.65+.1],[.12,1,.12]);
 for(const sx of[-1,1]){part(chair,box,chairM,[sx*1.0,1.72,.35],[.2,.1,1.3]);part(chair,box,dark,[sx*1.0,1.35,-.1],[.1,.7,.1]);}
 part(chair,box,dark,[0,.12,.1],[2.0,.06,1.7]);

 // ---- pelvis / spine / ribcage ----
 const body=pivot(root,[0,0,0]);
 part(body,box,mid,[0,1.25,0],[1.05,.32,.7]);
 part(body,cyl,dark,[0,1.8,-.1],[.09,1.2,.09]);
 const torso=pivot(body,[0,2.05,0]);
 for(let i=0;i<6;i++){const r=.56-i*.02+(i===2?.05:0);const rib=part(torso,new T.TorusGeometry(1,.06,6,22),steel,[0,-.42+i*.17,.02],[r,r*.8,r*.7],[Math.PI/2,0,0]);}
 part(torso,box,steel,[0,.05,.38],[.14,1.0,.1]);
 part(torso,box,mid,[0,-.4,-.15],[.9,.14,.3]);
 const coreMat=new T.MeshBasicMaterial({color:'#ff4a22'});
 const core=part(torso,sph,coreMat,[0,-.05,.3],[.11,.11,.11]);
 if(!free)part(torso,box,strap,[0,.1,.4],[1.25,.16,.14]); // chest strap
 // shoulders
 const arms={};
 for(const s of[-1,1]){
  const k=s<0?'L':'R';
  part(torso,sph,steel,[s*.72,.5,0],[.2,.2,.2]);
  const sh=pivot(torso,[s*.72,.5,0]);sh.rotation.x=-.25;
  part(sh,cyl,steel,[0,-.4,0],[.12,.8,.12]);
  part(sh,cyl,mid,[s*.13,-.4,.05],[.04,.7,.04]);
  const el=pivot(sh,[0,-.8,0]);
  part(el,sph,dark,[0,0,0],[.15,.15,.15]);
  const fa=pivot(el,[0,0,0]);fa.rotation.x=-Math.PI/2+.25;
  part(fa,cyl,steel,[0,-.4,0],[.11,.8,.11]);
  part(fa,cyl,mid,[s*.12,-.4,.04],[.035,.7,.035]);
  if(!free)part(fa,box,strap,[0,-.45,0],[.28,.16,.28]); // wrist strap
  const hand=pivot(fa,[0,-.82,0]);
  part(hand,box,dark,[0,-.1,0],[.22,.2,.12]);
  for(let f=0;f<4;f++)part(hand,box,steel,[-.075+f*.05,-.28,0],[.035,.2,.035]);
  part(hand,box,steel,[s*.14,-.14,.02],[.04,.14,.04],[0,0,s*.5]);
  arms[k]={sh,el,fa,hand};
 }
 // ---- neck / head ----
 const neck=pivot(torso,[0,.55,.02]);
 part(neck,cyl,dark,[0,.22,0],[.12,.5,.12]);
 part(neck,cyl,mid,[.08,.22,.06],[.03,.5,.03]);
 const head=pivot(neck,[0,.78,.05]);
 part(head,sph,steel,[0,.1,0],[.42,.5,.46]);
 part(head,box,steel,[0,-.02,.24],[.62,.14,.2]);          // brow ridge
 for(const s of[-1,1]){part(head,sph,steel,[s*.3,-.12,.3],[.12,.1,.1]);} // cheekbones
 const sockets=[],eyeMat=new T.MeshBasicMaterial({color:'#ff2a1a'});
 for(const s of[-1,1]){part(head,sph,toon('#0b0b0b'),[s*.17,.0,.38],[.11,.1,.08]);sockets.push(part(head,sph,eyeMat,[s*.17,.0,.42],[.062,.062,.05]));}
 part(head,box,dark,[0,-.1,.43],[.07,.14,.06]);              // nose slot
 part(head,box,mid,[0,.58,-.02],[.34,.08,.3]);              // top plate
 const jaw=pivot(head,[0,-.18,.12]);
 part(jaw,box,steel,[0,-.1,.1],[.5,.18,.38]);
 for(let i=0;i<7;i++)part(jaw,box,toon('#9a9d96'),[-.18+i*.06,0,.28],[.04,.07,.04]);
 for(let i=0;i<7;i++)part(head,box,toon('#9a9d96'),[-.18+i*.06,-.15,.32],[.04,.06,.04]);
 // face parts for the break scene
 const shades=new T.Group();head.add(shades);shades.visible=false;
 part(shades,box,toon('#0c0c0c'),[-.17,.0,.5],[.17,.1,.03]);part(shades,box,toon('#0c0c0c'),[.17,.0,.5],[.17,.1,.03]);part(shades,box,toon('#0c0c0c'),[0,.0,.5],[.1,.025,.03]);
 const eyeLight=new T.PointLight('#ff3322',6,4,2);eyeLight.position.set(0,0,.9);head.add(eyeLight);

 // ---- legs ----
 const legs={};
 for(const s of[-1,1]){
  const k=s<0?'L':'R';
  const hip=pivot(body,[s*.32,1.3,.05]);hip.rotation.x=-Math.PI/2;
  part(hip,sph,steel,[0,0,0],[.2,.2,.2]);
  part(hip,cyl,steel,[0,-.5,0],[.17,1.0,.17]);
  part(hip,cyl,mid,[s*.16,-.5,0],[.045,.9,.045]);
  const knee=pivot(hip,[0,-1,0]);knee.rotation.x=Math.PI/2;
  part(knee,sph,dark,[0,0,0],[.18,.18,.18]);
  part(knee,cyl,steel,[0,-.55,0],[.13,1.1,.13]);
  part(knee,cyl,mid,[s*.14,-.55,.03],[.04,.9,.04]);
  if(!free)part(knee,box,strap,[0,-.95,0],[.32,.16,.32]); // ankle strap
  const foot=pivot(knee,[0,-1.1,0]);
  part(foot,box,dark,[0,-.04,.18],[.3,.14,.55]);
  part(foot,box,steel,[0,.08,-.04],[.22,.2,.2]);
  legs[k]={hip,knee,foot};
 }
 if(!free)part(chair,box,strap,[0,1.14,.15],[1.15,.1,.2]); // lap belt

 // ---- break props (hidden until a milestone) ----
 const drink=new T.Group();drink.position.set(1.0,1.95,.75);drink.visible=false;root.add(drink);
 part(drink,cyl,toon('#f5e2a0'),[0,.2,0],[.12,.38,.12]);part(drink,cyl,toon('#e84a8d'),[.04,.5,0],[.015,.4,.015],[0,0,-.25]);
 part(drink,cyl,toon('#ff6b5c'),[-.06,.52,0],[.2,.02,.2]);part(drink,cyl,toon('#6b3d1f'),[-.06,.36,0],[.01,.34,.01]);
 const zzz=new T.Group();root.add(zzz);zzz.visible=false;

 if(free){ // standing rest pose: legs straight, arms hanging, chair geometry out of the pick list
  for(const s of[-1,1]){const k=s<0?'L':'R';arms[k].sh.rotation.set(0,0,s*.1);arms[k].fa.rotation.set(-.18,0,0);legs[k].hip.rotation.set(0,0,0);legs[k].knee.rotation.set(0,0,0);}
  const inChair=new Set();chair.traverse(o=>inChair.add(o));for(let i=pickables.length-1;i>=0;i--)if(inChair.has(pickables[i]))pickables.splice(i,1);
 }
 // ---- reactions: decaying spring jolts on named pivots ----
 const nodes={head,jaw,neck,torso,body,shL:arms.L.sh,shR:arms.R.sh,faL:arms.L.fa,faR:arms.R.fa,kneeL:legs.L.knee,kneeR:legs.R.knee,hipL:legs.L.hip,hipR:legs.R.hip,footL:legs.L.foot,footR:legs.R.foot,handL:arms.L.hand,handR:arms.R.hand};
 const base=Object.fromEntries(Object.entries(nodes).map(([k,o])=>[k,o.rotation.clone()]));
 const jolts=[];
 function jolt(name,axis,amp,freq=16,decay=3.2,t0=performance.now()/1000){jolts.push({name,axis,amp,freq,decay,t0});}
 const world=new T.Vector3();
 const targets={head:head,jaw:jaw,chest:torso,core:core,elbowL:arms.L.el,elbowR:arms.R.el,handL:arms.L.hand,handR:arms.R.hand,kneeL:legs.L.knee,kneeR:legs.R.knee,footL:legs.L.foot,footR:legs.R.foot};
 const targetNames=Object.keys(targets);
 const reactMap={head:['head','jaw'],jaw:['jaw','head'],chest:['torso','body'],core:['torso','head'],elbowL:['shL','faL'],elbowR:['shR','faR'],handL:['faL','shL'],handR:['faR','shR'],kneeL:['kneeL','hipL'],kneeR:['kneeR','hipR'],footL:['kneeL','hipL'],footR:['kneeR','hipR']};
 function nearestTarget(point){let best=targetNames[0],bd=1e9;for(const n of targetNames){targets[n].getWorldPosition(world);const d=world.distanceTo(point);if(d<bd){bd=d;best=n;}}return best;}
 function targetPos(name,out=new T.Vector3()){return targets[name].getWorldPosition(out);}
 function hit(name,strength=1,kind='shake'){
  const t=performance.now()/1000,[a,b]=reactMap[name]||['torso','head'];
  const sg=Math.random()<.5?-1:1;
  jolt(a,'x',sg*.35*strength,18,3.5,t);jolt(a,'z',-sg*.18*strength,14,3,t);
  jolt(b,'x',-sg*.22*strength,20,3.8,t);jolt('torso','z',sg*.08*strength,15,3,t);jolt('head','x',-sg*.2*strength,17,3,t);
  if(kind==='magnet'){jolt('shL','z',.5*strength,3,.9,t);jolt('shR','z',-.5*strength,3,.9,t);}
  if(kind==='tickle'){for(let i=0;i<4;i++){jolt('head','z',.1*strength,24+i*3,1.4,t);jolt('torso','z',.05*strength,26,1.4,t);}}
  shakeAmp=Math.max(shakeAmp,.07*strength);
 }
 let reflectBlend=0,distress=0,distressTarget=0,shakeAmp=0,eyeFlash=0,mood='idle',talk=0,moodBlend=0,eyeTarget=new T.Color('#ff2a1a'),eyeNow=new T.Color('#ff2a1a');
 const amber=new T.Color('#ffb347'),cool=new T.Color('#4cf2ff'),hot=new T.Color('#ff2a1a'),white=new T.Color('#fff2e8');
 function update(t,dt,speaking){
  moodBlend+=((mood==='break'?1:0)-moodBlend)*Math.min(1,dt*3);reflectBlend+=((mood==='reflect'?1:0)-reflectBlend)*Math.min(1,dt*2);
  distress+=(distressTarget-distress)*Math.min(1,dt*6);
  // sit-still sway
  const sway=Math.sin(t*.9)*.02,rest=moodBlend;
  for(const k in nodes){nodes[k].rotation.copy(base[k]);}
  head.rotation.y+=(Math.sin(t*.5)*.08*(1-rest)+Math.sin(t*.3)*.02)*(free?.25:1);
  if(free&&opts.pose)opts.pose(t,dt);
  head.rotation.x+=sway-rest*.45+reflectBlend*.42;head.rotation.y*=1-reflectBlend*.7;
  torso.rotation.x+=-rest*.12+reflectBlend*.12;
  jaw.rotation.x+=rest*.02+(speaking?Math.abs(Math.sin(t*13))*.35*Math.abs(Math.sin(t*3.3)+.4):0);
  if(distress>.02){head.rotation.x+=(Math.random()-.5)*.09*distress;head.rotation.z+=(Math.random()-.5)*.12*distress;torso.rotation.z+=Math.sin(t*38)*.035*distress;jaw.rotation.x+=Math.abs(Math.sin(t*21))*.12*distress;shakeAmp=Math.max(shakeAmp,.025*distress);if(Math.random()<.22*distress)eyeFlash=Math.max(eyeFlash,.9);}
  for(let i=jolts.length-1;i>=0;i--){const j=jolts[i],a=t-j.t0;if(a>2.5){jolts.splice(i,1);continue;}nodes[j.name].rotation[j.axis]+=j.amp*Math.exp(-j.decay*a)*Math.sin(j.freq*a);}
  shakeAmp*=Math.exp(-dt*7);body.position.set((Math.random()-.5)*shakeAmp,(Math.random()-.5)*shakeAmp*.4,(Math.random()-.5)*shakeAmp);
  if(!free)chair.position.copy(body.position).multiplyScalar(.4);
  eyeFlash*=Math.exp(-dt*5);
  eyeNow.copy(hot).lerp(cool,rest).lerp(amber,reflectBlend).lerp(white,Math.min(1,eyeFlash));
  eyeMat.color.copy(eyeNow);eyeLight.color.copy(eyeNow);eyeLight.intensity=(opts.eyeScale??1)*(6+(rest>.5?0:Math.sin(t*3)*1))*(1+eyeFlash*2)*(rest>.5?.35:1)*(1-reflectBlend*.65);
  coreMat.color.setHSL(rest>.5?.5:.03+eyeFlash*.1,1,.55+Math.sin(t*4)*.07);
  shades.visible=rest>.5;drink.visible=rest>.5;
  if(rest>.5)drink.rotation.z=Math.sin(t*1.7)*.05;
 }
 return {root,chair,nodes,hit,update,pickables,targets,targetNames,targetPos,nearestTarget,head,jaw,arms,legs,core,
  setMood(m){mood=m;},setDistress(v){distressTarget=v;},flash(v=1){eyeFlash=Math.max(eyeFlash,v);},get mood(){return mood;}};
}
