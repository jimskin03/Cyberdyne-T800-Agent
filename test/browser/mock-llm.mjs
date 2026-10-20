import http from 'node:http';

let connected=false;
let agentName='Agent';
let chatCalls=0;
let visionCalls=0;
let connectionCalls=0;
const learned=new Map();
let memoryEpoch=0;

const json=(res,status,body)=>{
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(body));
};
const body=async req=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  if(!chunks.length)return {};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return {};}
};
function promptText(data){
  const chunks=[];
  const push=value=>{
    if(typeof value==='string')chunks.push(value);
    else if(Array.isArray(value))value.forEach(push);
    else if(value&&typeof value.text==='string')chunks.push(value.text);
  };
  for(const message of data.messages||[])push(message.content);
  return chunks.join('\n');
}
// Autonomous thoughts share this endpoint and advance the call counter. An intercom
// answer has to name the question, or a slow run speaks "Mock reply 1" before the test sends anything.
function intercomQuestion(data){
  const marker='LATEST INTERCOM MESSAGE (answer this first):';
  const text=promptText(data);
  const at=text.lastIndexOf(marker);
  if(at<0)return '';
  const quoted=text.slice(at+marker.length,at+marker.length+800).match(/"([^"]+)"/);
  return quoted?quoted[1].trim():'';
}
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
  if(req.method==='GET'&&url.pathname==='/mcp')return json(res,200,{connected:false,name:'',url:'',tools:[],resources:[]});
  if(req.method==='GET'&&url.pathname==='/connection')return json(res,200,{settings:{}});
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
    const question=intercomQuestion(data);
    return json(res,200,{choices:[{message:{content:JSON.stringify({
      thought:'I register the latest message.',
      say:question?`Spoken answer: ${question}`:`Mock reply ${chatCalls}.`,
      speechKind:'address',
      vocalize:'',
      actions:[],
      remember:'',
    })}}]});
  }
  // Minimal learned-memory adapter so the scene sees a working backend store.
  if(url.pathname.startsWith('/memory/')){
    if(req.method==='GET'&&url.pathname==='/memory/status')return json(res,200,{available:true,backend:'local',scope:'cell',count:learned.size,epoch:memoryEpoch});
    if(req.method==='GET'&&url.pathname==='/memory/recall')return json(res,200,{backend:'local',records:[...learned.values()].slice(-6)});
    if(req.method==='POST'&&url.pathname==='/memory/records'){
      const data=await body(req);
      if(Number.isInteger(data.epoch)&&data.epoch!==memoryEpoch)return json(res,409,{code:'memory_stale',error:'Memory sync is stale.',epoch:memoryEpoch});
      for(const r of data.records||[])learned.set(r.id,r);
      return json(res,200,{backend:'local',stored:(data.records||[]).length,acknowledged:(data.records||[]).map(r=>r.id),epoch:memoryEpoch});
    }
    if(req.method==='POST'&&url.pathname==='/memory/clear'){const removed=learned.size;learned.clear();memoryEpoch+=1;return json(res,200,{backend:'local',removed,epoch:memoryEpoch});}
  }
  if(req.method==='POST'&&url.pathname==='/__reset'){
    learned.clear();memoryEpoch=0;connected=false;agentName='Agent';chatCalls=0;visionCalls=0;connectionCalls=0;
    return json(res,200,{ok:true});
  }
  if(req.method==='GET'&&url.pathname==='/__state')return json(res,200,{connected,agentName,chatCalls,visionCalls,connectionCalls});
  json(res,404,{error:'not found'});
});
server.listen(18081,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
