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
test('blank startup configuration stays unconfigured until the scene sets a connection',()=>{
 assert.equal(apiConfiguration({}).configured,false);
 assert.equal(apiConfiguration({AGENT_NAME:'Unit',API_AUTH_MODE:'api-key',API_BASE_URL:'',API_TEXT_MODEL:'',API_KEY:''}).agentName,'Unit');
 assert.throws(()=>apiConfiguration({API_KEY:'unit-key'}),/API_BASE_URL/);
 assert.throws(()=>apiConfiguration({API_AUTH_MODE:'none'}),/API_BASE_URL/);
});
test('scene origins are an explicit server setting with no wildcard or URL credentials',()=>{
 assert.deepEqual(apiConfiguration({}).allowedOrigins,[]);
 const value=apiConfiguration({API_ALLOWED_ORIGINS:'http://100.64.0.10:5340/, https://scene.example http://100.64.0.10:5340'});
 assert.equal(value.configured,false);
 assert.deepEqual(value.allowedOrigins,['http://100.64.0.10:5340','https://scene.example']);
 for(const origin of ['*','null','http://*.example','https://scene.example/path','https://scene.example?x=1','https://scene.example#x',['https://user',':password','@scene.example'].join(''),'file:///tmp/scene'])
  assert.throws(()=>apiConfiguration({API_ALLOWED_ORIGINS:origin}),/API_ALLOWED_ORIGINS/);
});
test('an explicitly allowed private scene origin can connect and chat through a loopback adapter',async t=>{
 const origin='http://100.64.0.10:5340',key=['private','scene','fixture'].join('-'),calls=[];
 const url=await setup(t,{fetcher:async(endpoint,options)=>{calls.push({endpoint,options});return Response.json({choices:[{message:{content:'Mock private scene reply'}}]});}},apiConfiguration({API_ALLOWED_ORIGINS:origin}));
 const headers={'content-type':'application/json',origin,'sec-fetch-site':'same-origin'};
 const body={kind:'openai-compatible',baseUrl:'https://openrouter.ai/api/v1',apiKey:key,textModel:'openrouter/free',allowedOrigins:['https://client-chosen.invalid']};
 const response=await fetch(url+'/connection',{method:'POST',headers,body:JSON.stringify(body)});
 assert.equal(response.status,200);
 const health=await response.json();assert.equal(health.status,'ok');assert.equal(health.connection.host,'openrouter.ai');
 assert.equal(JSON.stringify(health).includes(key),false);assert.equal(JSON.stringify(health).includes(origin),false);
 const answer=await post(url,thought,headers);assert.equal(answer.status,200);
 assert.equal(calls[0].endpoint,'https://openrouter.ai/api/v1/chat/completions');
 assert.equal(calls[0].options.headers.authorization,'Bearer '+key);
 assert.equal(JSON.parse(calls[0].options.body).model,'openrouter/free');
 assert.equal((await post(url,thought,{origin:'https://client-chosen.invalid'})).status,403);
});
test('allowing one private scene keeps other origins and cross-site requests blocked',async t=>{
 let calls=0;
 const origin='http://100.64.0.10:5340';
 const url=await setup(t,{fetcher:async()=>{calls++;return Response.json({});}},apiConfiguration({API_ALLOWED_ORIGINS:origin}));
 for(const other of ['http://100.64.0.11:5340','http://100.64.0.10:5341','https://100.64.0.10:5340','null']){
  const response=await post(url,thought,{origin:other,'sec-fetch-site':'same-origin'});
  assert.equal(response.status,403);assert.equal((await response.json()).code,'scene_origin_not_allowed');
 }
 assert.equal((await post(url,thought,{origin,'sec-fetch-site':'cross-site'})).status,403);
 const spoofed=await new Promise((resolve,reject)=>{const req=http.request(url+'/connection',{method:'POST',headers:{host:'untrusted.invalid',origin,'content-type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end('{}');});
 assert.equal(spoofed,403);assert.equal(calls,0);
});
test('scene connection accepts an OpenAI-compatible API and an invited alternative without leaking the key',async t=>{
 const key=['unit','scene','key'].join('-'),calls=[];
 const url=await setup(t,{fetcher:async(endpoint,options)=>{calls.push({endpoint,authorization:options.headers.authorization,body:JSON.parse(options.body)});return Response.json({choices:[{message:{content:'{"thought":"ok","say":"here","actions":[]}'}}]});}},{configured:false,endpoint:'',key:'',textModel:'',visionModel:'',creativeModel:'',agentName:'Agent',authMode:'none',oauth:null});
 assert.equal((await (await fetch(url+'/health')).json()).status,'unconfigured');
 assert.equal((await post(url)).status,401);
 const rejected=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json',origin:'https://untrusted.invalid'},body:JSON.stringify({kind:'openai-compatible',baseUrl:'https://provider.invalid/v1',apiKey:key,textModel:'unit-model'})});
 assert.equal(rejected.status,403);assert.equal((await (await fetch(url+'/health')).json()).status,'unconfigured');
 const plaintext=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'openai-compatible',baseUrl:'http://provider.invalid/v1',apiKey:key,textModel:'unit-model'})});
 assert.equal(plaintext.status,400);assert.equal((await plaintext.text()).includes(key),false);
 const embedded=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'openai-compatible',baseUrl:['https://user:',key,'@provider.invalid/v1'].join(''),apiKey:key,textModel:'unit-model'})});
 assert.equal(embedded.status,400);assert.equal((await embedded.text()).includes(key),false);
 const badModel=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'openai-compatible',baseUrl:'https://provider.invalid/v1',apiKey:key,textModel:'bad model'})});
 assert.equal(badModel.status,400);assert.equal((await badModel.text()).includes(key),false);
 const saved=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'openai-compatible',baseUrl:'https://provider.invalid/v1/chat/completions',apiKey:key,textModel:'unit-model',visionModel:'unit-vision',agentName:'Scene Agent'})});
 const body=await saved.json();assert.equal(saved.status,200);assert.equal(body.status,'ok');assert.equal(body.connection.kind,'openai-compatible');assert.equal(body.connection.host,'provider.invalid');assert.equal(body.agent.name,'Scene Agent');assert.equal(body.vision,true);assert.equal(JSON.stringify(body).includes(key),false);
 assert.equal((await post(url)).status,200);assert.equal(calls[0].endpoint,'https://provider.invalid/v1/chat/completions');assert.equal(calls[0].authorization,'Bearer '+key);assert.equal(calls[0].body.model,'unit-model');
 const missingKey=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'invite',alternative:'api-key',baseUrl:'https://other.invalid/v1',textModel:'other-model'})});
 assert.equal(missingKey.status,400);
 const local=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'invite',alternative:'local',baseUrl:'http://127.0.0.1:1234/v1',textModel:'local-model',agentName:'Local Unit'})});
 const localHealth=await local.json();assert.equal(local.status,200);assert.equal(localHealth.auth.mode,'none');assert.equal(localHealth.connection.kind,'invite');assert.equal(localHealth.connection.alternative,'local');assert.equal(localHealth.agent.name,'Local Unit');
 assert.equal((await post(url)).status,200);assert.equal(calls[1].authorization,undefined);assert.equal(calls[1].body.model,'local-model');
 const loop=new URL(url);const looped=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'invite',alternative:'api-key',baseUrl:loop.origin+'/v1',apiKey:key,textModel:'unit-model'})});
 assert.equal(looped.status,400);
 const signin=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'invite',alternative:'sign-in',agentName:'Other'})});
 assert.equal(signin.status,409);
 const cleared=await (await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'clear'})})).json();
 assert.equal(cleared.status,'unconfigured');assert.equal(calls.length,2);
});
test('clearing a scene connection restores the startup adapter without deleting its key',async t=>{
 const scene=['scene','key'].join('-'),calls=[];
 const url=await setup(t,{fetcher:async(endpoint,options)=>{calls.push({endpoint,authorization:options.headers.authorization});return Response.json({choices:[{message:{content:'ok'}}]});}});
 const saved=await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'openai-compatible',baseUrl:'https://other.invalid/v1',apiKey:scene,textModel:'other-model'})});
 assert.equal(saved.status,200);assert.equal(JSON.stringify(await saved.json()).includes(scene),false);
 await post(url);assert.equal(calls[0].endpoint,'https://other.invalid/v1/chat/completions');assert.equal(calls[0].authorization,'Bearer '+scene);
 assert.equal((await fetch(url+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'clear'})})).status,200);
 await post(url);assert.equal(calls[1].endpoint,config.endpoint);assert.equal(calls[1].authorization,'Bearer '+secret);assert.equal(calls[1].authorization.includes(scene),false);
});
test('closing a client request aborts the in-flight upstream request',async t=>{
 let start,aborted;const started=new Promise(resolve=>start=resolve),upstreamAborted=new Promise(resolve=>aborted=resolve);
 const url=await setup(t,{fetcher:async(_url,{signal})=>{start();await new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted();reject(Error('aborted'));},{once:true}));}});
 const controller=new AbortController();
 const pending=fetch(url+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(thought),signal:controller.signal});
 await started;controller.abort();await assert.rejects(pending);
 await Promise.race([upstreamAborted,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Upstream was not cancelled')),1000);timer.unref();})]);
});
