import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionQueue} from '../src/cell/app/action-queue.js';
import {actionResult} from '../src/cell/actions/result.js';

async function exercise(status,text){
 const observations=[],journalRows=[];
 const state={queue:[{do:'repair',object:'lamp'}],current:null,nextActionAt:0,simMin:0,operatorBusy:true,events:[]};
 const queue=createActionQueue({
  state,
  actions:{runResult:async()=>actionResult(status,text)},
  body:{st:{x:0,z:0},navigation:null},
  nervous:{describe:()=>''},
  lifeMemory:{experience:{observe:value=>observations.push(value)}},
  journal:(kind,value,details)=>journalRows.push({kind,value,details}),
  describeAction:()=> 'repair lamp', formatTime:()=> '00:00', save(){}, now:()=>10, random:()=>0,
  createId:()=> 'id-1', createAbortController:()=>({signal:{aborted:false},abort(){}}), interrupt:'interrupt'
 });
 assert.equal(queue.runNext(1),true);
 await new Promise(resolve=>setImmediate(resolve));
 return {state,observations,journalRows};
}

test('learning trusts failed status even when prose sounds successful',async()=>{
 const {state,observations,journalRows}=await exercise('failed','Successfully completed repair.');
 assert.equal(observations[0].kind,'task_failure');
 assert.equal(state.events[0].status,'failed');
 assert.equal(journalRows.find(row=>row.kind==='result').details.success,false);
});

test('learning trusts completed status even when prose contains failure words',async()=>{
 const {state,observations,journalRows}=await exercise('completed','Repair completed; an old note said it could not be done.');
 assert.equal(observations[0].kind,'task_success');
 assert.equal(state.events[0].status,'completed');
 assert.equal(journalRows.find(row=>row.kind==='result').details.success,true);
});

test('cancelled actions create an accurate result event without training as success or failure',async()=>{
 const {state,observations,journalRows}=await exercise('cancelled','Action cancelled.');
 assert.equal(observations.length,0);
 assert.equal(state.events[0].status,'cancelled');
 assert.equal(journalRows.find(row=>row.kind==='result').details.status,'cancelled');
});
