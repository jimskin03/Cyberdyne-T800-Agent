import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionController,connectionFailureMessage} from '../src/cell/ui/connection-controller.js';

function harness(fetcher){
 const elements=new Map(),messages=[];
 const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',hidden:false,setAttribute(){}});
  return elements.get(id);
 };
 element('invite-alternative').value='local';
 createConnectionController({document:{getElementById:element},window:{},fetcher,mind:{},state:{},sessionStore:{},actions:{},toast:message=>messages.push(message)});
 element('openai-base').value='https://openrouter.ai/api/v1';
 element('openai-model').value='openrouter/free';
 element('openai-key').value='mock-only-fixture';
 return {element,messages,submit:()=>element('openai-api-form').onsubmit({preventDefault(){}})};
}

test('empty proxy failures and static hosting responses explain the missing backend',()=>{
 for(const status of [500,502,503,504])assert.match(connectionFailureMessage(status,{}),/npm run api/);
 assert.match(connectionFailureMessage(404,{}),/same-origin \/llm backend/);
 assert.match(connectionFailureMessage(400,null),/configuration/);
 assert.equal(connectionFailureMessage(400,{error:'Set a model id.'}),'Set a model id.');
 assert.equal(connectionFailureMessage(400,{error:'x'.repeat(300)}).length,180);
});

test('proxy failure stays visible by the connection controls and clears the submitted key',async()=>{
 let request;
 const fixture=harness(async(url,options)=>{request={url,options};return new Response('',{status:500});});
 await fixture.submit();
 assert.equal(request.url,'/llm/connection');
 assert.equal(JSON.parse(request.options.body).apiKey,'mock-only-fixture');
 assert.equal(fixture.element('openai-key').value,'');
 assert.equal(fixture.element('openai-api-form').hidden,false);
 assert.equal(fixture.element('agent-connection-error').hidden,false);
 assert.match(fixture.element('agent-connection-error').textContent,/npm run api/);
 assert.equal(fixture.messages.at(-1),fixture.element('agent-connection-error').textContent);
 fixture.element('openai-api-cancel').onclick();
 assert.equal(fixture.element('agent-connection-error').hidden,true);
});

test('backend origin rejection explains the server setting without hiding the form',async()=>{
 const message='Scene origin is not allowed. Set API_ALLOWED_ORIGINS on the adapter for your scene address, then restart npm run api.';
 const fixture=harness(async()=>Response.json({code:'scene_origin_not_allowed',error:message},{status:403}));
 await fixture.submit();
 assert.equal(fixture.element('agent-connection-error').textContent,message);
 assert.equal(fixture.element('agent-connection-error').hidden,false);
 assert.equal(fixture.element('openai-api-form').hidden,false);
});

test('network failure and a non-JSON success do not claim a connection',async()=>{
 const offline=harness(async()=>{throw TypeError('Failed to fetch');});
 await offline.submit();
 assert.match(offline.element('agent-connection-error').textContent,/npm run api/);
 const staticSite=harness(async()=>new Response('<html>static fallback</html>',{status:200}));
 await staticSite.submit();
 assert.match(staticSite.element('agent-connection-error').textContent,/Invalid API adapter response/);
});
