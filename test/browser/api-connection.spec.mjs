import {test,expect} from '@playwright/test';
import {once} from 'node:events';
import {createServer} from 'vite';
import {sceneProxy,llmProxy} from '../../tools/scene-proxy.mjs';
import {apiConfiguration,createApiServer} from '../../tools/api-server.mjs';

test('private scene settings discover and switch models without env configuration',async({page,baseURL})=>{
 test.setTimeout(360_000); // Two model-fetch rounds under software-rendered CI can exceed 180s.
 const origin='http://cell.test',key='mock-private-scene-fixture',calls=[],errors=[];
 const server=createApiServer(apiConfiguration({}),{
  fetcher:async(endpoint,options)=>{
   calls.push({endpoint,authorization:options.headers.authorization,body:options.body?JSON.parse(options.body):null});
   if(endpoint.endsWith('/models'))return Response.json({data:[{id:'unit-model'},{id:'other-model'}]});
   return Response.json({choices:[{message:{content:JSON.stringify({thought:'Connected',say:'Mock private scene reply',actions:[]})}}]});
  },
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const backend='http://127.0.0.1:'+server.address().port;
 const proxy=await createServer({configFile:false,envFile:false,optimizeDeps:{noDiscovery:true,include:[]},plugins:[sceneProxy()],server:{host:'127.0.0.1',port:0,allowedHosts:true,proxy:llmProxy(backend)}});
 await proxy.listen();
 const proxyUrl='http://127.0.0.1:'+proxy.httpServer.address().port;
 let phase='missing';
 page.on('pageerror',error=>errors.push(String(error)));
 try{
  await page.setViewportSize({width:1152,height:720});
  // Send a private Host/Origin through the actual Vite proxy, with no allowlist.
  await page.route(origin+'/**',async route=>{
   const path=route.request().url().slice(origin.length);
   if(path.startsWith('/llm/')){
    if(path==='/llm/connection'&&phase==='missing')return route.fulfill({status:500,contentType:'text/plain',body:''});
    const response=await route.fetch({url:proxyUrl+path,headers:{...route.request().headers(),host:'cell.test',origin:phase==='blocked'?'http://blocked.test':origin,'sec-fetch-site':'same-origin'}});
    return route.fulfill({response});
   }
   const response=await route.fetch({url:baseURL+path});
   return route.fulfill({response});
  });
  await page.goto(origin+'/');
  await page.waitForFunction(()=>window.__CELL?.world);
  await page.locator('#go').click();
  await expect(page.locator('#start')).toHaveClass(/gone/);
  await page.locator('#settings-toggle').click();
  await page.locator('#openai-api-toggle').click();
  await page.locator('#openai-base').fill('https://openrouter.ai/api/v1');
  await page.locator('#openai-model').fill('openrouter/free');
  const submit=async()=>{
   await page.locator('#openai-key').fill(key);
   await page.locator('#openai-model').press('Enter');
  };
  await submit();
  await expect(page.locator('#agent-connection-error')).toContainText('npm run api');
  await expect(page.locator('#openai-key')).toHaveValue('');
  await expect(page.locator('#use-brain')).not.toBeChecked();

  phase='blocked';await submit();
  await expect(page.locator('#agent-connection-error')).toContainText('Open API settings from the scene');
  await expect(page.locator('#openai-api-form')).toBeVisible();
  await expect(page.locator('#use-brain')).not.toBeChecked();

  phase='allowed';
  await page.locator('#openai-key').fill(key);
  await page.locator('#openai-model').fill('');
  await page.locator('#openai-fetch-models').click();
  await expect(page.locator('#openai-model-status')).toContainText('2 models found');
  await expect(page.locator('#use-brain')).not.toBeChecked();
  expect((await (await fetch(backend+'/health')).json()).status).toBe('unconfigured');
  await page.locator('#openai-model-options').selectOption('unit-model');
  await expect(page.locator('#openai-model')).toHaveValue('unit-model');
  await submit();
  await expect(page.locator('#openai-api-form')).toBeHidden();
  await expect(page.locator('#agent-connection-error')).toBeHidden();
  await expect(page.locator('#agent-connection-state')).toContainText('openrouter.ai');
  await expect(page.locator('#use-brain')).toBeChecked();
  const response=await page.evaluate(async()=>{
   const result=await fetch('/llm/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'agent',messages:[{role:'user',content:'Mock connection check'}]})});
   return {status:result.status,body:await result.json()};
  });
  expect(response.status).toBe(200);
  expect(response.body.choices[0].message.content).toContain('Mock private scene reply');
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.find(call=>call.body)?.endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');
  expect(calls.every(call=>call.authorization==='Bearer '+key)).toBe(true);
  expect(calls.find(call=>call.body)?.body.model).toBe('unit-model');
  await page.locator('#openai-api-toggle').click();
  await expect(page.locator('#openai-reuse-key')).toBeChecked();
  await expect(page.locator('#openai-key')).toHaveValue('');
  await page.locator('#openai-fetch-models').click();
  await expect(page.locator('#openai-model-status')).toContainText('2 models found');
  await page.locator('#openai-model-options').selectOption('other-model');
  await page.locator('#openai-model').press('Enter');
  await expect(page.locator('#openai-api-form')).toBeHidden();
  expect((await (await fetch(backend+'/connection')).json()).settings.textModel).toBe('other-model');
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage})+JSON.stringify({...sessionStorage}));
  expect(stored).not.toContain(key);
  await page.locator('#agent-disconnect').click();
  await expect(page.locator('#use-brain')).not.toBeChecked();
  await page.locator('#openai-api-toggle').click();
  await expect(page.locator('#openai-reuse-row')).toBeHidden();
  expect(errors).toEqual([]);
 }finally{
  await proxy.close();
  await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
 }
});

