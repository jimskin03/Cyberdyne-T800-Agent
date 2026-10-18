import test from 'node:test';
import assert from 'node:assert/strict';
import {createMind,buildMessages} from '../src/cell/mind.js';
import {PATIENT_MODEL,VISION_MODEL} from '../src/cell/sensor-contract.js';

test('patient receives direct observations without images or fictional framing',()=>{
 for(const waterScene of [false,true]){
  const messages=buildMessages({senses:'Pain sensor: 24/100.',waterScene,visualObservation:'You see a steel door.',image:'raw-eyes',browserImage:'raw-screen'});
  const text=JSON.stringify(messages);
  assert.match(text,/You see a steel door/);
  assert.doesNotMatch(text,/raw-eyes|raw-screen|image_url|fictional|cartoon|game mechanics|rendered props/i);
 }
});

for(const failedVision of [false,true])test(`separate optical model routes both feeds; failure=${failedVision} never forwards raw images`,async()=>{
 const oldFetch=globalThis.fetch,oldInterval=globalThis.setInterval,requests=[];
 globalThis.setInterval=()=>0;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/health'))return {json:async()=>({status:'ok',vision:true})};
  const request=JSON.parse(options.body);requests.push(request);
  if(request.model===VISION_MODEL)return {ok:!failedVision,status:503,json:async()=>({choices:[{message:{content:'EYES: You see a door. COMPUTER: A blank page.'}}]})};
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({thought:'The ventilation hum is steady.',say:'',actions:[]})}}]})};
 };
 try{
  const mind=createMind();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(await mind.decide({image:'raw-eyes',browserImage:'raw-screen',senses:'Audio: ventilation hum.',journal:[]}));
  assert.notEqual(PATIENT_MODEL,VISION_MODEL);
  assert.deepEqual(requests.map(r=>r.model),[VISION_MODEL,PATIENT_MODEL]);
  assert.equal(requests[0].messages[1].content.filter(p=>p.type==='image_url').length,2);
  const patient=JSON.stringify(requests[1]);
  assert.doesNotMatch(patient,/image_url|raw-eyes|raw-screen/);
  assert.match(patient,failedVision?/Optical feed unavailable/:/You see a door/);
 }finally{globalThis.fetch=oldFetch;globalThis.setInterval=oldInterval;}
});

test('all core cell sensor modes end with the first-person continuation cue',()=>{
 for(const mode of [{},{waterScene:true},{autonomous:true},{autonomous:true,experienceDriven:true}]){
  const messages=buildMessages({senses:'Temperature: 22 C. Pain: 0.',visualObservation:'You see the door.',...mode});
  const text=messages.at(-1).content.at(-1).text;assert.ok(text.endsWith('and i feel-'));assert.match(text,/Temperature: 22 C/);assert.match(text,/You see the door/);assert.match(text,/thought field/);
 }
});

test('decision-repair prompts retain the feeling cue after feedback',async()=>{
 const oldFetch=globalThis.fetch,oldInterval=globalThis.setInterval,requests=[];
 globalThis.setInterval=()=>0;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/health'))return {json:async()=>({status:'ok',vision:false})};
  requests.push(JSON.parse(options.body));const d=requests.length===1?{thought:'I wait.',say:'The locked steel door is still ahead of me.',actions:[]}:{thought:'a faint vibration under my feet',say:'',actions:[]};
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(d)}}]})};
 };
 try{const mind=createMind();await new Promise(r=>setImmediate(r));const result=await mind.decide({senses:'The floor vibrates faintly.',journal:[],recentSpeech:['The locked steel door is still ahead of me.']});assert.ok(result);assert.equal(requests.length,2);assert.ok(requests[1].messages.at(-1).content.endsWith('and i feel-'));assert.match(requests[1].messages.at(-1).content,/Revise this decision/);}finally{globalThis.fetch=oldFetch;globalThis.setInterval=oldInterval;}
});
