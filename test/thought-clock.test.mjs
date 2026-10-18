import test from 'node:test';
import assert from 'node:assert/strict';
import {createThoughtClock} from '../src/cell/thought-clock.js';
test('thousands of sensor ticks cannot accelerate background requests',()=>{
 let time=0;const clock=createThoughtClock({now:()=>time});
 for(let i=0;i<5000;i++){time=i;assert.equal(clock.ready(),false);}
 time=30000;assert.equal(clock.ready(),true);clock.began();clock.finished();
 time=59999;assert.equal(clock.ready(),false);time=60000;assert.equal(clock.ready(),true);
});
test('intercom bypasses the background cooldown but never runs over an active request',()=>{
 let time=0;const clock=createThoughtClock({now:()=>time});clock.began();time=1;
 assert.equal(clock.ready({intercom:true}),true);assert.equal(clock.ready({intercom:true,busy:true}),false);
 assert.equal(clock.ready({intercom:true,connected:false}),false);
});
test('new sensation events are coalesced, and speech blocks autonomous thoughts only',()=>{
 let time=0;const clock=createThoughtClock({now:()=>time});
 time=4999;assert.equal(clock.ready({event:true}),false);time=5000;assert.equal(clock.ready({event:true}),true);
 clock.finished();time=10000;assert.equal(clock.ready({event:true,speaking:true}),false);assert.equal(clock.ready({intercom:true,speaking:true}),true);
});
