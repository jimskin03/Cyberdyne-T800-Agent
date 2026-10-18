import * as C from 'cannon-es';
import * as T from 'three';
const vector=p=>new C.Vec3(p.x,p.y,p.z);
const specs=[['body',[0,1.3,0],[.20,.13,.15],12],['torso',[0,0,0],[.24,.22,.14],15],['head',[0,.1,0],[.16,.20,.16],5],...['L','R'].flatMap(s=>[[`sh${s}`,[0,-.4,0],[.065,.152,.065],3],[`fa${s}`,[0,-.48,0],[.065,.205,.075],2],[`hip${s}`,[0,-.5,0],[.075,.19,.075],5],[`knee${s}`,[0,-.62,.03],[.065,.24,.10],3]])];
export function createRagdoll(bot,scene,room,furniture=[],onImpact=()=>{},options={}){
 const world=new C.World({gravity:new C.Vec3(0,-9.81,0),allowSleep:true});world.solver.iterations=28;world.solver.tolerance=.00001;
 const material=new C.Material('robot');world.defaultContactMaterial.friction=.6;world.defaultContactMaterial.restitution=.16;
 const records=new Map(),saved=[],parts=[];let grabJoint=null,handle=null,handleTarget=null,grabbed=null,quiet=0,elapsed=0;
 function box(half,pos,kind){const b=new C.Body({mass:0,shape:new C.Box(vector(half)),position:vector(pos),collisionFilterGroup:1,collisionFilterMask:2});b.kind=kind;world.addBody(b);}
 box({x:room.x1-room.x0,y:.1,z:room.z1-room.z0},{x:0,y:-.1,z:0},'floor');
 if(!options.outdoors){box({x:room.x1-room.x0,y:.1,z:room.z1-room.z0},{x:0,y:room.h+.1,z:0},'ceiling');
 for(const x of [room.x0-.1,room.x1+.1])box({x:.1,y:room.h/2,z:room.z1-room.z0},{x,y:room.h/2,z:0},'wall');for(const z of [room.z0-.1,room.z1+.1])box({x:room.x1-room.x0,y:room.h/2,z:.1},{x:0,y:room.h/2,z},'wall');
 }
 for(const f of furniture)box({x:(f.x1-f.x0)/2,y:f.h/2,z:(f.z1-f.z0)/2},{x:(f.x1+f.x0)/2,y:f.h/2,z:(f.z1+f.z0)/2},f.id||'furniture');
 bot.root.updateMatrixWorld(true);
 // Snapshot every segment before detaching any parent, preserving current seated/standing pose.
 for(const[key,offset,half,mass]of specs){const node=bot.nodes[key];if(!node)continue;const q=node.getWorldQuaternion(new T.Quaternion()),scale=node.getWorldScale(new T.Vector3()),origin=node.getWorldPosition(new T.Vector3()),local=new T.Vector3(...offset).multiply(scale),center=local.clone().applyQuaternion(q).add(origin);saved.push({node,parent:node.parent,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()});
  const size=options.shapeScale??1;
  const rb=new C.Body({mass,material,shape:new C.Box(vector({x:half[0]*size,y:half[1]*size,z:half[2]*size})),position:vector(center),collisionFilterGroup:2,collisionFilterMask:1,linearDamping:options.linearDamping??.16,angularDamping:options.angularDamping??.28,allowSleep:true,sleepSpeedLimit:.2,sleepTimeLimit:.7});rb.quaternion.set(q.x,q.y,q.z,q.w);rb.addEventListener('collide',e=>{const speed=Math.abs(e.contact.getImpactVelocityAlongNormal());if(speed>1.8)onImpact({kind:e.body.kind||'object',speed,part:key});});world.addBody(rb);const rec={key,node,rb,local,origin,scale};records.set(key,rec);parts.push(rec);
 }
 function joint(a,b,p,angle){const A=records.get(a),B=records.get(b);if(!A||!B)return;const pivot=vector(p),axis=new C.Vec3(0,1,0);const c=new C.ConeTwistConstraint(A.rb,B.rb,{pivotA:A.rb.pointToLocalFrame(pivot),pivotB:B.rb.pointToLocalFrame(pivot),axisA:A.rb.vectorToLocalFrame(axis),axisB:B.rb.vectorToLocalFrame(axis),angle,twistAngle:angle*.7,maxForce:1e5,collideConnected:false});world.addConstraint(c);}
 const orig=k=>records.get(k)?.origin;
 joint('body','torso',orig('torso'),.3);joint('torso','head',orig('head'),.65);
 for(const s of ['L','R']){joint('torso','sh'+s,orig('sh'+s),1.9);joint('sh'+s,'fa'+s,orig('fa'+s),1.55);joint('body','hip'+s,orig('hip'+s),1.2);joint('hip'+s,'knee'+s,orig('knee'+s),1.45);}
 for(const rec of parts)scene.attach(rec.node);
 function sync(){for(const rec of parts){const {rb,node,local}=rec;node.quaternion.set(rb.quaternion.x,rb.quaternion.y,rb.quaternion.z,rb.quaternion.w);node.position.set(rb.position.x,rb.position.y,rb.position.z).sub(local.clone().applyQuaternion(node.quaternion));node.scale.copy(rec.scale);node.updateMatrixWorld(true);}}
 function pick(mesh){let o=mesh;while(o){const r=parts.find(r=>r.node===o);if(r)return r;o=o.parent;}return records.get('torso')||parts[0];}
 function grab(mesh,point){release();const rec=pick(mesh);if(!rec)return false;handle=new C.Body({mass:0,type:C.Body.KINEMATIC,position:vector(point),collisionFilterGroup:0,collisionFilterMask:0});world.addBody(handle);handleTarget=point.clone();grabbed=rec.rb;grabJoint=new C.PointToPointConstraint(rec.rb,rec.rb.pointToLocalFrame(vector(point)),handle,new C.Vec3(),2e5);grabJoint.collideConnected=false;world.addConstraint(grabJoint);for(const p of parts)p.rb.wakeUp();quiet=0;return true;}
 function move(point,dt){if(!handle)return;handleTarget.copy(point);const d=vector(point).vsub(handle.position);d.scale(1/Math.max(.016,dt),handle.velocity);const speed=handle.velocity.length();if(speed>15)handle.velocity.scale(15/speed,handle.velocity);}
 function release(velocity){if(grabJoint){if(velocity?.length()>1)grabbed.velocity.copy(vector(velocity));world.removeConstraint(grabJoint);world.removeBody(handle);grabJoint=null;handle=null;handleTarget=null;grabbed=null;}for(const p of parts)p.rb.wakeUp();quiet=0;}
 function update(dt){elapsed+=dt;if(handle)move(handleTarget,dt);world.step(1/120,Math.min(.06,Math.max(0,dt)),8);sync();const speed=Math.max(...parts.map(p=>p.rb.velocity.length()+p.rb.angularVelocity.length()*.1));quiet=!grabJoint&&speed<.3?quiet+dt:0;return {settled:quiet>.75&&elapsed>1.2,speed};}
 function restore(){release();for(const p of parts)world.removeBody(p.rb);for(const s of saved){s.parent.add(s.node);s.node.position.copy(s.position);s.node.quaternion.copy(s.quaternion);s.node.scale.copy(s.scale);}bot.root.updateMatrixWorld(true);}
 return {world,parts,records,grab,move,release,update,sync,restore,get center(){const p=(records.get('body')||parts[0]).rb.position;return new T.Vector3(p.x,p.y,p.z);},get heldPoint(){return handle?new T.Vector3(handle.position.x,handle.position.y,handle.position.z):null;}};
}
