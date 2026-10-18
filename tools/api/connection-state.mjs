const hostOf=endpoint=>{try{return new URL(endpoint).hostname;}catch{return '';}};
export function createConnectionState(config,oauth){
 let session=null;
 const modeOf=live=>live.authMode||(live.configured===false?'none':'api-key');
 const current=()=>{
  if(session?.usesOAuth)return {...config,agentName:session.agentName||config.agentName,authMode:'oauth',usesOAuth:true,source:'session',kind:'invite',alternative:'sign-in',host:config.host||hostOf(config.endpoint),configured:config.configured!==false};
  if(session)return session;
  if(config.configured===false)return config;
  return {...config,source:config.source||'env',kind:config.kind||'configured',alternative:config.alternative||(modeOf(config)==='oauth'?'sign-in':modeOf(config)==='none'?'local':'api-key'),host:config.host||hostOf(config.endpoint)};
 };
 const connected=live=>{
  if(live.configured===false||!live.endpoint)return false;
  const mode=modeOf(live); if(mode==='none')return true;if(mode==='oauth')return !!oauth?.connected;return !!live.key;
 };
 const auth=live=>{const mode=modeOf(live);return {mode,connected:connected(live),...(mode==='oauth'&&oauth?{loginUrl:'/llm/auth/login'}:{})};};
 const publicConnection=live=>{
  if(live.configured===false||!live.endpoint)return {source:'none',kind:'none',alternative:null,host:''};
  const alternative=['api-key','local','sign-in'].includes(live.alternative)?live.alternative:modeOf(live)==='oauth'?'sign-in':modeOf(live)==='none'?'local':'api-key';
  return {source:live.source==='session'?'session':'env',kind:['openai-compatible','invite','configured'].includes(live.kind)?live.kind:'configured',alternative,host:typeof live.host==='string'?live.host:''};
 };
 const health=live=>({status:live.configured===false||!live.endpoint?'unconfigured':connected(live)?'ok':'auth_required',vision:!!live.visionModel,agent:{name:live.agentName||'Agent'},auth:auth(live),connection:publicConnection(live),brain:'configured-api-adapter',upstreamChecked:false});
 return {current,connected,modeOf,health,set(value){session=value;},clear(){session=null;}};
}
