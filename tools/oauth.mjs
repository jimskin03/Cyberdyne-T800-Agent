import {randomBytes,createHash} from 'node:crypto';

export const OAUTH_REDIRECT_URI='http://127.0.0.1:18081/auth/callback';
export function safeEndpoint(value,label){
 let url;try{url=new URL(value);}catch{throw Error('Set a valid '+label+'.');}
 if(url.username||url.password||url.hash)throw Error(label+' must not contain credentials or fragments.');
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error(label+' requires HTTPS, or HTTP on loopback.');
 return url;
}
export function oauthConfiguration(env){
 const authorization=safeEndpoint(env.OAUTH_AUTHORIZATION_URL,'OAUTH_AUTHORIZATION_URL');
 const token=safeEndpoint(env.OAUTH_TOKEN_URL,'OAUTH_TOKEN_URL');
 if(token.search)throw Error('OAUTH_TOKEN_URL must not contain a query.');
 if(!env.OAUTH_CLIENT_ID?.trim())throw Error('Set OAUTH_CLIENT_ID.');
 return {authorizationUrl:authorization.href,tokenUrl:token.href,clientId:env.OAUTH_CLIENT_ID,clientSecret:env.OAUTH_CLIENT_SECRET||'',scope:env.OAUTH_SCOPE||'',redirectUri:OAUTH_REDIRECT_URI};
}
const authError=(message='Sign in again to connect your account.')=>Object.assign(Error(message),{status:401});
export function createOAuth(config,{fetcher=fetch,now=Date.now,stateLifetimeMs=300000,tokenTimeoutMs=15000}={}){
 const pending=new Map();let tokens=null,refreshing=null,generation=0;
 function valid(){return !!tokens&&tokens.expiresAt>now()+5000;}
 function clear(){generation++;tokens=null;pending.clear();}
 async function exchange(fields){
  const body=new URLSearchParams({client_id:config.clientId,...fields});if(config.clientSecret)body.set('client_secret',config.clientSecret);
  let response;
  try{
   response=await fetcher(config.tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:body.toString(),redirect:'error',signal:AbortSignal.timeout(Math.min(tokenTimeoutMs,15000))});
   if(!response.ok){await response.body?.cancel();throw Error('Token request failed.');}
   const chunks=[];let size=0;
   for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024){await response.body?.cancel().catch(()=>{});throw Error('Token response too large.');}chunks.push(chunk);}
   const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   const expires=value.expires_in===undefined?3600:Number(value.expires_in);
   if(typeof value.access_token!=='string'||!value.access_token||!/^[\x21-\x7E]+$/.test(value.access_token)||(value.token_type!==undefined&&String(value.token_type).toLowerCase()!=='bearer')||!Number.isFinite(expires)||expires<=0)throw Error('Invalid token response.');
   return {accessToken:value.access_token,refreshToken:typeof value.refresh_token==='string'?value.refresh_token:'',expiresAt:now()+expires*1000};
  }catch{throw authError('Account connection failed. Check the local OAuth configuration and try signing in again.');}
 }
 return {
  begin(){
   for(const [state,item]of pending)if(item.expiresAt<=now())pending.delete(state);
   if(pending.size>=8)pending.delete(pending.keys().next().value);
   const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
   pending.set(state,{verifier,expiresAt:now()+Math.min(stateLifetimeMs,300000),generation});
   const url=new URL(config.authorizationUrl);
   for(const [key,value]of Object.entries({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:config.scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);
   return url.href;
  },
  async callback(params){
   if(params.getAll('state').length!==1)throw authError('Invalid or expired sign-in request.');
   const state=params.get('state'),item=pending.get(state);pending.delete(state);
   if(!item||item.expiresAt<=now()||item.generation!==generation)throw authError('Invalid or expired sign-in request.');
   if(params.has('error')||params.getAll('code').length!==1||!params.get('code'))throw authError('Sign-in was not completed.');
   const value=await exchange({grant_type:'authorization_code',code:params.get('code'),redirect_uri:config.redirectUri,code_verifier:item.verifier});
   if(item.generation!==generation)throw authError();tokens=value;
  },
  async accessToken(){
   if(valid())return tokens.accessToken;
   if(!tokens?.refreshToken){tokens=null;throw authError();}
   if(!refreshing){
    const refreshToken=tokens.refreshToken,started=generation;
    refreshing=exchange({grant_type:'refresh_token',refresh_token:refreshToken}).then(value=>{if(started!==generation)throw authError();tokens={...value,refreshToken:value.refreshToken||refreshToken};return tokens.accessToken;}).catch(error=>{if(started===generation)tokens=null;throw error;}).finally(()=>{refreshing=null;});
   }
   return refreshing;
  },
  get connected(){return valid()||!!tokens?.refreshToken;},
  clear
 };
}
