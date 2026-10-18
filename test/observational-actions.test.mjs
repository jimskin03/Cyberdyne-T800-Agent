import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createActions,INTERRUPT} from '../src/cell/actions.js';
import {operatorCommand} from '../src/cell/commands.js';
function fixture(observe){
 const events=[];const body={st:{x:-1,z:0,heading:0,posture:'stand',look:null},arrived:true,turned:true,
  facePoint(point){events.push('aim');},lookAt(point,seconds){this.st.look=point;this.st.hold=seconds;events.push('gaze');},setPosture(value){this.st.posture=value;events.push('posture:'+value);},
  freeSpotNear:(x,z)=>[x,z],stop(){events.push('stop');},clearGesture(){},walkTo(){throw Error('Already at standing position');},handPos:()=>new Vector3()};
 const world={items:{},RECTS:[],features:{bed:{name:'the bed',look:[-2,.5,0],stand:[-1,0],desc:'STATIC MATTRESS DESCRIPTION'}}};
 const actions=createActions(world,body,{fear:()=>0,...(observe?{observe:request=>observe(request,{events,body})}:{})});let time=0;
 return {actions,body,events,async step(count=50){for(let i=0;i<count;i++){time+=.1;actions.tick(time);await Promise.resolve();}}};
}
test('recognizable polite and profane look imperatives resolve clean targets',()=>{
 for(const text of ['look at the bed properly','please look at bed closely','fucking look at the bed carefully','for fuck\'s sake, look at the fucking bed properly','hey, please inspect the bed carefully']){
  const command=operatorCommand(text);assert.equal(command[0].target,'bed',text);assert(['look_at','inspect'].includes(command[0].do));
 }
 assert.equal(operatorCommand('look closely at the bed')[0].target,'bed');
});
test('snapshot commands use a real optical action and preserve question safety and spoken payloads',()=>{
 assert.deepEqual(operatorCommand('take a snapshot'),[{do:'snapshot'}]);assert.deepEqual(operatorCommand('please take a snapshot of the bed carefully'),[{do:'snapshot',target:'bed'}]);
 assert.deepEqual(operatorCommand('capture the bed'),[{do:'snapshot',target:'bed'}]);
 for(const text of ['Can you look at the bed?','where is the bed','please look at bed?','what does take a snapshot mean?'])assert.equal(operatorCommand(text),null,text);
 assert.deepEqual(operatorCommand('please say Fuck, look at the bed properly!?'),{say:'Fuck, look at the bed properly!?',actions:[]});
 assert.deepEqual(operatorCommand('repeat please stop!'),{say:'please stop!',actions:[]});
});
test('look waits for aim and settle before requesting fresh optical evidence while gaze is held',async()=>{
 let calls=0;const rig=fixture(async(request,{events,body})=>{calls++;events.push('observe');assert.equal(request.target,'bed');assert.equal(request.name,'the bed');assert(body.st.look instanceof Vector3);assert.equal(body.st.hold,30);return {text:'A cube rests on the mattress.',capturedAt:123,target:'bed'};});
 const pending=rig.actions.run({do:'look_at',target:'bed'},{});assert.equal(calls,0);await rig.step(3);assert.equal(calls,0);await rig.step(50);const result=await pending;
 assert.equal(calls,1);assert.match(result,/cube rests on the mattress/);assert.doesNotMatch(result,/STATIC/);assert(rig.events.indexOf('aim')<rig.events.indexOf('observe'));
});
test('inspection captures before posture resets and uses observed text rather than static descriptions',async()=>{
 const rig=fixture(async(_request,{body,events})=>{assert.equal(body.st.posture,'half');events.push('observe');return {text:'The current bed surface is partly occluded.'};});
 const pending=rig.actions.run({do:'inspect',target:'bed'},{});await rig.step();const result=await pending;assert.match(result,/partly occluded/);assert.doesNotMatch(result,/STATIC/);assert.equal(rig.body.st.posture,'stand');assert(rig.events.indexOf('observe')<rig.events.lastIndexOf('posture:stand'));
});
test('current POV snapshot, capture and observe aliases call observation without fake file claims',async()=>{
 for(const alias of ['snapshot','capture','observe']){
  const rig=fixture(async(request)=>{assert.equal(request.target,null);return {text:'A clear current frame.'};});const pending=rig.actions.run({do:alias},{});await rig.step();const result=await pending;assert.match(result,/Current optical frame/);assert.doesNotMatch(result,/upload|saved|file|photograph/);assert(!rig.events.includes('aim'));
 }
});
test('targeted snapshot aims first and unavailable capture makes no success claim',async()=>{
 const rig=fixture(async request=>({text:'The bed is visible.',target:request.target}));const pending=rig.actions.run({do:'snapshot',target:'bed'},{});await rig.step();assert.match(await pending,/facing the bed/);
 const legacy=fixture();const unavailable=legacy.actions.run({do:'snapshot'},{});await legacy.step();assert.match(await unavailable,/unavailable; no new observation/);
 assert.match(await rig.actions.run({do:'snapshot',target:'missing'},{}),/not known/);
});
test('cancelAll aborts pending optical work and returns the existing interrupt signal',async()=>{
 const controller=new AbortController();let entered=false,aborted=false;
 const token={cancelled:false,signal:controller.signal,abort(){aborted=true;controller.abort();}};
 const rig=fixture(async({token})=>{entered=true;return new Promise((_,reject)=>token.signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{name:'AbortError'})),{once:true}));});
 const pending=rig.actions.run({do:'snapshot'},token);pending.catch(()=>{});await rig.step();assert(entered);rig.actions.cancelAll();await assert.rejects(pending,error=>error===INTERRUPT);assert(aborted);assert(token.cancelled);
});
test('legacy inspection fixtures without an observer retain prior factual descriptions',async()=>{
 const rig=fixture();const pending=rig.actions.run({do:'inspect',target:'bed'},{});await rig.step();assert.match(await pending,/STATIC MATTRESS DESCRIPTION/);
});
