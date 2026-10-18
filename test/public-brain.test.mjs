import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLifeMemory,validateLifeGraph} from '../src/cell/life-memory.js';
import {networkLayout} from '../src/cell/memory-network.js';
import {recallSensoryMemory} from '../src/cell/sensory-memory.js';
const starter=JSON.parse(await readFile(new URL('../examples/brain.starter.json',import.meta.url),'utf8'));
test('documented starter recalls connected evidence and builds the visible graph',()=>{
 const memory=createLifeMemory(starter),recall=memory.recall('repair radio');
 assert(recall.activated.some(n=>n.id==='m-radio-repair'));
 assert(recall.pathways.some(p=>p.id==='path-rest'));
 assert(memory.personality().some(t=>t.id==='agency'&&t.evidence.some(e=>e.id==='m-radio-repair')));
 const layout=networkLayout(starter);assert.equal(layout.items.length,starter.nodes.length+starter.pathways.length);
 assert(layout.items.every(i=>i.position.every(Number.isFinite)));
});
test('invalid graph identity, ID collisions, cues and fragment types fail before rendering',()=>{
 for(const mutate of [g=>g.age=NaN,g=>g.id='',g=>g.nodes[0].age=[NaN,3],g=>g.pathways[0].id=g.nodes[0].id,g=>g.pathways[0].cues=[12],g=>g.nodes[0].fragments=[{}]]){
  const graph=structuredClone(starter);mutate(graph);assert.throws(()=>validateLifeGraph(graph));
 }
});
test('hierarchy requires a valid eras array before range recall',()=>{
 const graph={version:1,id:'calendar-fixture',source:'simulated biography',person:'Fictional calendar unit',age:0,recallModel:'hierarchical-v2',biography:{dateOfBirth:'2000-01-01',asOf:'2000-01-02',birthplace:'Fictional workshop'},nodes:[{id:'m-anchor',age:[0,0],kind:'learned',fact:'A fictional family story.',strength:.4,years:[2000,2000],depth:0,certainty:'learned'}],pathways:[{id:'year-2000',label:'First year',cues:['2000'],route:['m-anchor'],years:[2000,2000],tier:0}],links:[]};
 assert.throws(()=>validateLifeGraph(graph),/eras/);
 graph.eras=[{id:'early',years:[2000,2000]}];assert.doesNotThrow(()=>createLifeMemory(graph).recall('2000'));
 graph.pathways[0].id='year-wrong';assert.throws(()=>validateLifeGraph(graph),/calendar anchor/);graph.pathways[0].id='year-2000';
 graph.eras[0].years=[2001,2000];assert.throws(()=>validateLifeGraph(graph),/eras/);
});
test('standalone sensory recall uses actual browser events without contacting an excluded service',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 globalThis.window={__CELL:{state:{journal:[{at:1,session:'old',kind:'event',text:'The radio played a quiet tune.'},{at:2,session:'now',kind:'event',text:'The radio is off.'}]}}};
 globalThis.fetch=()=>{throw Error('No network is expected');};
 try{const text=await recallSensoryMemory('radio from a previous session',{session:'now'});assert(text.includes('quiet tune'));assert(!text.includes('radio is off'));}
 finally{globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});
