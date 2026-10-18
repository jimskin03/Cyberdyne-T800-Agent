export function describeMemory(record){
 const at=record.at?new Date(record.at).toISOString():'date unknown',body=record.feeling?.body,mental=record.feeling?.mental;
 return `[${at}; session ${record.session||'legacy/unknown'}; ${record.kind}] ${record.text}\nFelt then: ${body?.summary||'Historical body sensations were not recorded; do not infer them from today.'}${mental?'\nMental state then: '+mental.summary:''}${record.feeling?.fear>=60?'\nFear then: intense, frightening.':record.feeling?'\nFear then: '+(record.feeling.fear>=30?'uneasy':'low')+'.':''}`;
}
export async function recallSensoryMemory(query,{signal,session='',fetcher}={}){
 // The standalone package has no disk memory service. Search only recorded local events.
 if(!fetcher){
  if(signal?.aborted)return '';
  const records=typeof window==='undefined'?[]:window.__CELL?.state?.journal||[];
  const terms=String(query).toLowerCase().match(/[a-z]{4,}/g)||[];
  const previous=/(?:previous|last|earlier|past) session/i.test(query);
  return records.filter(r=>r.kind!=='heartbeat'&&(!previous||r.session!==session)).map(r=>({record:r,score:terms.reduce((n,t)=>n+Number(String(r.text||'').toLowerCase().includes(t)),0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||(b.record.at||0)-(a.record.at||0)).slice(0,8).map(r=>describeMemory(r.record)).join('\n\n');
 }
 try{const r=await fetcher('/tts/memory/cell?q='+encodeURIComponent(query.slice(0,800))+(/(?:previous|last|earlier|past) session/i.test(query)?'&excludeSession='+encodeURIComponent(session):''),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(3000)]):AbortSignal.timeout(3000)});if(!r.ok)return '';const data=await r.json();return (data.records||[]).map(describeMemory).join('\n\n');}catch{return '';}
}
