import http from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {guardLocalRequest,readJson,sendJson} from './local-http.mjs';
import {createOAuth} from './oauth.mjs';
import {agentLabel,apiConfiguration,operatorConnection} from './api/config.mjs';
import {createConnectionState} from './api/connection-state.mjs';
import {validateChatRequest} from './api/request-validation.mjs';
import {requestUpstream} from './api/upstream.mjs';
import {requestModels} from './api/models.mjs';

export {agentLabel,apiConfiguration,operatorConnection} from './api/config.mjs';

export function createApiServer(config,{fetcher=fetch,timeoutMs=120000,maxConcurrent=3,oauthOptions={}}={}){
 let active=0;
 const oauth=config.authMode==='oauth'&&config.oauth?createOAuth(config.oauth,{fetcher,...oauthOptions}):null;
 const connections=createConnectionState(config,oauth);
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
  if(!guardLocalRequest(req,res,{allowedOrigins:config.allowedOrigins||[]}))return;
  if(req.method==='GET'&&req.url==='/health')return send(200,connections.health(connections.current()));
  if(req.method==='GET'&&pathname==='/connection')return send(200,{settings:connections.settings(connections.current())});
  if(req.method==='POST'&&pathname==='/connection/models'){
   if(active>=maxConcurrent)return send(429,{error:'Adapter is busy. Retry later.'});
   active++;
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(timeoutMs,15000));
   const cancel=()=>{if(!res.writableEnded)controller.abort();};res.on('close',cancel);
   try{
    const body=await readJson(req,{limit:16*1024});
    const live=operatorConnection(body,{current:connections.current(),localPort:req.socket.localPort,discovery:true});
    return send(200,await requestModels({live,fetcher,signal:controller.signal}));
   }catch(error){return send(error.status||(controller.signal.aborted?504:502),{error:error.status?error.message:controller.signal.aborted?'Model fetch timed out.':'Model fetch failed. Check the endpoint and try again.'});}
   finally{clearTimeout(timer);res.off('close',cancel);active--;}
  }
  if(oauth&&connections.current().authMode==='oauth'&&req.method==='GET'&&req.url==='/auth/login'){
   res.writeHead(302,{location:oauth.begin(),'cache-control':'no-store','referrer-policy':'no-referrer'});res.end();return;
  }
  if(oauth&&req.method==='POST'&&req.url==='/auth/logout'){oauth.clear();return send(200,{status:'disconnected'});}
  if(req.method==='POST'&&pathname==='/connection'){
   try{
    const body=await readJson(req,{limit:16*1024});
    if(body?.kind==='clear')connections.clear();
    else connections.set(operatorConnection(body,{oauthAvailable:!!(oauth&&config.endpoint&&config.configured!==false),fallback:config,current:connections.current(),localPort:req.socket.localPort}));
    return send(200,connections.health(connections.current()));
   }catch(error){return send(error.status||400,{error:error.status?String(error.message).slice(0,180):'Connection was rejected.'});}
  }
  if(req.method!=='POST'||req.url!=='/v1/chat/completions')return send(404,{error:'Not found.'});
  const live=connections.current();
  if(!connections.connected(live))return send(401,{error:'Authentication required. Connect your account or configure local credentials.'});
  if(active>=maxConcurrent)return send(429,{error:'Adapter is busy. Retry later.'});
  active++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const cancel=()=>{if(!res.writableEnded)controller.abort();};res.on('close',cancel);
  try{
   const body=await readJson(req);
   const checked=validateChatRequest(body,live);
   if(!checked.ok)return send(checked.status,{error:checked.error});
   const upstream=await requestUpstream({live,payload:checked.payload,oauth,fetcher,signal:controller.signal,modeOf:connections.modeOf});
   if(!upstream.ok){if(upstream.tooLarge)controller.abort();return send(502,{error:upstream.error});}
   send(200,{choices:[{message:{role:'assistant',content:upstream.content}}]});
  }catch(error){send(error.status||(controller.signal.aborted?504:502),{error:error.status?error.message:controller.signal.aborted?'Provider request timed out.':'API adapter request failed.'});}
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
