import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionState} from '../tools/api/connection-state.mjs';
import {validateChatRequest} from '../tools/api/request-validation.mjs';

test('connection state switches session configuration without exposing credentials in health',()=>{
 const base={configured:true,endpoint:'https://provider.invalid/v1/chat/completions',key:'secret',textModel:'text',visionModel:'',agentName:'Agent',authMode:'api-key',source:'env',kind:'configured',alternative:'api-key',host:'provider.invalid'};
 const state=createConnectionState(base,null);
 assert.equal(state.current().endpoint,base.endpoint);
 state.set({...base,source:'session',kind:'openai-compatible',host:'other.invalid',endpoint:'https://other.invalid/v1/chat/completions',key:'other-secret'});
 const health=state.health(state.current());
 assert.equal(health.connection.host,'other.invalid');
 assert.equal(JSON.stringify(health).includes('secret'),false);
 state.clear();assert.equal(state.current().endpoint,base.endpoint);
});

test('request validation owns aliases, bounds and provider payload projection',()=>{
 const live={textModel:'text-model',visionModel:'vision-model',creativeModel:'creative-model'};
 const value=validateChatRequest({model:'creative',messages:[{role:'user',content:[{type:'text',text:'a'},{type:'text',text:'b'}]}],max_tokens:10,temperature:.5},live);
 assert.equal(value.ok,true);assert.equal(value.payload.model,'creative-model');assert.equal(value.payload.messages[0].content,'a\nb');
 assert.equal(validateChatRequest({model:'unknown',messages:[{role:'user',content:'x'}]},live).ok,false);
 assert.equal(validateChatRequest({model:'vision',messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}]},{...live,visionModel:''}).ok,false);
});
