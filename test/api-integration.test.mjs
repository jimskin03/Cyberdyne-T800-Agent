import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {apiConfiguration,createApiServer} from '../tools/api-server.mjs';

const secret=['unit','credential'].join('-');
const config={endpoint:'https://provider.invalid/v1/chat/completions',key:secret,textModel:'unit-text',visionModel:'unit-vision'};
const thought={model:'agent',messages:[{role:'system',content:'Rules'},{role:'user',content:[{type:'text',text:'First observation'},{type:'text',text:'Second observation'}]},{role:'assistant',content:'Earlier proposal'},{role:'user',content:'Please revise'}],max_tokens:1500,temperature:.9,effort:'low',stream:false};
async function setup(t,options={},settings=config){
 const server=createApiServer(settings,options);server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 return 'http://127.0.0.1:'+server.address().port;
}
const post=(url,body=thought,headers={})=>fetch(url+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('API adapter maps models, preserves correction roles, normalizes text, and keeps authorization server-side',async t=>{
 const calls=[];const url=await setup(t,{fetcher:async(endpoint,options)=>{calls.push({endpoint,options,body:JSON.parse(options.body)});return Response.json({choices:[{message:{content:'{"thought":"A new idea","say":"","actions":[]}'}}]});}});
 const health=await (await fetch(url+'/health')).json();assert.equal(health.vision,true);assert.equal(health.upstreamChecked,false);assert.equal(calls.length,0);
 const response=await post(url);assert.equal(response.status,200);const text=await response.text();assert(!text.includes(secret));
 assert.equal(calls[0].options.headers.authorization,'Bearer '+secret);assert.equal(calls[0].body.model,'unit-text');
 assert.deepEqual(calls[0].body.messages.map(m=>m.role),['system','user','assistant','user']);assert.equal(calls[0].body.messages[1].content,'First observation\nSecond observation');assert(!Object.hasOwn(calls[0].body,'effort'));
 const image={model:'vision',messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,AA=='}}]}]};
 assert.equal((await post(url,image)).status,200);assert.equal(calls[1].body.model,'unit-vision');assert(Array.isArray(calls[1].body.messages[0].content));
});
test('untrusted browser origins, host spoofing, plain bodies and oversized requests cannot reach the provider',async t=>{
 let calls=0;const url=await setup(t,{fetcher:async()=>{calls++;return Response.json({});}});
 assert.equal((await post(url,thought,{origin:'https://untrusted.invalid'})).status,403);
 assert.equal((await post(url,thought,{'sec-fetch-site':'cross-site'})).status,403);
 const spoofed=await new Promise((resolve,reject)=>{const req=http.request(url+'/v1/chat/completions',{method:'POST',headers:{host:'untrusted.invalid','content-type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end(JSON.stringify(thought));});
 assert.equal(spoofed,403);
 assert.equal((await fetch(url+'/v1/chat/completions',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,415);
 assert.equal((await post(url,{...thought,padding:'x'.repeat(8*1024*1024)})).status,413);assert.equal(calls,0);
});
test('provider errors and malformed content return sanitized errors, with no credential or prompt echoes',async t=>{
 const url=await setup(t,{fetcher:async()=>Response.json({error:{message:secret+' private upstream diagnostic'}},{status:401})});
 const result=await post(url);assert.equal(result.status,502);assert(!(await result.text()).includes(secret));
 assert.equal((await post(url,{...thought,model:'client-chosen-model'})).status,400);
 assert.equal((await post(url,{...thought,messages:[{role:'user',content:[{type:'unexpected'}]}]})).status,400);
});
test('text-only API configuration advertises no vision and rejects image requests',async t=>{
 const url=await setup(t,{fetcher:async()=>Response.json({choices:[{message:{content:'text result'}}]})},{...config,visionModel:''});
 assert.equal((await (await fetch(url+'/health')).json()).vision,false);
 assert.equal((await post(url,{model:'vision',messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,AA=='}}]}]})).status,400);
});
test('provider timeout is bounded and excess concurrent requests are rejected',async t=>{
 let start;const started=new Promise(resolve=>start=resolve);
 const url=await setup(t,{timeoutMs:100,maxConcurrent:1,fetcher:async(_url,{signal})=>{start();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}});
 const pending=post(url);await started;assert.equal((await post(url)).status,429);assert.equal((await pending).status,504);
});
test('API configuration rejects remote plaintext URLs and URL-embedded credentials',()=>{
 assert.throws(()=>apiConfiguration({API_BASE_URL:'http://provider.invalid/v1',API_TEXT_MODEL:'model'}),/HTTPS/);
 assert.throws(()=>apiConfiguration({API_BASE_URL:['https://example',':','secret','@','provider.invalid/v1'].join(''),API_TEXT_MODEL:'model'}),/credentials/);
 assert.equal(apiConfiguration({API_BASE_URL:'http://127.0.0.1:1234/v1',API_TEXT_MODEL:'local'}).endpoint,'http://127.0.0.1:1234/v1/chat/completions');
});
test('closing a client request aborts the in-flight upstream request',async t=>{
 let start,aborted;const started=new Promise(resolve=>start=resolve),upstreamAborted=new Promise(resolve=>aborted=resolve);
 const url=await setup(t,{fetcher:async(_url,{signal})=>{start();await new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted();reject(Error('aborted'));},{once:true}));}});
 const controller=new AbortController();
 const pending=fetch(url+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(thought),signal:controller.signal});
 await started;controller.abort();await assert.rejects(pending);
 await Promise.race([upstreamAborted,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Upstream was not cancelled')),1000);timer.unref();})]);
});
