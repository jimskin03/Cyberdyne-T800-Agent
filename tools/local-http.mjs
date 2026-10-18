export function sendJson(res,status,value){
 if(res.destroyed||res.writableEnded)return;
 res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(JSON.stringify(value));
}
export function guardLocalRequest(req,res,{allowedOrigins=[]}={}){
 const host=req.headers.host||'',port=req.socket.localPort;
 const origins=new Set(['http://127.0.0.1:5340','http://localhost:5340',...allowedOrigins]);
 if(!new RegExp('^(127\\.0\\.0\\.1|localhost):'+port+'$').test(host)||
    req.headers['sec-fetch-site']==='cross-site'){
  sendJson(res,403,{error:'Local scene clients only.'});return false;
 }
 if(req.headers.origin&&!origins.has(req.headers.origin)){
  sendJson(res,403,{code:'scene_origin_not_allowed',error:'Scene origin is not allowed. Set API_ALLOWED_ORIGINS on the adapter for your scene address, then restart npm run api.'});return false;
 }
 if(req.method==='POST'&&!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){
  sendJson(res,415,{error:'Use application/json.'});return false;
 }
 return true;
}
export async function readJson(req,{limit=8*1024*1024}={}){
 if(Number(req.headers['content-length'])>limit)throw Object.assign(Error('Request too large.'),{status:413});
 const chunks=[];let size=0;
 req.setTimeout(15000,()=>req.destroy());
 for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(Error('Request too large.'),{status:413});chunks.push(chunk);}
 req.setTimeout(0);
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('Invalid JSON.'),{status:400});}
}
