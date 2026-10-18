import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {createServer} from 'vite';
import {apiConfiguration,createApiServer} from '../tools/api-server.mjs';
import {sceneProxy,llmProxy} from '../tools/scene-proxy.mjs';

async function setup(t,options={}){
 const server=createApiServer(apiConfiguration({}),options);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 return 'http://127.0.0.1:'+server.address().port;
}
const draft={kind:'openai-compatible',baseUrl:'https://provider.invalid/v1',apiKey:['mock','settings','fixture'].join('-')};
const post=(url,path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
const proxyPost=(url,body,headers)=>new Promise((resolve,reject)=>{
 const req=http.request(url+'/llm/connection',{method:'POST',headers:{'content-type':'application/json',...headers}},async res=>{
  const chunks=[];for await(const chunk of res)chunks.push(chunk);
  resolve(new Response(Buffer.concat(chunks),{status:res.statusCode}));
 });
 req.on('error',reject);req.end(JSON.stringify(body));
});

test('scene proxy accepts its current address and port without configuring allowed origins',async t=>{
 const backend=await setup(t);
 const server=await createServer({configFile:false,envFile:false,optimizeDeps:{noDiscovery:true,include:[]},plugins:[sceneProxy()],server:{host:'127.0.0.1',port:0,allowedHosts:true,proxy:llmProxy(backend)}});
 await server.listen();t.after(()=>server.close());
 const url='http://127.0.0.1:'+server.httpServer.address().port;
 for(const host of ['100.64.0.10:5341','scene.example:5342','localhost:5343']){
  const response=await proxyPost(url,{...draft,textModel:'unit-model'},{host,origin:'http://'+host});
  assert.equal(response.status,200,await response.text());
 }
 for(const headers of [
  {host:'scene.example',origin:'https://other.example'},
  {host:'scene.example',origin:'null'},
  {host:'scene.example',origin:'https://scene.example','sec-fetch-site':'cross-site'},
  {host:'scene.example',origin:'https://other.example','x-forwarded-host':'other.example'},
 ])assert.equal((await proxyPost(url,{kind:'clear'},headers)).status,403);
 assert.equal((await post(backend,'/connection',{kind:'clear'},{origin:'http://100.64.0.10:5341'})).status,403);
});

test('discovery uses a draft endpoint and key without activating AI or changing settings',async t=>{
 const calls=[];
 const url=await setup(t,{fetcher:async(endpoint,options)=>{
  calls.push({endpoint,options});
  return Response.json({data:[{id:'z-model',private:'ignored'},{id:'a-model'},{id:'z-model'},{id:'bad model'},null]});
 }});
 const response=await post(url,'/connection/models',{...draft,baseUrl:draft.baseUrl+'/chat/completions'});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{models:['a-model','z-model']});
 assert.equal(calls[0].endpoint,draft.baseUrl+'/models');
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.authorization,'Bearer '+draft.apiKey);
 assert.equal(calls[0].options.redirect,'error');
 assert.equal((await (await fetch(url+'/health')).json()).status,'unconfigured');
 assert.equal((await post(url,'/connection/models',{...draft,baseUrl:url+'/v1'})).status,400);
 assert.equal((await post(url,'/connection/models',draft,{origin:'https://other.invalid'})).status,403);
 assert.equal(calls.length,1);
});

test('editing settings and fetching models reuse the server key only for the same endpoint',async t=>{
 const calls=[];
 const url=await setup(t,{fetcher:async(endpoint,options)=>{
  calls.push({endpoint,options});
  return endpoint.endsWith('/models')?Response.json({data:[{id:'other-model'}]}):Response.json({choices:[{message:{content:'OK'}}]});
 }});
 assert.equal((await post(url,'/connection',{...draft,textModel:'first-model',agentName:'Unit'})).status,200);
 const response=await fetch(url+'/connection');
 assert.equal(response.headers.get('cache-control'),'no-store');
 const settings=await response.json();
 assert.equal(settings.settings.hasKey,true);
 assert.equal(settings.settings.textModel,'first-model');
 assert.equal(JSON.stringify(settings).includes(draft.apiKey),false);
 const edit={...draft,apiKey:'',reuseKey:true,textModel:'other-model'};
 assert.equal((await post(url,'/connection/models',edit)).status,200);
 assert.equal((await post(url,'/connection',edit)).status,200);
 assert.equal((await post(url,'/v1/chat/completions',{model:'agent',messages:[{role:'user',content:'Hi'}]})).status,200);
 assert.equal(JSON.parse(calls[1].options.body).model,'other-model');
 assert.equal(calls[1].options.headers.authorization,'Bearer '+draft.apiKey);
 for(const path of ['/connection/models','/connection']){
  assert.equal((await post(url,path,{...edit,baseUrl:'https://other.invalid/v1'})).status,400);
  assert.equal((await post(url,path,{...edit,baseUrl:draft.baseUrl+'/other-path'})).status,400);
 }
 assert.equal(calls.length,2);
 assert.equal((await post(url,'/connection',{kind:'clear'})).status,200);
 assert.equal((await (await fetch(url+'/connection')).json()).settings.hasKey,false);
 assert.equal((await post(url,'/connection/models',edit)).status,400);
});

test('keyless compatible and invite connections can discover and select models',async t=>{
 const url=await setup(t,{fetcher:async(_endpoint,options)=>{
  assert.equal(options.headers.authorization,undefined);
  return Response.json({data:[{id:'local-model'}]});
 }});
 for(const body of [
  {kind:'openai-compatible',baseUrl:'http://127.0.0.1:1234/v1'},
  {kind:'invite',alternative:'local',baseUrl:'http://localhost:1234/v1'},
 ]){
  assert.equal((await post(url,'/connection/models',body)).status,200);
  const response=await post(url,'/connection',{...body,textModel:'local-model'});
  assert.equal(response.status,200);assert.equal((await response.json()).auth.mode,'none');
 }
});

test('discovery errors are bounded and do not echo provider diagnostics or keys',async t=>{
 const responses=[
  ()=>Response.json({error:draft.apiKey},{status:401}),
  ()=>Response.json({error:draft.apiKey},{status:404}),
  ()=>new Response('not JSON '+draft.apiKey),
  ()=>Response.json({models:['wrong shape']}),
  ()=>Response.json({data:[{id:'x'.repeat(2*1024*1024)}]}),
 ];
 const url=await setup(t,{fetcher:async()=>responses.shift()()});
 for(let i=0;i<5;i++){
  const response=await post(url,'/connection/models',draft);
  assert.equal(response.status,502);
  assert.equal((await response.text()).includes(draft.apiKey),false);
 }
});

test('model discovery shares concurrency bounds and cancels on timeout and disconnect',async t=>{
 let started,aborted;
 let start=new Promise(resolve=>started=resolve),abort=new Promise(resolve=>aborted=resolve);
 const url=await setup(t,{maxConcurrent:1,timeoutMs:100,fetcher:async(_endpoint,{signal})=>{
  started();await new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted();reject(Error('aborted'));},{once:true}));
 }});
 const pending=post(url,'/connection/models',draft);await start;
 assert.equal((await post(url,'/connection/models',draft)).status,429);
 assert.equal((await pending).status,504);await abort;
 start=new Promise(resolve=>started=resolve);abort=new Promise(resolve=>aborted=resolve);
 const controller=new AbortController();
 const cancelled=fetch(url+'/connection/models',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(draft),signal:controller.signal});
 await start;controller.abort();await assert.rejects(cancelled);await abort;
});
