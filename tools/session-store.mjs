import {mkdir,readFile,writeFile,rename,appendFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
// One serialized writer. Full snapshots plus an append-only memory archive.
export function createSessionStore(directory){
 let queue=Promise.resolve();const known=new Map();
 async function records(mode,visit){try{for await(const line of createInterface({input:createReadStream(join(directory,mode+'-memory.jsonl'),{encoding:'utf8'}),crlfDelay:Infinity})){try{visit(JSON.parse(line));}catch{}}}catch(e){if(e.code!=='ENOENT')throw e;}}
 async function recall(mode,query='',limit=8,{excludeSession=''}={}){await queue;const terms=[...new Set(String(query).toLowerCase().match(/[a-z]{4,}/g)||[])].filter(w=>!['that','this','with','have','were','what','your','from','about','remember','session','previous','earlier','before','again','happened','feeling','felt','during','could','would','being','there','last','past'].includes(w)).slice(0,24),best=[];
  await records(mode,r=>{if(excludeSession&&r.session===excludeSession)return;const text=(String(r.text||'')+' '+(r.feeling?.body?.summary||'')+' '+(r.feeling?.mental?.summary||'')).toLowerCase(),matches=terms.reduce((n,t)=>n+(text.includes(t)?1:0),0);if(terms.length&&!matches)return;const score=matches+(r.kind==='heartbeat'?0:2);const row={...r,score};best.push(row);best.sort((a,b)=>b.score-a.score||(b.at||0)-(a.at||0));if(best.length>limit)best.pop();});return best;
 }
 async function read(mode){await queue;try{return JSON.parse(await readFile(join(directory,mode+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 function save(mode,data,expectedRevision){
  const job=queue.then(async()=>{
   await mkdir(directory,{recursive:true});const path=join(directory,mode+'.json');let old=null;
   try{old=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(expectedRevision!==undefined&&expectedRevision!==(old?.revision||0)){const error=Error('Another window already saved this room.');error.status=409;throw error;}
   const now=Date.now(),snapshot={version:1,revision:(old?.revision||0)+1,startedAt:old?.startedAt||now,savedAt:now,data:structuredClone(data)};
   // Session time can advance but ordinary saving cannot rewind it.
   if(old&&Number.isFinite(data.simMin))snapshot.data.simMin=Math.max(old.data.simMin||0,data.simMin);
   if(!known.has(mode)){const ids=new Set();await records(mode,r=>ids.add(r.id||JSON.stringify(r)));known.set(mode,ids);}
   const previous=known.get(mode),batch=[...(data.archive||[]),...(data.journal||[])],fresh=[];
   for(const j of batch){const key=j.id||JSON.stringify(j);if(!previous.has(key)&&!fresh.some(x=>(x.id||JSON.stringify(x))===key))fresh.push(j);}
   if(fresh.length)await appendFile(join(directory,mode+'-memory.jsonl'),fresh.map(j=>JSON.stringify({...j,archivedAt:now})).join('\n')+'\n');
   for(const j of fresh)previous.add(j.id||JSON.stringify(j));delete snapshot.data.archive;
   await writeFile(path+'.next',JSON.stringify(snapshot,null,2)+'\n');
   if(old)await copyFile(path,path+'.previous');await rename(path+'.next',path);return data.archive?{...snapshot,acknowledged:data.archive.map(j=>j.id).filter(Boolean)}:snapshot;
  });queue=job.catch(()=>{});return job;
 }
 return{read,save,recall};
}
