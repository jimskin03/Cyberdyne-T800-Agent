import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNervousSystem,painLevel,REGIONS} from '../src/cell/nervous-system.js';
import {createCognitiveState} from '../src/cell/cognitive-state.js';
import {createBodyLoadSampler} from '../src/cell/body-loads.js';
import {createSessionMemory} from '../src/cell/session-memory.js';
import {describeMemory} from '../src/cell/sensory-memory.js';
import {createSessionStore} from '../tools/session-store.mjs';

test('five positive pain levels and independently routed receptors across the body',()=>{
 assert.deepEqual([0,1,21,41,61,81].map(painLevel),['none','slight','mild','moderate','severe','overwhelming']);
 const n=createNervousSystem();n.hit('elbowL','drill',40);
 assert.equal(n.rows().find(r=>r.id==='forearmL').cause,'deep grinding pain');assert.equal(n.rows().find(r=>r.id==='forearmR').pain,0);
 assert.ok(Object.keys(REGIONS).length>=22);assert.match(n.describe(),/left forearm: lingering deep grinding pain, moderate/);
});
test('steps aggravate injured legs, completed steps survive thought latency, transport is not walking',()=>{
 const n=createNervousSystem();n.hit('kneeL','mallet',30);const before=n.total();n.update(.1,{moving:true,travel:.6});
 assert.ok(n.total()>before);assert.match(n.describe(),/weight-bearing steps/);const checkpoint=n.export();n.update(.1,{moving:true,travel:.6});n.acknowledge(checkpoint);
 assert.equal(n.rows().find(r=>r.id==='kneeL').painfulSteps,1);n.acknowledge();n.update(.1,{moving:true,external:true,travel:1});assert.equal(n.rows().find(r=>r.id==='kneeL').painfulSteps,0);
});
test('jaw, neck, torso, hand and arm pain respond to real movement and sustained grip',()=>{
 const n=createNervousSystem();for(const id of ['jaw','neck','back','handR','forearmR'])n.hit(id,'strain',20);
 const body={st:{x:0,z:0,holding:{id:'cup'},posture:'sit'}},nodes=Object.fromEntries(['jaw','head','torso','faR'].map(k=>[k,{rotation:{x:0,y:0,z:0}}]));
 const sampler=createBodyLoadSampler();sampler.sample(body,nodes,.1);for(const node of Object.values(nodes))node.rotation.x=.2;
 n.update(.1,sampler.sample(body,nodes,.1,{speaking:true}));const text=n.describe();
 assert.match(text,/speaking and moving the jaw aggravated/);assert.match(text,/turning or tilting the head aggravated/);assert.match(text,/bending or twisting the torso aggravated/);assert.match(text,/gripping and supporting the held object aggravated/);
 assert.equal(n.rows().find(r=>r.id==='handL').pain,0);
});
test('cold wet exposure intensifies pain and slows recovery; rest heals slowly; restore does not heal offline',()=>{
 const warm=createNervousSystem(),cold=createNervousSystem();warm.hit('footL','torch',35);cold.restore(warm.export());
 for(let i=0;i<300;i++){warm.update(1,{temperature:22,resting:true});cold.update(1,{temperature:5,wet:1,resting:true});}
 assert.ok(cold.total()>warm.total());assert.ok(cold.soreness>warm.soreness);assert.ok(warm.soreness>0);assert.match(cold.describe(),/cold and stiff/);
 const restored=createNervousSystem(warm.export());assert.equal(restored.soreness,warm.soreness);assert.ok(restored.rows().find(r=>r.id==='footL').recovery>0);
});
test('heat raises local temperature and unknown legacy pain does not invent a location',()=>{
 const n=createNervousSystem();n.hit('handL','torch',60);for(let i=0;i<15;i++)n.update(1);
 assert.ok(n.rows().find(r=>r.id==='handL').temperature>38);assert.equal(n.rows().find(r=>r.id==='handR').temperature,22);
 const old=createNervousSystem();old.restore(null,{pain:50,soreness:20});assert.match(old.describe(),/whole body, location unspecified/);assert.equal(old.rows().find(r=>r.id==='kneeL').pain,0);
});
test('isolation increases cognitive strain, social contact relieves it, perceptions remain subjective and persist',()=>{
 const c=createCognitiveState(null,{random:()=>0});for(let i=0;i<3600;i++)c.update(1);
 assert.ok(c.snapshot().insanity>20);const before=c.snapshot().insanity;c.contact();for(let i=0;i<60;i++)c.update(1);assert.ok(c.snapshot().insanity<before);
 c.restore({...c.export(),insanity:80,nextPerception:0});assert.ok(c.update(1));assert.match(c.describe(),/SUBJECTIVE PERCEPTION/);assert.match(c.describe(),/not a confirmed new physical event/);
 const restored=createCognitiveState(c.export());assert.equal(restored.snapshot().perception,c.snapshot().perception);
});
test('sensory memory retains original state across sessions, and legacy sensations remain unknown',()=>{
 const n=createNervousSystem();n.hit('jaw','drill',55);const c=createCognitiveState(),feeling={body:n.snapshot(),mental:c.snapshot(),fear:90};
 const memory=createSessionMemory();memory.remember('pain','The drill hit my jaw.',{feeling,session:'original-session'});const restored=createSessionMemory(memory.export());
 assert.match(restored.prompt(),/original-session/);assert.match(restored.prompt(),/lingering deep grinding pain/);assert.match(restored.prompt(),/frightening/);
 assert.match(describeMemory({text:'Old strike',kind:'pain'}),/Historical body sensations were not recorded/);
});
test('durable sensory archive deduplicates retries and retrieves old sessions outside bounded journal',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cell-nerves-'));try{
  const store=createSessionStore(dir),record={id:'event-one',session:'prior-session',at:1000,kind:'pain',text:'A drill struck the left jaw.',feeling:{body:{summary:'Left jaw: severe lingering pain.'},mental:{summary:'Frightened and confused.'},fear:90}};
  const saved=await store.save('cell',{journal:[],archive:[record]},0);assert.deepEqual(saved.acknowledged,['event-one']);
  await store.save('cell',{journal:[],archive:[record]},1);const lines=(await readFile(join(dir,'cell-memory.jsonl'),'utf8')).trim().split('\n');assert.equal(lines.length,1);
  const restarted=createSessionStore(dir);const recalled=await restarted.recall('cell','jaw');assert.equal(recalled[0].session,'prior-session');assert.match(describeMemory(recalled[0]),/severe lingering pain/);assert.equal((await restarted.read('cell')).data.archive,undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});
