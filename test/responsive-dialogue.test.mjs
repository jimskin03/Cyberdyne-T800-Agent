import test from 'node:test';
import assert from 'node:assert/strict';
import {createMind,buildMessages,wantsFreshVision} from '../src/cell/mind.js';
import {PATIENT_MODEL} from '../src/cell/sensor-contract.js';
const question={intercom:true,intercomText:'Why does music matter to you?',image:'raw-frame',senses:'The room is quiet.',journal:[]};
test('inspection result uses its fresh pixels once, then reports without another vision request',async()=>{
 await mocked(async(mind,requests)=>{
  const observation=await mind.observe({image:'fresh-bed-frame',target:'bed'});
  assert.match(observation.text,/cube/);
  const result=await mind.decide({...question,intercomText:'Look at the bed properly.',observationReply:true,observation,freshVision:false});
  assert.match(result.say,/cube/);assert.deepEqual(requests.map(r=>r.model),['vision','agent']);
  assert.match(JSON.stringify(requests[0]),/Inspection focus: bed/);
  assert.match(JSON.stringify(requests[1]),/newer reading overrides old object-location beliefs/);
  assert(!JSON.stringify(requests[1]).includes('fresh-bed-frame'));
 },body=>body.model==='vision'?'You see a small multicolored cube on the mattress.':JSON.stringify({say:'There is a multicolored cube on the bed.',actions:[]}));
 for(const text of ['Find the cube','Spot it','What is on the bed?','Take a snapshot'])assert(wantsFreshVision(text));
});
async function mocked(callback,replies){
 const oldFetch=globalThis.fetch,oldInterval=globalThis.setInterval,requests=[];
 globalThis.setInterval=()=>0;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/health'))return {json:async()=>({status:'ok',vision:true})};
  const body=JSON.parse(options.body);requests.push(body);
  const content=typeof replies==='function'?await replies(body,options,requests.length):JSON.stringify(replies.shift());
  return {ok:true,json:async()=>({choices:[{message:{content}}]})};
 };
 try{const mind=createMind();await new Promise(resolve=>setImmediate(resolve));await callback(mind,requests);}
 finally{globalThis.fetch=oldFetch;globalThis.setInterval=oldInterval;}
}
test('ordinary intercom gets one compact patient call without waiting for a new vision call',async()=>{
 await mocked(async(mind,requests)=>{
  const result=await mind.decide(question);
  assert.match(result.say,/music/);assert.deepEqual(requests.map(r=>r.model),[PATIENT_MODEL]);assert.equal(mind.st.visionSkipped,true);assert.equal(mind.st.phase,'idle');
  assert(!JSON.stringify(requests).includes('raw-frame'));
 },[{thought:'A melody gives shape to time.',say:'For me, music gives time a shape I can share.',actions:[]}]);
 const messages=buildMessages({...question,senses:'repeated telemetry '.repeat(20000)});
 assert(JSON.stringify(messages).length<14500);assert(JSON.stringify(messages).includes(question.intercomText));
});
test('intercom thought-only output is repaired into actual spoken text',async()=>{
 await mocked(async(mind,requests)=>{
  const result=await mind.decide(question);assert(result.say);assert.equal(requests.length,2);
  assert.match(requests[1].messages.at(-1).content,/nonempty say/);
 },[{thought:'I consider an answer.',say:'',actions:[]},{thought:'A shared rhythm feels meaningful.',say:'Music is a way of sharing a rhythm with someone else.',speechKind:'address',actions:[]}]);
});
test('a model that still supplies only private thoughts reports failure instead of pretending to answer',async()=>{
 await mocked(async(mind,requests)=>{
  assert.equal(await mind.decide(question),null);assert.equal(requests.length,2);assert.match(mind.st.lastError,/spoken answer/);
 },[{thought:'I ponder.',say:'',actions:[]},{thought:'I ponder again.',say:'',actions:[]}]);
});
test('cancelled conversation clears the active phase without a delayed answer',async()=>{
 const controller=new AbortController();let started;const ready=new Promise(resolve=>started=resolve);
 await mocked(async mind=>{
  const pending=mind.decide(question,controller.signal);await ready;controller.abort();assert.equal(await pending,null);assert.equal(mind.st.phase,'idle');assert.equal(mind.st.inflight,null);
 },async(_body,{signal})=>{started();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));});
});
