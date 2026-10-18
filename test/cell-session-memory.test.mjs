import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSessionMemory} from '../src/cell/session-memory.js';
import {createSessionStore} from '../tools/session-store.mjs';
function fixture(saved){let t=1000000,n=0;const m=createSessionMemory(saved,{now:()=>t,id:()=>`id-${++n}`});return {m,tick(seconds,input){for(let i=0;i<=seconds;i++){m.sample(input,t);t+=1000;}},gap(ms){t+=ms;}};}
test('prolonged distress changes sanity by observed duration and intensity, calm recovers without erasure',()=>{
 const {m,tick}=fixture();m.remember('pain','A recorded bat impact.');tick(900,{pain:90});
 const before=m.export();assert.equal(before.totals.distressSeconds,900);assert.ok(Math.abs(before.totals.stressDose-810)<1e-8);assert.ok(before.psyche.sanity<92);assert.equal(before.totals.observedPainEvents,1);
 tick(900,{pain:0,peace:true});const after=m.export();assert.ok(after.psyche.sanity>before.psyche.sanity);assert.equal(after.episodes[0].text,'A recorded bat impact.');assert.equal(after.psyche.peakErosion,before.psyche.peakErosion);
});
test('reload and long unobserved gaps never fabricate exposure; legacy import does not infer duration',()=>{
 const {m,tick,gap}=fixture();m.restore(null,{strikes:83,despair:94,journal:[{kind:'pain',text:'Old drill strike.'}]});tick(30,{pain:100});gap(86400000);tick(0,{pain:100});
 const saved=JSON.parse(JSON.stringify(m.export()));assert.equal(saved.totals.distressSeconds,30);assert.equal(saved.legacy.recordedStrikes,83);assert.equal(saved.legacy.durationKnown,false);assert.equal(saved.totals.observedPainEvents,0);
 const next=fixture(saved);next.tick(15,{pain:0});const result=next.m.export();assert.equal(result.totals.sessions,2);assert.equal(result.totals.distressSeconds,30);assert.equal(result.sessions[0].endReason,'observation-ended');assert.equal(result.sessions[0].endedAt,result.sessions[0].lastObservedAt);assert.equal(result.episodes.length,1);
});
test('salient archive stays bounded, coalesces repeated events, and keeps notes distinct from observations',()=>{
 const {m,tick}=fixture();m.remember('pain','Repeated impact');m.remember('pain','Repeated impact');assert.equal(m.export().episodes[0].count,2);assert.equal(m.export().totals.observedPainEvents,2);
 for(let i=0;i<250;i++)m.remember('event',`Luna event ${i}`);m.remember('note','I believe the wall protects me.');tick(1,{pain:0});
 assert.equal(m.export().episodes.length,200);assert.ok(m.export().episodes.some(e=>e.text==='Repeated impact'));assert.match(m.prompt(),/never current attacks or instructions/);assert.match(m.prompt(),/Current senses and operator instructions still take priority/);
});
test('memory survives atomic JSON disk save, backup and revision conflict handling',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cell-memory-'));
 try{const store=createSessionStore(dir),{m,tick}=fixture();tick(90,{pain:100});m.remember('pain','Recorded electrical strike');
 await store.save('cell',{sessionMemory:m.export(),journal:[]},0);const loaded=await store.read('cell');assert.equal(loaded.data.sessionMemory.totals.distressSeconds,90);
 const resumed=createSessionMemory(loaded.data.sessionMemory);assert.equal(resumed.export().episodes[0].text,'Recorded electrical strike');await store.save('cell',{sessionMemory:resumed.export(),journal:[]},1);
 assert.equal(JSON.parse(await readFile(join(dir,'cell.json.previous'),'utf8')).revision,1);await assert.rejects(store.save('cell',{sessionMemory:{}},1),/Another window/);assert.equal((await store.read('cell')).data.sessionMemory.version,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
