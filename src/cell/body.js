import * as T from 'three';
import {waterReaction} from './water-reaction.js';
import {createNavigation} from './navigation.js';
import {S,ROOM} from './world.js';

// Drives the free T-800: where he stands, how he walks, how he sits / crouches / lies down, where his head looks,
// and what his arms are doing. Everything is procedural and blended, so actions can be interrupted at any moment.
const R=.27;                                   // his footprint radius in metres
const lerp=(a,b,k)=>a+(b-a)*k,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrapA=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;};
const ease=x=>x<0?0:x>1?1:x*x*(3-2*x);
const POSTURE={ // hip / knee in radians, torso lean, root height rule
 stand:{hip:0,knee:0,lean:0},
 crouch:{hip:-1.3,knee:2.15,lean:.5},
 half:{hip:-.55,knee:1.0,lean:.45},
 sit:{hip:-1.5,knee:1.5,lean:.06},
 floor:{hip:-2.05,knee:2.55,lean:.42},
 lie:{hip:0,knee:.12,lean:0},
};
// arm / head poses. Values add onto the standing rest pose. sh/fa x<0 swings forward, sh z raises sideways (sign per side).
const GEST={
 hold:   ()=>({shR:[-.35,0,0],faR:[-1.05,0,0]}),
 hold2:  ()=>({shR:[-.45,0,-.15],faR:[-1.25,0,0],shL:[-.45,0,.15],faL:[-1.25,0,0],head:[.45,0,0]}),
 reach:  ()=>({shR:[-1.0,0,0],faR:[-.25,0,0]}),
 reachUp:()=>({shR:[-2.4,0,0],faR:[-.1,0,0]}),
 throw:  k=>{const w=k<.45?ease(k/.45):1;const fw=k<.45?0:ease((k-.45)/.25);return {shR:[lerp(1.3*w,-1.9,fw),0,0],faR:[lerp(-1.4*w,-.2,fw),0,0],torso:[0,lerp(.35*w,-.3,fw),0]};},
 wave:   (k,t)=>({shR:[-.2,0,2.6],faR:[0,0,Math.sin(t*9)*.5],head:[0,0,.08]}),
 shrug:  (k,t)=>({shR:[-.3,0,.25],faR:[-1.3,.6,0],shL:[-.3,0,-.25],faL:[-1.3,-.6,0],head:[0,0,.15]}),
 nod:    (k,t)=>({head:[Math.sin(t*7)*.22,0,0]}),
 shake_head:(k,t)=>({head:[0,Math.sin(t*8)*.4,0]}),
 cover_face:()=>({shR:[-1.1,0,-.2],faR:[-2.1,0,0],shL:[-1.1,0,.2],faL:[-2.1,0,0],head:[.4,0,0],torso:[.15,0,0]}),
 stretch:(k,t)=>({shR:[-.3,0,2.9],shL:[-.3,0,-2.9],faR:[0,0,0],faL:[0,0,0],head:[-.3,0,0],torso:[-.12,0,0]}),
 point:  ()=>({shR:[-1.55,0,0],faR:[0,0,0]}),
 fists:  (k,t)=>({shR:[-.4,0,.1],faR:[-1.7+Math.sin(t*30)*.04,0,0],shL:[-.4,0,-.1],faL:[-1.7,0,0],torso:[.08,0,0]}),
 knock:  (k,t)=>({shR:[-1.35,0,0],faR:[-1.1+Math.max(0,Math.sin(t*14))*.5,0,0]}),
 punch:  (k)=>({shR:[k<.3?.6:-1.6,0,0],faR:[k<.3?-1.6:-.1,0,0],torso:[0,k<.3?.3:-.25,0]}),
 hug_knees:()=>({shR:[-.75,0,-.1],faR:[-1.25,0,0],shL:[-.75,0,.1],faL:[-1.25,0,0],head:[.35,0,0]}),
 rub_head:(k,t)=>({shR:[-2.2,0,.4],faR:[-1.4+Math.sin(t*6)*.2,0,0],head:[.25,0,0]}),
 clap:   (k,t)=>({shR:[-1.1,0,-.35-Math.max(0,Math.sin(t*10))*.2],faR:[-.6,0,0],shL:[-1.1,0,.35+Math.max(0,Math.sin(t*10))*.2],faL:[-.6,0,0]}),
 salute: ()=>({shR:[-1.4,0,1.2],faR:[-2.2,0,0]}),
 dance:  (k,t)=>({shR:[-.5+Math.sin(t*6)*.8,0,.6],shL:[-.5-Math.sin(t*6)*.8,0,-.6],faR:[-1.2,0,0],faL:[-1.2,0,0],torso:[0,Math.sin(t*3)*.3,Math.sin(t*6)*.08],head:[0,Math.sin(t*3+1)*.3,0]}),
 write:  (k,t)=>({shR:[-1.6+Math.sin(t*5)*.12,0,Math.cos(t*7)*.12],faR:[-.35,0,0],head:[.1,0,0]}),
 grip_bars:()=>({shR:[-2.0,0,.25],faR:[-.35,0,0],shL:[-2.0,0,-.25],faL:[-.35,0,0],torso:[.08,0,0]}),
 lean_sill:()=>({shR:[-1.0,0,.1],faR:[-.55,0,0],shL:[-1.0,0,-.1],faL:[-.55,0,0],torso:[.25,0,0]}),
 twist:  (k,t)=>({shR:[-.5,0,-.15],faR:[-1.35,Math.sin(t*9)*.6,0],shL:[-.5,0,.15],faL:[-1.35,0,0],head:[.5,0,0]}),
 bounce: (k,t)=>({shR:[-.55,0,0],faR:[-.9+Math.sin(t*7)*.35,0,0],head:[.35,0,0]}),
 shuffle:(k,t)=>({shR:[-.5,0,-.2],faR:[-1.3+Math.sin(t*16)*.12,0,0],shL:[-.5,0,.2],faL:[-1.3,0,0],head:[.5,0,0]}),
 touch:  (k,t)=>({shR:[-1.05,0,0],faR:[-.45+Math.sin(t*3)*.1,0,0]}),
 guard:  (k,t)=>({shR:[-1.2,0,-.3],faR:[-1.9,0,0],shL:[-1.2,0,.3],faL:[-1.9,0,0],torso:[.2,0,0],head:[.3,0,0]}),
 pour:   ()=>({shR:[-1.1,0,0],faR:[-.5,0,-1.1]}),
 kick:   (k)=>({hipR:[k<.35?.5:-1.1,0,0],kneeR:[k<.35?.9:.1,0,0],torso:[-.1,0,0]}),
 look_around:(k,t)=>({head:[0,Math.sin(t*1.3)*.9,0]}),
 drink:  ()=>({shR:[-1.4,0,-.3],faR:[-1.9,0,-.4],head:[-.3,0,0]}),
 hand_on_glass:()=>({shR:[-1.6,0,0],faR:[-.2,0,0]}),
 type:   (k,t)=>({shR:[-.8,0,-.12],faR:[-.95+Math.sin(t*26)*.07,0,0],shL:[-.8,0,.12],faL:[-.95+Math.sin(t*23+1.3)*.07,0,0],head:[.18,Math.sin(t*.7)*.08,0],torso:[.1,0,0]}),
};

