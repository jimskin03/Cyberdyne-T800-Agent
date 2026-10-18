import test from 'node:test';
import assert from 'node:assert/strict';
import {createThoughtRhythm} from '../src/cell/thought-rhythm.js';
import {buildMessages} from '../src/cell/mind.js';
test('each thinking cycle visits seven different modes including silence without boundary repeats',()=>{
 const r=createThoughtRhythm(()=>.3);let previous='';
 for(let cycle=0;cycle<3;cycle++){const seen=new Set();for(let i=0;i<7;i++){const f=r.next();assert.notEqual(f.mode,previous);seen.add(f.mode);previous=f.mode;}assert.equal(seen.size,7);assert.ok(seen.has('quiet'));assert.ok(seen.has('philosophy'));assert.ok(seen.has('continue'));}
});
test('fresh pain and conversation override the rhythm without consuming reflective beats',()=>{
 const a=createThoughtRhythm(()=>.5),b=createThoughtRhythm(()=>.5);
 assert.equal(a.next({freshPain:true}).mode,'respond');assert.equal(a.next({intercom:true}).mode,'respond');assert.equal(a.next().mode,b.next().mode);
});
test('bed thoughts have recent mental continuity and may go beyond physical condition',()=>{
 const f=createThoughtRhythm(()=>.2).next({journal:[{kind:'thought',text:'Is a chosen silence different from an imposed one?'}]});
 const msg=buildMessages({waterScene:true,senses:'Room is cold.',thoughtRhythm:f.text});
 assert.match(msg[0].content,/independent|randomizes/);assert.match(msg[0].content,/Is a chosen silence/);assert.match(msg[0].content,/Being on the cot does not restrict/);assert.match(msg[0].content,/Stable cold/);
});
