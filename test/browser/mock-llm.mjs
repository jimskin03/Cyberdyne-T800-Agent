import http from 'node:http';

let connected=false;
let agentName='Agent';
let chatCalls=0;
let visionCalls=0;
let connectionCalls=0;

const json=(res,status,body)=>{
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(body));
};
const body=async req=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  if(!chunks.length)return {};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return {};}
};
const health=()=>connected?{
  status:'ok',vision:true,
  agent:{name:agentName},
  auth:{mode:'none',connected:true},
  connection:{source:'session',kind:'invite',alternative:'local',host:'127.0.0.1'},
}:{
  status:'unconfigured',vision:false,
  agent:{name:'Agent'},
  auth:{mode:'none',connected:true},
  connection:{source:'none',kind:'none',alternative:'',host:''},
};

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:18081');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,health());
  if(req.method==='POST'&&url.pathname==='/connection'){
    const data=await body(req);connectionCalls++;
    if(data.kind==='clear'){connected=false;agentName='Agent';return json(res,200,{ok:true});}
    connected=true;agentName=String(data.agentName||'Mock T-800').slice(0,80);
    return json(res,200,{ok:true});
  }
  if(req.method==='POST'&&url.pathname==='/auth/logout')return json(res,200,{ok:true});
  if(req.method==='POST'&&url.pathname==='/v1/chat/completions'){
    const data=await body(req);
    if(data.model==='vision'){
      visionCalls++;
      return json(res,200,{choices:[{message:{content:'You see the table clearly. A small puzzle cube rests on its surface.'}}]});
    }
    chatCalls++;
    return json(res,200,{choices:[{message:{content:JSON.stringify({
      thought:'I register the latest message.',
      say:'Mock reply '+chatCalls+'.',
      speechKind:'address',
      vocalize:'',
      actions:[],
      remember:'',
    })}}]});
  }
  if(req.method==='POST'&&url.pathname==='/__reset'){
    connected=false;agentName='Agent';chatCalls=0;visionCalls=0;connectionCalls=0;
    return json(res,200,{ok:true});
  }
  if(req.method==='GET'&&url.pathname==='/__state')return json(res,200,{connected,agentName,chatCalls,visionCalls,connectionCalls});
  json(res,404,{error:'not found'});
});
server.listen(18081,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
