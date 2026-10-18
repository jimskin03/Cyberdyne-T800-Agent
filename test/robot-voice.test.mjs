import test from 'node:test';
import assert from 'node:assert/strict';
import {robotSamples,robotDelivery} from '../src/robot-voice.js';
import {createNeuralVoice} from '../src/neural-voice.js';

test('robot synthesizer changes timbre, preserves duration and silent gaps, and bounds peaks',()=>{
 const input=Float32Array.from({length:4800},(_,i)=>i<600?0:.65*Math.sin(2*Math.PI*220*i/24000));
 const result=robotSamples(input,24000);assert.equal(result.length,input.length);
 assert.ok(result.slice(0,600).every(x=>x===0));assert.ok(result.every(x=>Number.isFinite(x)&&Math.abs(x)<=.95));
 const difference=result.reduce((sum,x,i)=>sum+Math.abs(x-input[i]),0)/result.length;assert.ok(difference>.1);
 const similarity=result.reduce((sum,x,i)=>sum+x*input[i],0);assert.ok(similarity>100,'clear voice path remains');
});

test('neural voice defaults American, synthesizes its buffer and discards stale generations',async()=>{
 const requests=[],pending=[],sources=[];const original=Float32Array.from({length:2400},(_,i)=>Math.sin(i/10)*.4);
 const buffer={numberOfChannels:1,length:original.length,sampleRate:24000,getChannelData:()=>original};
 const ctx={decodeAudioData:async()=>buffer,createBuffer(channels,length,sampleRate){const data=new Float32Array(length);return {numberOfChannels:channels,length,sampleRate,getChannelData:()=>data};},createBufferSource(){const node={playbackRate:{value:1},connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(node);return node;}};
 const voice=createNeuralVoice({context:()=>ctx,output:()=>({}),fetcher:(url,opts)=>{requests.push(JSON.parse(opts.body));return new Promise(resolve=>pending.push(resolve));}});
 const first=voice.speak('Obsolete.'),second=voice.speak('Current.',{speed:1.2,delivery:robotDelivery('strained')});pending[0]({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await first;assert.equal(sources.length,0);
 pending[1]({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await second;assert.equal(requests[1].voice,'am_michael');assert.ok(sources[0].started);assert.notDeepEqual(sources[0].buffer.getChannelData(0),original);
 assert.equal(sources[0].playbackRate.value,1.12);assert.ok(Math.abs(requests[1].speed*sources[0].playbackRate.value-1.2)<.00001,'pitch shift keeps requested dialogue speed');
 voice.stop();assert.ok(sources[0].stopped);
});

test('strained speech is audibly louder and rougher than a whisper without generating vocal clips',()=>{
 const input=Float32Array.from({length:24000},(_,i)=>.2*Math.sin(2*Math.PI*220*i/24000));
 const loud=robotSamples(input,24000,robotDelivery('strained')),soft=robotSamples(input,24000,robotDelivery('whispering'));
 const rms=values=>Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length);
 assert.ok(rms(loud)>rms(soft)*3);assert.ok(loud.every(x=>Number.isFinite(x)&&Math.abs(x)<=.95));assert.equal(loud.length,soft.length);
 assert.notEqual(robotDelivery('screaming').pitch,robotDelivery('whispering').pitch);
});

test('every expression requests a server-supported speed and healthy slow speech keeps the same backend',async()=>{
 const requests=[],sources=[],timers=[];const oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
 const data=new Float32Array(240).fill(.1),buffer={numberOfChannels:1,length:240,sampleRate:24000,getChannelData:()=>data};
 const ctx={decodeAudioData:async()=>buffer,createBuffer(channels,length,sampleRate){const out=new Float32Array(length);return {numberOfChannels:channels,length,sampleRate,getChannelData:()=>out};},createBufferSource(){const node={playbackRate:{value:1},connect(){},disconnect(){},start(){},stop(){}};sources.push(node);return node;}};
 globalThis.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};globalThis.clearTimeout=()=>{};
 try{
  let resolve;const voice=createNeuralVoice({context:()=>ctx,output:()=>({}),fetcher:(url,opts)=>{requests.push(JSON.parse(opts.body));return new Promise(r=>resolve=r);}});
  for(const tag of ['crying','whispering','strained','screaming','groaning','laughing','']){
   let failed=false;const request=voice.speak('Still the same android.',{speed:tag==='crying'?.8:1.3,delivery:robotDelivery(tag),onError:()=>failed=true});
   assert.equal(timers.at(-1).ms,95000,'client waits beyond worker queue/synthesis bound');
   assert.equal(requests.at(-1).voice,'am_michael');assert.ok(requests.at(-1).speed>=.8&&requests.at(-1).speed<=1.3);
   resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await request;assert.equal(failed,false);assert.ok(sources.at(-1).buffer);voice.stop();
  }
 }finally{globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;}
});
