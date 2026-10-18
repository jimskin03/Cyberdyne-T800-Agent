import * as T from 'three';
import {ROOM} from './world.js';
import {createRagdoll} from './ragdoll.js';
export function createGrapple(world,body,cb){
 let enabled=false,held=false,ragdoll=null,last=null,lastCrash=-99,target=null;
 const ray=new T.Raycaster(),ndc=new T.Vector2(),plane=new T.Plane(),point=new T.Vector3(),normal=new T.Vector3();
 const hatch=new T.Vector3(.6,2.95,.3),end=new T.Vector3(),up=new T.Vector3(0,1,0);
 const rig=new T.Group(),metal=new T.MeshStandardMaterial({color:0x47545b,metalness:.8,roughness:.3}),yellow=new T.MeshStandardMaterial({color:0xe6b32d,metalness:.4,roughness:.5});
 const link=()=>{const m=new T.Mesh(new T.CylinderGeometry(.055,.075,1,10),metal);rig.add(m);return m;};
 const a=link(),b=link(),joint=new T.Mesh(new T.SphereGeometry(.13,12,8),yellow),claw=new T.Group();rig.add(joint,claw);
 for(const s of [-1,1]){const jaw=new T.Mesh(new T.BoxGeometry(.08,.35,.16),yellow);jaw.position.set(s*.18,-.1,0);jaw.rotation.z=s*.25;claw.add(jaw);}
 rig.visible=false;world.scene.add(rig);
 const canvas=world.renderer.domElement;
 function position(e){ndc.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(ndc,world.povMain?world.pov:world.camera);}
 function override(){if(!ragdoll)return;const p=ragdoll.center;body.st.x=p.x;body.st.z=p.z;body.st.external={ragdoll:true};}
 canvas.addEventListener('pointerdown',e=>{if(!enabled||cb.canGrab?.()===false)return;position(e);const hit=ray.intersectObjects(world.bot.pickables,false)[0];if(!hit)return;
  e.preventDefault();e.stopImmediatePropagation();canvas.setPointerCapture(e.pointerId);world.controls.enabled=false;
  held=true;if(!ragdoll)ragdoll=createRagdoll(world.bot,world.scene,ROOM,world.RECTS,hit=>{const t=performance.now()/1000;if(t-lastCrash>.3){lastCrash=t;cb.crash?.(hit);}});target=hit.point.clone();ragdoll.grab(hit.object,target);last={point:target.clone(),at:performance.now(),velocity:new T.Vector3()};
  plane.setFromNormalAndCoplanarPoint((world.povMain?world.pov:world.camera).getWorldDirection(normal),last.point);body.stop();body.clearGesture();body.setPosture('stand');body.st.seat=null;if(body.st.holding)body.release(new T.Vector3(0,1,0));
  rig.visible=true;cb.grab?.();override();
 },true);
 canvas.addEventListener('pointermove',e=>{if(!held)return;e.preventDefault();e.stopImmediatePropagation();position(e);if(!ray.ray.intersectPlane(plane,point))return;
  point.x=T.MathUtils.clamp(point.x,ROOM.x0+.3,ROOM.x1-.3);point.y=T.MathUtils.clamp(point.y,1.1,ROOM.h-.9);point.z=T.MathUtils.clamp(point.z,ROOM.z0+.3,ROOM.z1-.3);
  const now=performance.now(),delta=Math.max(.016,(now-last.at)/1000);target.copy(point);const v=point.clone().sub(last.point).divideScalar(delta);v.clampLength(0,15);ragdoll.move(target,delta);last={point:point.clone(),at:now,velocity:v};
 },true);
 function release(){if(!held)return;held=false;world.controls.enabled=true;rig.visible=false;const velocity=performance.now()-last.at<180?last.velocity:new T.Vector3();ragdoll.release(velocity);cb.throw?.(Math.max(velocity.length(),...ragdoll.parts.map(p=>p.rb.velocity.length())));}
 canvas.addEventListener('pointerup',e=>{if(!held)return;e.preventDefault();e.stopImmediatePropagation();release();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);},true);
 canvas.addEventListener('pointercancel',release,true);addEventListener('blur',release);
 function segment(mesh,from,to){mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.scale.y=from.distanceTo(to);mesh.quaternion.setFromUnitVectors(up,to.clone().sub(from).normalize());}
 function update(t,dt){if(!ragdoll)return;const status=ragdoll.update(dt);override();if(held){end.copy(ragdoll.heldPoint||target);const elbow=hatch.clone().lerp(end,.5).add(new T.Vector3(.35,.1,0));segment(a,hatch,elbow);segment(b,elbow,end);joint.position.copy(elbow);claw.position.copy(end);}
  for(const p of ragdoll.parts){const rb=p.rb;world.knockItems?.(new T.Vector3(rb.position.x,rb.position.y,rb.position.z),new T.Vector3(rb.velocity.x,rb.velocity.y,rb.velocity.z));}
  if(!held&&status.settled){const p=ragdoll.center;body.st.x=p.x;body.st.z=p.z;ragdoll.restore();ragdoll=null;body.st.external=null;body.st.posture='stand';body.st.seat=null;body.stop();cb.land?.();}
 }
 world.setPhysicsPose?.(()=>ragdoll?.sync());
 function launch(direction,strength=6,part='torso'){
  if(cb.canGrab?.()===false)return false;
  held=false;rig.visible=false;body.stop();body.clearGesture();body.st.aim=null;
  if(body.st.holding)body.release(new T.Vector3(0,1,0));
  if(!ragdoll)ragdoll=createRagdoll(world.bot,world.scene,ROOM,world.RECTS,hit=>{const t=performance.now()/1000;if(t-lastCrash>.3){lastCrash=t;cb.crash?.(hit);}});
  const d=direction.clone().setY(0);if(d.lengthSq()<.001)d.set(0,0,1);d.normalize();
  for(const p of ragdoll.parts){p.rb.wakeUp();p.rb.velocity.set(d.x*strength,2.8,d.z*strength);}
  const struck=ragdoll.records.get(part)||ragdoll.records.get('torso');struck.rb.angularVelocity.set(d.z*5,3,-d.x*5);
  override();return true;
 }
 function settle(){held=false;enabled=false;rig.visible=false;world.controls.enabled=true;if(ragdoll){const p=ragdoll.center;body.st.x=p.x;body.st.z=p.z;ragdoll.restore();ragdoll=null;}body.st.external=null;body.stop();const safe=body.freeSpotNear(body.st.x,body.st.z);body.st.x=safe[0];body.st.z=safe[1];body.setPosture('stand');}
 return{update,release,settle,launch,setEnabled(on){enabled=!!on;if(!enabled)release();},get enabled(){return enabled;},get active(){return!!ragdoll;},get held(){return held;},get ragdoll(){return ragdoll;}};
}
