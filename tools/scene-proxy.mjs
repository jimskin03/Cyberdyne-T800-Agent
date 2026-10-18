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

export function llmProxy(target='http://127.0.0.1:18081'){
 return {'^/llm(?:/|\\?|$)':{target,changeOrigin:true,
  // Only reached after guardSceneProxy; do not trust forwarded browser headers.
  headers:{origin:'http://127.0.0.1:5340'},
  rewrite:path=>path.replace(/^\/llm/,'')}};
}
