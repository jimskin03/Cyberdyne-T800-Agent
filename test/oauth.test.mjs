import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import http from 'node:http';
import {createOAuth,oauthConfiguration,OAUTH_REDIRECT_URI} from '../tools/oauth.mjs';
import {apiConfiguration,createApiServer} from '../tools/api-server.mjs';

const privateToken=['unit','oauth','token'].join('-'),privateRefresh=['unit','refresh','token'].join('-');
const config={authorizationUrl:'https://identity.invalid/authorize',tokenUrl:'https://identity.invalid/token',clientId:'unit-client',clientSecret:'unit-secret',scope:'model.invoke',redirectUri:OAUTH_REDIRECT_URI};
const api={endpoint:'https://inference.invalid/v1/chat/completions',textModel:'unit-agent',visionModel:'',creativeModel:'unit-creative',agentName:'My Agent',authMode:'oauth',oauth:config};
const begin=oauth=>new URL(oauth.begin());
const callback=url=>new URLSearchParams({state:url.searchParams.get('state'),code:'unit-code'});
async function setup(t,options={},settings=api){const copy={...settings,oauth:settings.oauth?{...settings.oauth}:null};const server=createApiServer(copy,options);server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;if(copy.oauth)copy.oauth.redirectUri=base+'/auth/callback';t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));return base;}
const post=(url,body={model:'agent',messages:[{role:'user',content:'hello'}]})=>fetch(url+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('OAuth authorization uses expiring single-use state and PKCE; tokens remain server-side',async()=>{
 const calls=[];const oauth=createOAuth(config,{fetcher:async(url,options)=>{calls.push({url,options,fields:new URLSearchParams(options.body)});return Response.json({access_token:privateToken,refresh_token:privateRefresh,token_type:'Bearer',expires_in:3600});}});
 assert.equal(oauth.connected,false);const authorization=begin(oauth);
 assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');assert(!authorization.href.includes(config.clientSecret));
 assert.equal(authorization.searchParams.get('redirect_uri'),OAUTH_REDIRECT_URI);
 await oauth.callback(callback(authorization));assert.equal(oauth.connected,true);assert.equal(await oauth.accessToken(),privateToken);
 const fields=calls[0].fields;assert.equal(fields.get('grant_type'),'authorization_code');assert.equal(fields.get('client_secret'),config.clientSecret);
 assert.equal(createHash('sha256').update(fields.get('code_verifier')).digest('base64url'),authorization.searchParams.get('code_challenge'));
 await assert.rejects(oauth.callback(callback(authorization)),{status:401});assert.equal(calls.length,1);assert.equal(calls[0].options.redirect,'error');
});
test('expired, mismatched, duplicate state and denied callbacks never exchange tokens',async()=>{
 let clock=0,calls=0;const oauth=createOAuth(config,{now:()=>clock,stateLifetimeMs:10,fetcher:async()=>{calls++;throw Error('should not call');}});
 const authorization=begin(oauth);await assert.rejects(oauth.callback(new URLSearchParams({state:'wrong',code:'code'})),{status:401});
 clock=11;await assert.rejects(oauth.callback(callback(authorization)),{status:401});
 const denied=callback(begin(oauth));denied.set('error','private denial diagnostic');await assert.rejects(oauth.callback(denied),error=>error.status===401&&!error.message.includes('private'));
 const duplicate=callback(begin(oauth));duplicate.append('state','other');await assert.rejects(oauth.callback(duplicate),{status:401});assert.equal(calls,0);
});
test('expired tokens refresh once for concurrent calls and retain rotated refresh token only in memory',async()=>{
 let clock=0,calls=0;const grants=[];
 const oauth=createOAuth(config,{now:()=>clock,fetcher:async(_url,options)=>{calls++;grants.push(new URLSearchParams(options.body));await new Promise(resolve=>setImmediate(resolve));return Response.json({access_token:calls===1?'first-token':privateToken,refresh_token:calls===1?privateRefresh:'rotated-refresh',expires_in:60});}});
 await oauth.callback(callback(begin(oauth)));clock=61000;
 const values=await Promise.all([oauth.accessToken(),oauth.accessToken()]);assert.deepEqual(values,[privateToken,privateToken]);assert.equal(calls,2);assert.equal(grants[1].get('grant_type'),'refresh_token');assert.equal(grants[1].get('refresh_token'),privateRefresh);
 clock=122000;await oauth.accessToken();assert.equal(grants[2].get('refresh_token'),'rotated-refresh');oauth.clear();assert.equal(oauth.connected,false);await assert.rejects(oauth.accessToken(),{status:401});
});
test('OAuth failures do not expose token endpoint bodies and require reconnect after failed refresh',async()=>{
 let clock=0,calls=0;const oauth=createOAuth(config,{now:()=>clock,fetcher:async()=>{calls++;return calls===1?Response.json({access_token:privateToken,refresh_token:privateRefresh,expires_in:60}):Response.json({error_description:privateToken},{status:400});}});
 await oauth.callback(callback(begin(oauth)));clock=61000;await assert.rejects(oauth.accessToken(),error=>error.status===401&&!error.message.includes(privateToken));assert.equal(oauth.connected,false);
 const malformed=createOAuth(config,{fetcher:async()=>Response.json({access_token:'bad\nheader',expires_in:60})});await assert.rejects(malformed.callback(callback(begin(malformed))),{status:401});
});
test('logout while token exchange is pending prevents stale credentials from reconnecting',async()=>{
 let complete;const oauth=createOAuth(config,{fetcher:()=>new Promise(resolve=>complete=resolve)});const pending=oauth.callback(callback(begin(oauth)));oauth.clear();complete(Response.json({access_token:privateToken}));await assert.rejects(pending,{status:401});assert.equal(oauth.connected,false);
});
test('API OAuth health/login/callback/auth headers/logout work without exposing credentials',async t=>{
 const calls=[];const base=await setup(t,{fetcher:async(url,options)=>{calls.push({url,options});return url===config.tokenUrl?Response.json({access_token:privateToken,expires_in:3600}):Response.json({choices:[{message:{content:'hello'}}]});}});
 const initial=await (await fetch(base+'/health')).json();assert.equal(initial.status,'auth_required');assert.deepEqual(initial.agent,{name:'My Agent'});assert.deepEqual(initial.auth,{mode:'oauth',connected:false,loginUrl:'/llm/auth/login'});assert.equal(calls.length,0);
 assert.equal((await post(base)).status,401);assert.equal((await fetch(base+'/auth/login',{headers:{'sec-fetch-site':'cross-site'},redirect:'manual'})).status,403);
 const login=await fetch(base+'/auth/login',{redirect:'manual'});assert.equal(login.status,302);const authorization=new URL(login.headers.get('location'));
 const spoofed=await new Promise((resolve,reject)=>{const req=http.get(base+'/auth/callback?'+callback(authorization),{headers:{host:'untrusted.invalid','sec-fetch-site':'cross-site'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(spoofed,403);assert.equal(calls.length,0);
 const signedIn=await fetch(base+'/auth/callback?'+callback(authorization),{headers:{'sec-fetch-site':'cross-site'}});assert.equal(signedIn.status,200);assert(!(await signedIn.text()).includes(privateToken));
 const health=await (await fetch(base+'/health')).json();assert.equal(health.status,'ok');assert.equal(health.auth.connected,true);assert(!JSON.stringify(health).includes(privateToken));
 assert.equal((await post(base)).status,200);assert.equal(calls[1].options.headers.authorization,'Bearer '+privateToken);
 assert.equal((await fetch(base+'/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,200);assert.equal((await (await fetch(base+'/health')).json()).status,'auth_required');
});
test('none authentication sends no key; named agent and creative alias are independent of model IDs',async t=>{
 let sent;const base=await setup(t,{fetcher:async(_url,options)=>{sent=options;return Response.json({choices:[{message:{content:'created'}}]});}},{...api,authMode:'none',key:'ignored-local-key'});
 const health=await (await fetch(base+'/health')).json();assert.equal(health.status,'ok');assert.equal(health.auth.mode,'none');
 assert.equal((await post(base,{model:'creative',messages:[{role:'user',content:'create'}]})).status,200);assert.equal(JSON.parse(sent.body).model,'unit-creative');assert.equal(sent.headers.authorization,undefined);
});
test('invite sign-in keeps the registered adapter and ignores a client endpoint or key',async t=>{
 const supplied=['client','supplied','secret'].join('-');
 const base=await setup(t,{fetcher:async(url,options)=>{return url===config.tokenUrl?Response.json({access_token:privateToken,expires_in:3600}):Response.json({choices:[{message:{content:'hello'}}]});}});
 const response=await fetch(base+'/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'invite',alternative:'sign-in',baseUrl:'https://evil.invalid/v1',apiKey:supplied,textModel:'client-model',agentName:'Invited'})});
 const health=await response.json();assert.equal(response.status,200);assert.equal(health.status,'auth_required');assert.equal(health.auth.loginUrl,'/llm/auth/login');assert.equal(health.agent.name,'Invited');assert.equal(health.connection.alternative,'sign-in');assert.equal(health.connection.host,'inference.invalid');assert.equal(JSON.stringify(health).includes(supplied),false);
 const login=await fetch(base+'/auth/login',{redirect:'manual'});assert.equal(new URL(login.headers.get('location')).host,'identity.invalid');
 assert.equal((await post(base)).status,401);
});
test('configuration accepts only fixed secure OAuth endpoints and explicit auth modes',()=>{
 const env={API_BASE_URL:'http://127.0.0.1:1234/v1',API_TEXT_MODEL:'unit-model',API_AUTH_MODE:'oauth',OAUTH_AUTHORIZATION_URL:config.authorizationUrl,OAUTH_TOKEN_URL:config.tokenUrl,OAUTH_CLIENT_ID:config.clientId,AGENT_NAME:'Personal Agent',API_CREATIVE_MODEL:'unit-art'};
 const value=apiConfiguration(env);assert.equal(value.agentName,'Personal Agent');assert.equal(value.authMode,'oauth');assert.equal(value.oauth.redirectUri,OAUTH_REDIRECT_URI);assert.equal(value.creativeModel,'unit-art');
 assert.throws(()=>oauthConfiguration({...env,OAUTH_TOKEN_URL:'http://remote.invalid/token'}),/HTTPS/);
 assert.throws(()=>apiConfiguration({...env,API_AUTH_MODE:'unknown'}),/API_AUTH_MODE/);
 assert.throws(()=>oauthConfiguration({...env,OAUTH_CLIENT_ID:''}),/OAUTH_CLIENT_ID/);
});