export function createBody(world,cb){
 const bot=world.bot,root=bot.root,n=bot.nodes;
 const st={x:0,z:.25,heading:Math.PI,posture:'stand',seat:null,lieOn:null,holding:null,path:[],speed:1,moving:false,stepPhase:0,lastStepSign:1,
  look:null,lookUntil:0,aim:null,aimW:0,yaw:0,pitch:0,gesture:null,gw:0,walkW:0,push:new T.Vector2(),seatH:0,turnTo:null,exertion:0};
 const nav=createNavigation(ROOM,world.RECTS,world.CIRCLES,R);st.navigation={status:'idle',reason:'',distanceTravelled:0,remaining:0};
 const P={hip:0,knee:0,lean:0,y:.91*S,lie:0,lieY:0};
 let last={hip:0,knee:0,lean:0};
 const blocked=nav.blocked;
 function freeSpotNear(x,z){return nav.closestFree(x,z)||[st.x,st.z];}
 function moveSafely(dx,dz){const from=[st.x,st.z],to=[st.x+dx,st.z+dz];if(nav.segmentClear(from,to)){st.x=to[0];st.z=to[1];return true;}return false;}
 // ---------- commands (the action layer awaits these with until()) ----------
 function walkTo(x,z,speed=1){standUpNow();if(!st.rising&&nav.blocked(st.x,st.z)){const free=nav.closestFree(st.x,st.z);if(free)st.rising={from:[st.x,st.z],to:free,elapsed:0,recovery:true};}const start=st.rising?st.rising.to:[st.x,st.z],result=nav.route(start,[x,z]);st.navigation={...result,requested:[x,z],distanceTravelled:0,remaining:result.length||0,stalled:0,recovering:!!st.rising?.recovery};st.path=result.path;st.speed=Math.max(.1,Number(speed)||1);st.moving=result.status!=='failed';st.turnTo=null;st.look=null;return result.status!=='failed';}
 function stop(){st.path=[];st.rising=null;st.moving=false;st.manualDrive=null;if(st.navigation.status==='moving')st.navigation.status='cancelled';}
 function drive(dx,dz,heading){st.manualDrive={dx,dz,heading};}
 function face(angle){st.look=null;st.turnTo=angle;}
 function facePoint(p){face(Math.atan2(p.x-st.x,p.z-st.z));}
 function lookAt(p,sec=3){st.look=p?p.clone():null;st.lookUntil=performance.now()/1000+sec;}
 function gesture(name,dur=1.5,loop=false){if(!GEST[name])name='look_around';st.gesture={name,t0:performance.now()/1000,dur,loop};}
 function clearGesture(){st.gesture=null;}
 function setPosture(p,seat=null){st.posture=p;st.seat=seat;}
 function standUpNow(){if(st.posture==='lie'||st.posture==='sit'||st.posture==='floor'){const seat=st.seat;st.posture='stand';if(seat?.exit&&Math.hypot(st.x-seat.exit[0],st.z-seat.exit[1])>.04)st.rising={from:[st.x,st.z],to:freeSpotNear(...seat.exit),elapsed:0};st.seat=null;}else if(st.posture!=='stand')st.posture='stand';}
 const facingErr=()=>st.turnTo==null?0:Math.abs(wrapA(st.turnTo-st.heading));
 // holding things
 const holdOff=new T.Vector3(0,-.36,.1);
 function grab(it){if(st.holding)release();it.held=true;it.moving=false;it.vel.set(0,0,0);bot.targets.handR.attach(it.obj);it.obj.position.copy(holdOff);it.obj.rotation.set(0,0,0);st.holding=it;cb.sfx('click');}
 function release(vel){const it=st.holding;if(!it)return null;world.scene.attach(it.obj);it.held=false;st.holding=null;it.obj.rotation.set(0,it.obj.rotation.y,0);if(vel){it.vel.copy(vel);}else it.vel.set(0,0,0);it.moving=true;return it;}
 function placeAt(x,y,z){const it=release();if(!it)return;it.obj.position.set(x,y+(it.floorOffset??it.r),z);world.repairItem?.(it);it.vel.set(0,0,0);it.moving=true;}
 const handPos=(o=new T.Vector3())=>bot.targets.handR.localToWorld(o.copy(holdOff));
 function flinch(from){const dx=st.x-from.x,dz=st.z-from.z,d=Math.hypot(dx,dz)||1;st.push.set(dx/d*1.4,dz/d*1.4);if(st.posture!=='lie'&&st.posture!=='sit'&&st.posture!=='floor')gesture('guard',.9);}

 // ---------- per-frame pose ----------
 function pose(t,dt){
  if(st.external?.ragdoll)return;
  if(st.external){root.position.set(st.x,st.external.y,st.z);root.rotation.set(st.external.rx,st.heading,st.external.rz);n.shL.rotation.z=1.8+Math.sin(t*18)*.5;n.shR.rotation.z=-1.8+Math.cos(t*19)*.5;n.hipL.rotation.x=Math.sin(t*15)*.7;n.hipR.rotation.x=-Math.sin(t*15)*.7;return;}
  // Turn toward the next exact collision-free segment before translating along it.
  const before=[st.x,st.z];let turning=0;
  const driveStep=st.manualDrive;st.manualDrive=null;
  if(driveStep&&!st.rising&&st.posture==='stand'&&!st.seat){
    st.heading=driveStep.heading;st.turnTo=null;st.path=[];st.look=null;
    const {dx,dz}=driveStep;
    if(dx||dz){if(!moveSafely(dx,dz)){if(!moveSafely(dx,0))moveSafely(0,dz);}}
    st.moving=Math.hypot(st.x-before[0],st.z-before[1])>1e-4;
    if(st.navigation.status==='moving')st.navigation.status='cancelled';
  }else if(st.rising){st.rising.elapsed+=dt;const k=ease(st.rising.elapsed/.65);st.x=lerp(st.rising.from[0],st.rising.to[0],k);st.z=lerp(st.rising.from[1],st.rising.to[1],k);if(k>=1){st.rising=null;st.navigation.recovering=false;}}
  else if(st.posture==='stand'&&st.path.length){
   const [tx,tz]=st.path[0],dx=tx-st.x,dz=tz-st.z,dist=Math.hypot(dx,dz);
   if(dist<1e-5){st.path.shift();if(!st.path.length){st.moving=false;st.navigation.status='arrived';st.navigation.remaining=0;}}
   else{const want=Math.atan2(dx,dz),err=wrapA(want-st.heading),turn=clamp(err,-dt*4.2,dt*4.2);st.heading=wrapA(st.heading+turn);turning=Math.abs(turn)*.06;
    if(Math.abs(wrapA(want-st.heading))<.3){const step=Math.min(dist,st.speed*dt);if(!moveSafely(dx/dist*step,dz/dist*step)){st.path=[];st.moving=false;st.navigation.status='failed';st.navigation.reason='a movement segment became obstructed';}}
   }
  }else if(st.turnTo!=null&&st.posture==='stand'){const err=wrapA(st.turnTo-st.heading),turn=clamp(err,-dt*3,dt*3);st.heading=wrapA(st.heading+turn);turning=Math.abs(turn)*.08;if(Math.abs(wrapA(st.turnTo-st.heading))<.03)st.turnTo=null;}
  else if(st.turnTo!=null)st.turnTo=null;
  if(!st.rising&&st.push.lengthSq()>1e-4){moveSafely(st.push.x*dt,st.push.y*dt);st.push.multiplyScalar(Math.exp(-dt*6));}
  const moved=Math.hypot(st.x-before[0],st.z-before[1])+turning;
  if(st.navigation.status==='moving'&&!st.rising){st.navigation.distanceTravelled+=Math.hypot(st.x-before[0],st.z-before[1]);st.navigation.stalled=moved<1e-5?st.navigation.stalled+dt:0;let remaining=0,prev=[st.x,st.z];for(const p of st.path){remaining+=Math.hypot(p[0]-prev[0],p[1]-prev[1]);prev=p;}st.navigation.remaining=remaining;if(st.navigation.stalled>2){st.path=[];st.moving=false;st.navigation.status='failed';st.navigation.reason='no physical progress for two seconds';}}
  if(st.posture==='stand'&&!st.seat&&!st.rising)world.pushItems(st.x,st.z,.16);
  st.walkW=lerp(st.walkW,moved>1e-4?1:0,Math.min(1,dt*8));st.exertion=lerp(st.exertion,moved>1e-4?1:0,dt*.2);
  st.stepPhase+=moved/.62*Math.PI;const sg=Math.sign(Math.sin(st.stepPhase));if(sg!==st.lastStepSign&&st.walkW>.4){st.lastStepSign=sg;cb.sfx('step');}
  // posture blend
  const tgt=POSTURE[st.posture]||POSTURE.stand,k=Math.min(1,dt*5);
  P.hip=lerp(P.hip,tgt.hip,k);P.knee=lerp(P.knee,tgt.knee,k);P.lean=lerp(P.lean,tgt.lean,k);P.lie=lerp(P.lie,st.posture==='lie'?1:0,Math.min(1,dt*2.5));
  if(st.seat){st.x=lerp(st.x,st.seat.pos[0],k);st.z=lerp(st.z,st.seat.pos[1],k);if(st.seat.face!=null)st.heading=wrapA(st.heading+wrapA(st.seat.face-st.heading)*k);}
  const w=st.walkW,ph=st.stepPhase,sn=Math.sin(ph),cs=Math.cos(ph);
  const hipL=P.hip-sn*.5*w,hipR=P.hip+sn*.5*w,kneeL=P.knee+Math.max(0,cs)*.8*w,kneeR=P.knee+Math.max(0,-cs)*.8*w;
  n.hipL.rotation.x+=hipL;n.hipR.rotation.x+=hipR;n.kneeL.rotation.x+=kneeL;n.kneeR.rotation.x+=kneeR;
  n.footL.rotation.x+=-(hipL+kneeL)*.6;n.footR.rotation.x+=-(hipR+kneeR)*.6;
  n.shL.rotation.x+=sn*.35*w;n.shR.rotation.x+=-sn*.35*w;n.torso.rotation.z+=sn*.025*w;n.torso.rotation.x+=P.lean;
  if(st.posture==='floor'){n.torso.rotation.x+=0;}
  // root height: the planted leg carries him; seated / floor / lying override
  const legH=(h,k2)=>Math.cos(h)+1.1*Math.cos(h+k2)+.11-1.3;
  let y=S*Math.max(legH(hipL,kneeL),legH(hipR,kneeR));
  if(st.posture==='sit')y=(st.seatH||.47)-1.3*S+.03;
  if(st.posture==='floor')y=-1.3*S+.1;
  const lieY=(st.lieOn==='bed'?.47:0)+.4*S;
  root.position.set(st.x,lerp(y,lieY,P.lie),st.z);
  root.rotation.y=st.lieOn&&P.lie>.01?lerp(st.heading,st.lieHeading??0,P.lie):st.heading;root.rotation.x=-Math.PI/2*P.lie;root.rotation.z=0;
  // head look (yaw / pitch relative to the body), body turns to help when the target is far behind
  let wy=0,wp=0;const now=performance.now()/1000;
  const target=st.look&&now<st.lookUntil?st.look:null;
  if(target){const e=bot.head.getWorldPosition(new T.Vector3());const dx=target.x-e.x,dy=target.y-e.y,dz=target.z-e.z;
   if(P.lie>.5){wp=-clamp(Math.atan2(Math.hypot(dx,dz),dy)-.2,-.6,.6)*.5;}
   else{const rel=wrapA(Math.atan2(dx,dz)-st.heading);wy=clamp(rel,-1.25,1.25);wp=clamp(-Math.atan2(dy,Math.hypot(dx,dz)),-.85,1.0);
    if(Math.abs(rel)>1.35&&st.posture==='stand'&&!st.path.length&&st.turnTo==null)st.turnTo=wrapA(st.heading+rel*.8);}}
  st.yaw=lerp(st.yaw,wy,Math.min(1,dt*4));st.pitch=lerp(st.pitch,wp,Math.min(1,dt*4));
  n.head.rotation.y+=st.yaw*.75;n.neck.rotation.y+=st.yaw*.25;n.head.rotation.x+=st.pitch*.8;n.neck.rotation.x+=st.pitch*.2;
  if(st.posture==='floor')n.head.rotation.x-=.2;
  // gestures, blended in and out
  const g=st.gesture;let gk=0,offs=null;
  if(g){const e=now-g.t0;if(!g.loop&&e>g.dur){st.gesture=null;}else{gk=g.loop?Math.min(1,e/.3):Math.min(1,e/.25,Math.max(0,(g.dur-e)/.3));offs=GEST[g.name](g.loop?(e%2)/2:e/g.dur,t);}}
  st.gw=lerp(st.gw,g?1:0,Math.min(1,dt*6));
  let holdO=null;if(st.holding&&(!offs||!offs.shR))holdO=(st.holding.id==='book'||st.holding.id==='cube'||st.holding.id==='cards')&&!st.path.length?GEST.hold2():GEST.hold();
  let ow=gk;if(st.posture==='floor'&&!offs){offs=GEST.hug_knees();ow=Math.min(1,P.hip/-2);}
  for(const [src,wgt] of [[offs,ow],[holdO,1]]){if(!src)continue;for(const [node,v] of Object.entries(src)){const o=n[node];if(!o)continue;o.rotation.x+=v[0]*wgt;o.rotation.y+=v[1]*wgt;o.rotation.z+=v[2]*wgt;}}
  // reaching for a point (the chalk tip on the wall): point the right arm straight at it, solved in the torso's frame
  if(st.aim){const sh=n.shR.getWorldPosition(aV1),d=aV2.copy(st.aim).sub(sh).normalize().applyQuaternion(n.torso.getWorldQuaternion(aQ).invert());
   const tz=Math.asin(clamp(d.x,-.95,.95)),tx=Math.atan2(-d.z,-d.y);st.aimW=lerp(st.aimW||0,1,Math.min(1,dt*10));const w2=st.aimW;
   n.shR.rotation.x=lerp(n.shR.rotation.x,tx,w2);n.shR.rotation.y=0;n.shR.rotation.z=lerp(n.shR.rotation.z,tz,w2);n.faR.rotation.x=lerp(n.faR.rotation.x,0,w2);n.faR.rotation.z=0;}
  else st.aimW=0;
  if(st.coldShiver>0){const c=st.coldShiver;n.torso.rotation.z+=Math.sin(t*41)*.025*c;n.head.rotation.y+=Math.sin(t*37)*.04*c;n.shL.rotation.x+=Math.sin(t*43)*.045*c;n.shR.rotation.x-=Math.sin(t*43)*.045*c;n.jaw.rotation.x+=Math.abs(Math.sin(t*34))*.07*c;}
  if(st.waterReaction>0 && st.posture==='lie' && st.lieOn==='bed'){
   const strength=st.waterReaction*P.lie;
   for(const [key,v] of Object.entries(waterReaction(t,strength,st.waterSeed||0))){const o=n[key];o.rotation.x+=v[0];o.rotation.y+=v[1];o.rotation.z+=v[2];}
   root.position.x+=Math.sin(t*43)*.008*strength;
   root.position.y+=Math.abs(Math.sin(t*36))*.008*strength;
  }
 }
 const aV1=new T.Vector3(),aV2=new T.Vector3(),aQ=new T.Quaternion();
 world.setPose(pose);

 function describe(){
  const dirs=['south','south-east','east','north-east','north','north-west','west','south-west'];
  const deg=((Math.atan2(Math.sin(st.heading),Math.cos(st.heading))*180/Math.PI)+360)%360;const facing=dirs[Math.round(deg/45)%8];
  let near='the middle of the cell',best=1e9;for(const [id,f] of Object.entries(world.features)){if(id==='center')continue;const d=Math.hypot(f.stand[0]-st.x,f.stand[1]-st.z);if(d<best){best=d;near=f.name;}}
  if(best>.9)near='the open floor'+(best<1.6?' (closest: '+near+')':'');
  const post={stand:st.moving?'walking':'standing',crouch:'crouching',half:'bending down',sit:'sitting'+(st.seat?' on '+st.seat.name:''),floor:'sitting on the floor, knees pulled up',lie:'lying on '+(st.lieOn==='bed'?'the bed':'the floor')}[st.posture];
  return {facing,near,posture:st.external?'suspended or tumbling through the room':post,holding:st.holding?st.holding.name:'nothing',x:st.x.toFixed(1),z:st.z.toFixed(1)};
 }
 return {st,walkTo,stop,drive,face,facePoint,lookAt,gesture,clearGesture,setPosture,standUpNow,grab,release,placeAt,handPos,flinch,describe,blocked,freeSpotNear,facingErr,
  get navigation(){return st.navigation;},get arrived(){return !st.path.length&&!st.rising;},get turned(){return st.turnTo==null;}};
}
