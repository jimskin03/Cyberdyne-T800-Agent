import http from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {guardLocalRequest,readJson,sendJson} from './local-http.mjs';
import {createOAuth,oauthConfiguration,safeEndpoint} from './oauth.mjs';

export function apiConfiguration(env=process.env){
 if(!env.API_BASE_URL||!env.API_TEXT_MODEL)throw Error('Set API_BASE_URL and API_TEXT_MODEL in your local .env.');
 const base=safeEndpoint(env.API_BASE_URL,'API_BASE_URL');
 if(base.search)throw Error('API_BASE_URL must not contain queries.');
 const authMode=env.API_AUTH_MODE||'api-key';
 if(!['api-key','oauth','none'].includes(authMode))throw Error('API_AUTH_MODE must be api-key, oauth, or none.');
 const agentName=(env.AGENT_NAME||'Agent').replace(/[\x00-\x1F\x7F]/g,'').trim().slice(0,80)||'Agent';
 return {endpoint:base.href.replace(/\/$/,'')+'/chat/completions',key:env.API_KEY||'',textModel:env.API_TEXT_MODEL,visionModel:env.API_VISION_MODEL||'',creativeModel:env.API_CREATIVE_MODEL||'',agentName,authMode,oauth:authMode==='oauth'?oauthConfiguration(env):null};
}
export function createApiServer(config,{fetcher=fetch,timeoutMs=120000,maxConcurrent=3,oauthOptions={}}={}){
 let active=0;
 const authMode=config.authMode||'api-key',oauth=authMode==='oauth'?createOAuth(config.oauth,{fetcher,...oauthOptions}):null;
 const connected=()=>authMode==='none'||(oauth?oauth.connected:!!config.key);
 const authStatus=()=>({mode:authMode,connected:connected(),...(oauth?{loginUrl:'/llm/auth/login'}:{})});
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
  if(req.method==='GET'&&req.url==='/health')return send(200,{status:connected()?'ok':'auth_required',vision:!!config.visionModel,agent:{name:config.agentName||'Agent'},auth:authStatus(),brain:'configured-api-adapter',upstreamChecked:false});
  if(oauth&&req.method==='GET'&&req.url==='/auth/login'){
   res.writeHead(302,{location:oauth.begin(),'cache-control':'no-store','referrer-policy':'no-referrer'});res.end();return;
  }
  if(oauth&&req.method==='POST'&&req.url==='/auth/logout'){oauth.clear();return send(200,{status:'disconnected'});}
  if(req.method!=='POST'||req.url!=='/v1/chat/completions')return send(404,{error:'Not found.'});
  if(!connected())return send(401,{error:'Authentication required. Connect your account or configure local credentials.'});
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
   if(hasImages&&!config.visionModel)return send(400,{error:'Configure API_VISION_MODEL for image requests.'});
   const messages=body.messages.map(m=>({role:m.role,content:Array.isArray(m.content)&&!m.content.some(p=>p.type==='image_url')?m.content.map(p=>p.text).join('\n'):m.content}));
   const model=body.model==='vision'?(config.visionModel||config.textModel):body.model==='creative'?(config.creativeModel||config.visionModel||config.textModel):config.textModel;
   const payload={model,messages,stream:false};
   for(const field of ['max_tokens','temperature'])if(body[field]!==undefined)payload[field]=body[field];
   const headers={'content-type':'application/json'};
   const token=oauth?await oauth.accessToken():authMode==='api-key'?config.key:'';
   if(controller.signal.aborted)throw Error('Request cancelled.');
   if(token)headers.authorization='Bearer '+token;
   // Client-supplied headers, URLs, model IDs, and provider-specific effort are never forwarded.
   const upstream=await fetcher(config.endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal,redirect:'error'});
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
 try{createApiServer(apiConfiguration()).listen(18081,'127.0.0.1',()=>console.log('Cell API adapter listening on loopback port 18081.'));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
