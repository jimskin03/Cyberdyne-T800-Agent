import {oauthConfiguration,safeEndpoint} from '../oauth.mjs';

export function agentLabel(value){
 return String(value||'Agent').replace(/[\x00-\x1F\x7F]/g,'').trim().slice(0,80)||'Agent';
}
const blank=value=>!String(value??'').trim();
const reject=(status,message)=>{throw Object.assign(Error(message),{status});};
function allowedSceneOrigins(value){
 const origins=String(value||'').split(/[\s,]+/).filter(Boolean).map(value=>{
  let url;try{url=new URL(value);}catch{throw Error('API_ALLOWED_ORIGINS must contain exact HTTP or HTTPS origins.');}
  if(!['http:','https:'].includes(url.protocol)||url.hostname.includes('*')||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('API_ALLOWED_ORIGINS must contain exact HTTP or HTTPS origins without wildcards, credentials, paths, queries, or fragments.');
  return url.origin;
 });
 return [...new Set(origins)];
}
function unconfigured(env){
 return {configured:false,endpoint:'',key:'',textModel:'',visionModel:'',creativeModel:'',agentName:agentLabel(env.AGENT_NAME),authMode:'none',oauth:null,source:'none',kind:'none',alternative:null,host:''};
}
export function apiConfiguration(env=process.env){
 const allowedOrigins=allowedSceneOrigins(env.API_ALLOWED_ORIGINS);
 const authMode=String(env.API_AUTH_MODE||'api-key').trim();
 const idle=blank(env.API_BASE_URL)&&blank(env.API_TEXT_MODEL)&&blank(env.API_KEY)&&blank(env.API_VISION_MODEL)&&blank(env.API_CREATIVE_MODEL)&&blank(env.OAUTH_AUTHORIZATION_URL)&&blank(env.OAUTH_TOKEN_URL)&&blank(env.OAUTH_CLIENT_ID)&&blank(env.OAUTH_CLIENT_SECRET)&&blank(env.OAUTH_SCOPE)&&(blank(env.API_AUTH_MODE)||authMode==='api-key');
 if(idle)return {...unconfigured(env),allowedOrigins};
 if(!['api-key','oauth','none'].includes(authMode))throw Error('API_AUTH_MODE must be api-key, oauth, or none.');
 if(!env.API_BASE_URL||!env.API_TEXT_MODEL)throw Error('Set API_BASE_URL and API_TEXT_MODEL in your local .env.');
 const base=safeEndpoint(env.API_BASE_URL,'API_BASE_URL');
 if(base.search)throw Error('API_BASE_URL must not contain queries.');
 return {configured:true,endpoint:base.href.replace(/\/$/,'')+'/chat/completions',key:env.API_KEY||'',textModel:env.API_TEXT_MODEL,visionModel:env.API_VISION_MODEL||'',creativeModel:env.API_CREATIVE_MODEL||'',agentName:agentLabel(env.AGENT_NAME),authMode,oauth:authMode==='oauth'?oauthConfiguration(env):null,source:'env',kind:'configured',alternative:authMode==='oauth'?'sign-in':authMode==='none'?'local':'api-key',host:base.hostname,allowedOrigins};
}
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
