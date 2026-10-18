import http from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {guardLocalRequest,readJson,sendJson} from './local-http.mjs';
import {createOAuth,oauthConfiguration,safeEndpoint} from './oauth.mjs';

export function agentLabel(value){
 return String(value||'Agent').replace(/[\x00-\x1F\x7F]/g,'').trim().slice(0,80)||'Agent';
}
function blank(value){return !String(value??'').trim();}
function hostOf(endpoint){try{return new URL(endpoint).hostname;}catch{return '';}}
function unconfigured(env){
 return {configured:false,endpoint:'',key:'',textModel:'',visionModel:'',creativeModel:'',agentName:agentLabel(env.AGENT_NAME),authMode:'none',oauth:null,source:'none',kind:'none',alternative:null,host:''};
}
export function apiConfiguration(env=process.env){
 const authMode=String(env.API_AUTH_MODE||'api-key').trim();
 const idle=blank(env.API_BASE_URL)&&blank(env.API_TEXT_MODEL)&&blank(env.API_KEY)&&blank(env.API_VISION_MODEL)&&blank(env.API_CREATIVE_MODEL)&&blank(env.OAUTH_AUTHORIZATION_URL)&&blank(env.OAUTH_TOKEN_URL)&&blank(env.OAUTH_CLIENT_ID)&&blank(env.OAUTH_CLIENT_SECRET)&&blank(env.OAUTH_SCOPE)&&(blank(env.API_AUTH_MODE)||authMode==='api-key');
 if(idle)return unconfigured(env);
 if(!['api-key','oauth','none'].includes(authMode))throw Error('API_AUTH_MODE must be api-key, oauth, or none.');
 if(!env.API_BASE_URL||!env.API_TEXT_MODEL)throw Error('Set API_BASE_URL and API_TEXT_MODEL in your local .env.');
 const base=safeEndpoint(env.API_BASE_URL,'API_BASE_URL');
 if(base.search)throw Error('API_BASE_URL must not contain queries.');
 return {configured:true,endpoint:base.href.replace(/\/$/,'')+'/chat/completions',key:env.API_KEY||'',textModel:env.API_TEXT_MODEL,visionModel:env.API_VISION_MODEL||'',creativeModel:env.API_CREATIVE_MODEL||'',agentName:agentLabel(env.AGENT_NAME),authMode,oauth:authMode==='oauth'?oauthConfiguration(env):null,source:'env',kind:'configured',alternative:authMode==='oauth'?'sign-in':authMode==='none'?'local':'api-key',host:base.hostname};
}
function reject(status,message){throw Object.assign(Error(message),{status});}
function cleanModel(value,message){
 if(typeof value!=='string')reject(400,message);
 const model=value.trim();
 if(!/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,159}$/.test(model))reject(400,message);
 return model;
}
function cleanSecret(value){
 if(value==null||value==='')return '';
 if(typeof value!=='string'||value.length>512||!/^[\x21-\x7E]+$/.test(value))reject(400,'API key must be a single printable line.');
 return value;
}
function chatEndpoint(value,localPort){
 if(typeof value!=='string'||value.length>300)reject(400,'Set a valid base URL.');
 let base;try{base=safeEndpoint(value.trim(),'Base URL');}catch(error){reject(400,error.message);}
 if(base.search)reject(400,'Base URL must not contain a query.');
 if(localPort&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)&&Number(base.port)===Number(localPort))reject(400,'Base URL cannot point at this adapter.');
 let href=base.href.replace(/\/$/,'');
 if(href.endsWith('/chat/completions'))href=href.slice(0,-'/chat/completions'.length);
 return {endpoint:href+'/chat/completions',host:base.hostname};
}
function requestedName(value,fallback){
 if(value==null||value==='')return fallback||'Agent';
 if(typeof value!=='string')reject(400,'Agent name must be text.');
 return agentLabel(value);
}
export function operatorConnection(body,{oauthAvailable=false,fallback=null,localPort=0}={}){
 if(!body||typeof body!=='object'||Array.isArray(body))reject(400,'Expected a JSON object.');
 if(body.kind==='openai-compatible'){
  const target=chatEndpoint(body.baseUrl,localPort),key=cleanSecret(body.apiKey);
  if(!key)reject(400,'An API key is required for an OpenAI-compatible API.');
  return {configured:true,source:'session',kind:'openai-compatible',alternative:'api-key',authMode:'api-key',endpoint:target.endpoint,host:target.host,key,textModel:cleanModel(body.textModel,'Set a model id.'),visionModel:body.visionModel==null||body.visionModel===''?'':cleanModel(body.visionModel,'Vision model id is invalid.'),creativeModel:'',agentName:requestedName(body.agentName,fallback?.agentName),usesOAuth:false};
 }
 if(body.kind!=='invite')reject(400,'Unknown connection option.');
 if(!['local','api-key','sign-in'].includes(body.alternative))reject(400,'Choose a local server, an API key, or sign-in.');
 if(body.alternative==='sign-in'){
  if(!oauthAvailable||!fallback?.endpoint)reject(409,'Sign-in is not configured on this adapter.');
  return {usesOAuth:true,source:'session',kind:'invite',alternative:'sign-in',authMode:'oauth',agentName:requestedName(body.agentName,fallback.agentName)};
 }
 const target=chatEndpoint(body.baseUrl,localPort),key=cleanSecret(body.apiKey);
 if(body.alternative==='local'&&key)reject(400,'A local server invite does not take an API key.');
 if(body.alternative==='api-key'&&!key)reject(400,'An API key is required for this alternative.');
 return {configured:true,source:'session',kind:'invite',alternative:body.alternative,authMode:body.alternative==='local'?'none':'api-key',endpoint:target.endpoint,host:target.host,key:body.alternative==='local'?'':key,textModel:cleanModel(body.textModel,'Set a model id.'),visionModel:body.visionModel==null||body.visionModel===''?'':cleanModel(body.visionModel,'Vision model id is invalid.'),creativeModel:'',agentName:requestedName(body.agentName,fallback?.agentName),usesOAuth:false};
}
export function createApiServer(config,{fetcher=fetch,timeoutMs=120000,maxConcurrent=3,oauthOptions={}}={}){
 let active=0,session=null;
 const oauth=config.authMode==='oauth'&&config.oauth?createOAuth(config.oauth,{fetcher,...oauthOptions}):null;
 const modeOf=live=>live.authMode||(live.configured===false?'none':'api-key');
 const current=()=>{
  if(session?.usesOAuth)return {...config,agentName:session.agentName||config.agentName,authMode:'oauth',usesOAuth:true,source:'session',kind:'invite',alternative:'sign-in',host:config.host||hostOf(config.endpoint),configured:config.configured!==false};
  if(session)return session;
  if(config.configured===false)return config;
  return {...config,source:config.source||'env',kind:config.kind||'configured',alternative:config.alternative||(modeOf(config)==='oauth'?'sign-in':modeOf(config)==='none'?'local':'api-key'),host:config.host||hostOf(config.endpoint)};
 };
 const connectedOf=live=>{
  if(live.configured===false||!live.endpoint)return false;
  const mode=modeOf(live);
  if(mode==='none')return true;
  if(mode==='oauth')return !!oauth?.connected;
  return !!live.key;
 };
 const authStatus=live=>{const mode=modeOf(live);return {mode,connected:connectedOf(live),...(mode==='oauth'&&oauth?{loginUrl:'/llm/auth/login'}:{})};};
 const publicConnection=live=>{
  if(live.configured===false||!live.endpoint)return {source:'none',kind:'none',alternative:null,host:''};
  const alternative=['api-key','local','sign-in'].includes(live.alternative)?live.alternative:modeOf(live)==='oauth'?'sign-in':modeOf(live)==='none'?'local':'api-key';
  return {source:live.source==='session'?'session':'env',kind:['openai-compatible','invite','configured'].includes(live.kind)?live.kind:'configured',alternative,host:typeof live.host==='string'?live.host:''};
 };
 const healthBody=live=>({status:live.configured===false||!live.endpoint?'unconfigured':connectedOf(live)?'ok':'auth_required',vision:!!live.visionModel,agent:{name:live.agentName||'Agent'},auth:authStatus(live),connection:publicConnection(live),brain:'configured-api-adapter',upstreamChecked:false});
 return http.createServer(async(req,res)=>{
  const send=(status,value)=>sendJson(res,status,value);
  const pathname=(req.url||'').split('?')[0];
  // Authorization servers return a cross-site browser navigation. Only this route
  // bypasses the usual Origin check; fixed Host, PKCE and single-use state remain.
  if(oauth&&pathname==='/auth/callback'){
   if(req.method!=='GET'||req.headers.host!==new URL(config.oauth.redirectUri).host||req.headers.host!=='127.0.0.1:'+req.socket.localPort)return send(403,{error:'Invalid callback host or method.'});
   try{
    const url=new URL(req.url,'http://127.0.0.1');await oauth.callback(url.searchParams);
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
    res.end('<!doctype html><meta charset="utf-8"><title>Account connected</title><p>Account connected. You can close this tab and return to the scene.</p>');
   }catch{send(401,{error:'Sign-in failed or expired. Return to the scene and try again.'});}
   return;
  }
  if(!guardLocalRequest(req,res))return;
  if(req.method==='GET'&&req.url==='/health')return send(200,healthBody(current()));
  if(oauth&&current().authMode==='oauth'&&req.method==='GET'&&req.url==='/auth/login'){
   res.writeHead(302,{location:oauth.begin(),'cache-control':'no-store','referrer-policy':'no-referrer'});res.end();return;
  }
  if(oauth&&req.method==='POST'&&req.url==='/auth/logout'){oauth.clear();return send(200,{status:'disconnected'});}
  if(req.method==='POST'&&pathname==='/connection'){
   try{
    const body=await readJson(req,{limit:16*1024});
    if(body?.kind==='clear')session=null;
    else session=operatorConnection(body,{oauthAvailable:!!(oauth&&config.endpoint&&config.configured!==false),fallback:config,localPort:req.socket.localPort});
    return send(200,healthBody(current()));
   }catch(error){return send(error.status||400,{error:error.status?String(error.message).slice(0,180):'Connection was rejected.'});}
  }
  if(req.method!=='POST'||req.url!=='/v1/chat/completions')return send(404,{error:'Not found.'});
  const live=current();
  if(!connectedOf(live))return send(401,{error:'Authentication required. Connect your account or configure local credentials.'});
  if(active>=maxConcurrent)return send(429,{error:'Adapter is busy. Retry later.'});
  active++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const cancel=()=>{if(!res.writableEnded)controller.abort();};res.on('close',cancel);
  try{
   const body=await readJson(req);
   if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:'Expected a JSON object.'});
   if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>100||body.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||!(typeof m.content==='string'||Array.isArray(m.content))))return send(400,{error:'Invalid messages.'});
   if(!['agent','vision','creative'].includes(body.model)||body.stream===true)return send(400,{error:'Unsupported model alias or streaming request.'});
   if(body.max_tokens!==undefined&&(!Number.isInteger(body.max_tokens)||body.max_tokens<1||body.max_tokens>12000))return send(400,{error:'Invalid token limit.'});
   if(body.temperature!==undefined&&(!Number.isFinite(body.temperature)||body.temperature<0||body.temperature>2))return send(400,{error:'Invalid temperature.'});
   if(body.messages.some(m=>Array.isArray(m.content)&&m.content.some(part=>!part||!['text','image_url'].includes(part.type)||(part.type==='text'&&typeof part.text!=='string')||(part.type==='image_url'&&typeof part.image_url?.url!=='string'))))return send(400,{error:'Invalid content parts.'});
   const hasImages=body.messages.some(m=>Array.isArray(m.content)&&m.content.some(part=>part?.type==='image_url'));
   if(hasImages&&!live.visionModel)return send(400,{error:'Configure API_VISION_MODEL for image requests.'});
   const messages=body.messages.map(m=>({role:m.role,content:Array.isArray(m.content)&&!m.content.some(p=>p.type==='image_url')?m.content.map(p=>p.text).join('\n'):m.content}));
   const model=body.model==='vision'?(live.visionModel||live.textModel):body.model==='creative'?(live.creativeModel||live.visionModel||live.textModel):live.textModel;
   const payload={model,messages,stream:false};
   for(const field of ['max_tokens','temperature'])if(body[field]!==undefined)payload[field]=body[field];
   const headers={'content-type':'application/json'};
   const token=live.authMode==='oauth'?await oauth.accessToken():modeOf(live)==='api-key'?live.key:'';
   if(controller.signal.aborted)throw Error('Request cancelled.');
   if(token)headers.authorization='Bearer '+token;
   // Client chat requests cannot choose the upstream URL, model ID, or authorization header.
   const upstream=await fetcher(live.endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal,redirect:'error'});
   if(!upstream.ok){await upstream.body?.cancel();return send(502,{error:'Provider request failed. Verify endpoint, credentials, models, and quota locally.'});}
   const chunks=[];let bytes=0;
   for await(const chunk of upstream.body){bytes+=chunk.length;if(bytes>2*1024*1024){controller.abort();return send(502,{error:'Provider response is too large.'});}chunks.push(chunk);}
   const text=Buffer.concat(chunks).toString('utf8');
   let data;try{data=JSON.parse(text);}catch{return send(502,{error:'Provider did not return JSON.'});}
   const content=data.choices?.[0]?.message?.content;
   if(typeof content!=='string'||!content.trim())return send(502,{error:'Provider response must contain choices[0].message.content as text.'});
   send(200,{choices:[{message:{role:'assistant',content}}]});
  }catch(error){send(error.status|| (controller.signal.aborted?504:502),{error:error.status?error.message:controller.signal.aborted?'Provider request timed out.':'API adapter request failed.'});}
  finally{clearTimeout(timer);res.off('close',cancel);active--;}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const config=apiConfiguration();
  createApiServer(config).listen(18081,'127.0.0.1',()=>console.log(config.configured===false?'Cell API adapter listening on loopback port 18081. No API configured; add one from the scene.':'Cell API adapter listening on loopback port 18081.'));
 }
 catch(error){console.error(error.message);process.exitCode=1;}
}
