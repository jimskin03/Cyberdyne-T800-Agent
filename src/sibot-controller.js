export function createSiBotController({mode,scene,snapshot,onDecision=()=>{},onStatus=()=>{},fetchImpl=(...a)=>fetch(...a)}={}){
 let enabled=false,busy=false,epoch=0,next=0,ac=null,recent=[],turn=0;
 function cancel(){epoch++;ac?.abort();ac=null;busy=false;}
 async function ask(message=''){
  if(!enabled||busy)return;const token=++epoch;busy=true;ac=new AbortController();const timer=setTimeout(()=>ac.abort(),65000);onStatus('Si BoT · Agent thinking');
  try{const r=await fetchImpl('/sibot/decide',{method:'POST',headers:{'content-type':'application/json'},signal:ac.signal,body:JSON.stringify({mode,scene,snapshot:snapshot(),recent,turn:turn+1,message:String(message).slice(0,1000)})});const d=await r.json();if(!r.ok)throw Error(d.error||'HTTP '+r.status);if(token!==epoch||!enabled)return;if(typeof d.speech!=='string'||!['approach','bat','kick','wait','leave'].includes(d.action))throw Error('Invalid Si BoT reply');if(d.speech)recent.push(d.speech);recent=recent.slice(-8);turn++;onDecision(d);onStatus('Si BoT · Agent connected');next=performance.now()+Math.max(4000,(d.duration||3)*1000);}
  catch(e){if(token===epoch){onStatus('Si BoT · '+(e.name==='AbortError'?'request timed out':e.message));next=performance.now()+15000;}}
  finally{clearTimeout(timer);if(token===epoch){busy=false;ac=null;}}
 }
 return {ask,update(){if(enabled&&!busy&&!document.hidden&&performance.now()>=next)ask();},setEnabled(v){cancel();enabled=!!v;next=0;onStatus(v?'Si BoT · Agent ready':'Si BoT paused');},get busy(){return busy;},get enabled(){return enabled;}};
}