test('phone chat shows provider failure after model discovery and recovers on the next question',async({page})=>{
 test.setTimeout(180_000);
 const key='mock-chat-error-fixture',errors=[];
 let fail=true,failedCalls=0;
 const server=createApiServer(apiConfiguration({}),{fetcher:async(endpoint,options)=>{
  if(endpoint.endsWith('/models'))return Response.json({data:[{id:'unit-model'}]});
  const body=JSON.parse(options.body);
  const isQuestion=JSON.stringify(body.messages).includes('LATEST INTERCOM MESSAGE (answer this first):');
  if(isQuestion&&fail){
   failedCalls++;
   // A provider can report a failure in a successful HTTP response.
   return Response.json({error:{code:402,message:'Private diagnostic '+key}});
  }
  return Response.json({choices:[{message:{content:JSON.stringify({thought:'A new message.',say:isQuestion?'Hello, I can hear you now.':'I listen to the room.',actions:[]})}}]});
 }});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const backend='http://127.0.0.1:'+server.address().port;
 page.on('pageerror',error=>errors.push(String(error)));
 try{
  await page.route('**/llm/**',async route=>{
   const path=new URL(route.request().url()).pathname.replace(/^\/llm/,'');
   const response=await route.fetch({url:backend+path});
   await route.fulfill({response});
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.waitForFunction(()=>window.__CELL?.world);
  await page.locator('#go').click();
  await page.locator('#settings-toggle').click();
  await page.locator('#openai-api-toggle').click();
  await page.locator('#openai-base').fill('https://openrouter.ai/api/v1');
  await page.locator('#openai-key').fill(key);
  await page.locator('#openai-fetch-models').click();
  await expect(page.locator('#openai-model-status')).toContainText('1 models found');
  await page.locator('#openai-model-options').selectOption('unit-model');
  await page.locator('#openai-model').press('Enter');
  await expect(page.locator('#use-brain')).toBeChecked();
  await page.locator('#settings-close').click();
  await page.locator('#ask').fill('Hello, issue 40 greeting');
  await page.locator('#ask').press('Enter');
  await expect(page.locator('#reply-status')).toContainText('insufficient credits or quota',{timeout:45_000});
  expect(await page.evaluate(()=>window.__CELL.state.events.some(event=>event.kind==='intercom'))).toBe(false);
  expect(failedCalls).toBe(1);
  expect(await page.locator('#reply-status').textContent()).not.toContain(key);
  fail=false;
  await page.locator('#ask').fill('Hello again, issue 40 greeting');
  await page.locator('#ask').press('Enter');
  await expect(page.locator('#mind')).toContainText('Hello, I can hear you now.',{timeout:45_000});
  await expect(page.locator('#reply-status')).toHaveText('Reply received.');
  expect(errors).toEqual([]);
 }finally{
  await page.unrouteAll({behavior:'wait'}).catch(()=>{});
  await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
 }
});
