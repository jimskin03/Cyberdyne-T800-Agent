import {sendJson} from './local-http.mjs';

// Validate against the scene's original Host before the loopback proxy rewrites it.
// This works on LAN/Tailscale addresses and alternate ports without an origin list.
export function guardSceneProxy(req,res,next){
 if(!/^\/llm(?:\/|\?|$)/.test(req.url||''))return next();
 const origin=req.headers.origin;
 let matches=!origin;
 if(origin)try{
  const url=new URL(origin);
  matches=['http:','https:'].includes(url.protocol)&&url.origin===origin&&url.host===req.headers.host;
 }catch{}
 if(!matches||req.headers['sec-fetch-site']==='cross-site')
  return sendJson(res,403,{error:'Open API settings from the scene on this server.'});
 next();
}

export function sceneProxy(){
 const install=server=>{server.middlewares.use(guardSceneProxy);};
 return {name:'cell-scene-proxy',configureServer:install,configurePreviewServer:install};
}

const LOOPBACK_ADDRESS=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);
// The operator's own browser on this computer gets the learned-memory token added
// by the proxy, so local setups need no configuration. Requests that arrive through
// LAN, Tailscale or a tunnel keep the Host they were sent to and must bring the
// token themselves from the scene settings.
export function localOperatorRequest(req){
 if(!LOOPBACK_ADDRESS.has(req.socket?.remoteAddress||''))return false;
 try{return ['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+(req.headers.host||'')).hostname);}catch{return false;}
}
export function addMemoryToken(proxyReq,req,token){
 if(!token||!/^\/memory(?:\/|\?|$)/.test(proxyReq.path||''))return false;
 if(req.headers.authorization||!localOperatorRequest(req))return false;
 proxyReq.setHeader('authorization','Bearer '+token);
 return true;
}

export function llmProxy(target='http://127.0.0.1:18081',{memoryToken=()=>''}={}){
 return {'^/llm(?:/|\\?|$)':{target,changeOrigin:true,
  // Only reached after guardSceneProxy; do not trust forwarded browser headers.
  headers:{origin:'http://127.0.0.1:5340'},
  rewrite:path=>path.replace(/^\/llm/,''),
  configure:proxy=>proxy.on('proxyReq',(proxyReq,req)=>{addMemoryToken(proxyReq,req,memoryToken());})}};
}
