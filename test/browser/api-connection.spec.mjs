import {test,expect} from '@playwright/test';
import {once} from 'node:events';
import {apiConfiguration,createApiServer} from '../../tools/api-server.mjs';

test('private scene connection explains backend failures and connects through an allowed origin',async({page,baseURL})=>{
 test.setTimeout(180_000);
 const origin='http://cell.test',key='mock-private-scene-fixture',calls=[],errors=[];
 const server=createApiServer(apiConfiguration({API_ALLOWED_ORIGINS:origin}),{
  fetcher:async(endpoint,options)=>{
   calls.push({endpoint,authorization:options.headers.authorization,body:JSON.parse(options.body)});
   return Response.json({choices:[{message:{content:JSON.stringify({thought:'Connected',say:'Mock private scene reply',actions:[]})}}]});
  },
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const backend='http://127.0.0.1:'+server.address().port;
 let phase='missing';
 page.on('pageerror',error=>errors.push(String(error)));
 try{
  await page.setViewportSize({width:1152,height:720});
  // Model the dev proxy: forward to loopback, preserve the private browser Origin.
  await page.route(origin+'/**',async route=>{
   const path=route.request().url().slice(origin.length);
   if(path.startsWith('/llm/')){
    if(path==='/llm/connection'&&phase==='missing')return route.fulfill({status:500,contentType:'text/plain',body:''});
    const response=await route.fetch({url:backend+path.slice(4),headers:{...route.request().headers(),origin:phase==='blocked'?'http://blocked.test':origin,'sec-fetch-site':'same-origin'}});
    return route.fulfill({response});
   }
   const response=await route.fetch({url:baseURL+path});
   return route.fulfill({response});
  });
  await page.goto(origin+'/');
  await page.waitForFunction(()=>window.__CELL?.world);
  await page.locator('#go').click();
  await expect(page.locator('#start')).toHaveClass(/gone/);
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
  await expect(page.locator('#agent-connection-error')).toContainText('API_ALLOWED_ORIGINS');
  await expect(page.locator('#openai-api-form')).toBeVisible();
  await expect(page.locator('#use-brain')).not.toBeChecked();

  phase='allowed';await submit();
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
  expect(calls[0].endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');
  expect(calls[0].authorization).toBe('Bearer '+key);
  expect(calls[0].body.model).toBe('openrouter/free');
  expect(errors).toEqual([]);
 }finally{
  await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
 }
});
