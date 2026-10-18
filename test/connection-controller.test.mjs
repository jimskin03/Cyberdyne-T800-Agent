import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionController,connectionFailureMessage} from '../src/cell/ui/connection-controller.js';

function harness(fetcher){
 const elements=new Map(),messages=[];
 const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',hidden:false,children:[],setAttribute(){},focus(){},replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);}});
  return elements.get(id);
 };
 element('invite-alternative').value='local';
 createConnectionController({document:{getElementById:element,createElement:()=>({})},window:{},fetcher,mind:{},state:{},sessionStore:{},actions:{},toast:message=>messages.push(message)});
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

test('model discovery fills a selector while preserving manual entry and the unsaved key',async()=>{
 let request;
 const fixture=harness(async(url,options)=>{request={url,options};return Response.json({models:['first-model','other-model']});});
 await fixture.element('openai-fetch-models').onclick();
 assert.equal(request.url,'/llm/connection/models');
 assert.equal(JSON.parse(request.options.body).apiKey,'mock-only-fixture');
 assert.match(fixture.element('openai-model-status').textContent,/2 models found/);
 assert.equal(fixture.element('openai-model-options-row').hidden,false);
 assert.equal(fixture.element('openai-key').value,'mock-only-fixture');
 fixture.element('openai-model-options').value='other-model';
 fixture.element('openai-model-options').onchange();
 assert.equal(fixture.element('openai-model').value,'other-model');
});

test('discovery failure leaves manual model entry usable and never claims a connection',async()=>{
 const fixture=harness(async()=>Response.json({error:'Enter a model ID manually.'},{status:502}));
 await fixture.element('openai-fetch-models').onclick();
 assert.equal(fixture.element('openai-fetch-models').disabled,false);
 assert.equal(fixture.element('agent-connection-error').textContent,'Enter a model ID manually.');
 assert.equal(fixture.element('openai-model').value,'openrouter/free');
 assert.equal(fixture.element('openai-model-options-row').hidden,true);
});

test('closing a form aborts discovery and ignores a late response',async()=>{
 let finish,signal;
 const fixture=harness((_url,options)=>{signal=options.signal;return new Promise(resolve=>finish=resolve);});
 const pending=fixture.element('openai-fetch-models').onclick();
 fixture.element('openai-api-cancel').onclick();
 assert.equal(signal.aborted,true);
 finish(Response.json({models:['stale-model']}));await pending;
 assert.equal(fixture.element('openai-model-options-row').hidden,true);
 assert.equal(fixture.element('openai-model-status').textContent,'');
 assert.equal(fixture.element('openai-key').value,'');
});

test('opening settings restores non-secret fields and does not overwrite edits made while loading',async()=>{
 const settings={baseUrl:'https://provider.invalid/v1',textModel:'saved-model',hasKey:true,alternative:'api-key',agentName:'Unit'};
 let finish;
 const fixture=harness(()=>new Promise(resolve=>finish=resolve));
 fixture.element('openai-api-form').hidden=true;
 const pending=fixture.element('openai-api-toggle').onclick();
 finish(Response.json({settings}));await pending;
 assert.equal(fixture.element('openai-model').value,'saved-model');
 assert.equal(fixture.element('openai-key').value,'');
 assert.equal(fixture.element('openai-reuse-key').checked,true);
 fixture.element('openai-api-cancel').onclick();
 const editing=fixture.element('openai-api-toggle').onclick();
 fixture.element('openai-model').value='my-edit';
 fixture.element('openai-api-form').oninput();
 finish(Response.json({settings}));await editing;
 assert.equal(fixture.element('openai-model').value,'my-edit');
});
