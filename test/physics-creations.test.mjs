import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {stepFlight} from '../src/cell/throw-physics.js';
import {validateCreation} from '../src/cell/creation-model.js';
import {parseCreation,buildMessages} from '../src/cell/mind.js';
const room={x0:-2.5,x1:2.5,z0:-2,z1:2,h:3};
test('fast throws bounce off walls and furniture and settle inside the room',()=>{
 const f={x:0,y:1.2,z:0,vx:13,vy:6,vz:-12,settled:false};let hits=[];
 for(let i=0;i<1500&&!f.settled;i++){hits.push(...stepFlight(f,1/60,room,[{x0:1.2,x1:2.3,z0:-1.7,z1:-1.1,h:.75,id:'table'}]));assert.ok(f.x>=-2.2&&f.x<=2.2&&f.z>=-1.7&&f.z<=1.7);assert.ok(Number.isFinite(f.y)&&f.y>=.9);}
 assert.ok(f.settled);assert.ok(hits.some(h=>h.kind==='wall'));assert.ok(hits.some(h=>h.kind==='floor'));
 const low={x:0,y:1,z:0,vx:12,vy:0,vz:0};const collisions=stepFlight(low,.1,room,[{x0:.6,x1:1.2,z0:-.5,z1:.5,h:.7,id:'table'}]);assert.ok(collisions.some(h=>h.kind==='table'));assert.ok(low.vx<0);
});
test('procedural objects normalize to room scale and preserve mesh detail after serialization',()=>{
 const g=new T.Group();const m=new T.Mesh(new T.BoxGeometry(4,2,3),new T.MeshStandardMaterial({color:'red'}));m.position.y=1;g.add(m);
 const model=validateCreation(g.toJSON());const b=new T.Box3().setFromObject(model),size=b.getSize(new T.Vector3());assert.ok(Math.max(...size.toArray())<=1.250001);assert.ok(Math.abs(b.min.y)<.00001);assert.equal(model.children[0].children.length,1);
 assert.throws(()=>validateCreation({...g.toJSON(),images:[{}]}),/textures/);
 const bad=g.toJSON();bad.object.matrix[0]=Infinity;assert.throws(()=>validateCreation(bad),/transform/);
});
test('3D builders expose an autonomous action and parse complete source without claiming results',()=>{
 assert.match(buildMessages({senses:'',talk:'normal'})[0].content,/create_3d/);
 assert.equal(parseCreation('{"name":"duck","description":"a red duck","code":"return new THREE.Group();"}').name,'duck');assert.equal(parseCreation('{"code":42}'),null);
});

test('grapple grabs, releases, regrabs in flight and recovers without leaving an external pose',async()=>{
 const {createGrapple}=await import('../src/cell/grapple.js');const handlers={},capture=new Set();
 const previous={innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight,addEventListener:globalThis.addEventListener};Object.assign(globalThis,{innerWidth:1000,innerHeight:800,addEventListener(){}});
 try{const canvas={addEventListener(k,fn){handlers[k]=fn;},setPointerCapture(id){capture.add(id);},hasPointerCapture(id){return capture.has(id);},releasePointerCapture(id){capture.delete(id);}};
 const camera=new T.PerspectiveCamera(50,1.25,.1,100);camera.position.set(0,1.25,5);camera.lookAt(0,1.25,0);camera.updateMatrixWorld();const {createBot}=await import('../src/bot.js');const bot=createBot(c=>new T.MeshBasicMaterial({color:c}),{free:true});bot.root.scale.setScalar(.38);bot.root.position.y=.35;bot.root.updateMatrixWorld(true);let grabbed=0,thrown=0,landed=0;
 const world={scene:new T.Scene(),renderer:{domElement:canvas},camera,bot,controls:{enabled:true},RECTS:[],knockItems(){}};const body={st:{x:0,z:0,heading:0},stop(){},clearGesture(){},setPosture(p){this.st.posture=p;}};
 world.scene.add(bot.root);const arm=createGrapple(world,body,{grab(){grabbed++;},throw(){thrown++;},land(){landed++;}});arm.setEnabled(true);const projected=bot.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.038,0)).project(camera);const e={clientX:(projected.x+1)*500,clientY:(1-projected.y)*400,pointerId:1,preventDefault(){},stopImmediatePropagation(){}};handlers.pointerdown(e);assert.ok(arm.held);assert.ok(body.st.external);assert.equal(world.controls.enabled,false);
 handlers.pointerup(e);assert.ok(arm.active&&!arm.held);assert.equal(world.controls.enabled,true);assert.equal(capture.size,0);handlers.pointerdown(e);assert.ok(arm.held);assert.equal(grabbed,2);assert.equal(arm.ragdoll.parts.length,11);assert.equal(arm.ragdoll.world.constraints.length,11);arm.setEnabled(false);assert.equal(thrown,2);
 for(let i=0;i<1500&&arm.active;i++)arm.update(i/60,1/60);assert.equal(arm.active,false);assert.equal(body.st.external,null);assert.equal(landed,1);assert.equal(body.st.posture,'stand');
 }finally{Object.assign(globalThis,previous);}
});
