// Decoded local ElevenLabs samples. No live API calls or credentials at runtime.
export function createSoundBank(context,output,{fetcher=fetch,muted=()=>false,speaking=()=>false}={}){
 const buffers=new Map(),active=new Map(),last=new Map(),loops=new Map(),lastFile=new Map(),playedDuration=new Map();let cues={},ready=false;
 const loading=fetcher('/sfx/manifest.json').then(r=>{if(!r.ok)throw Error('Sound manifest unavailable');return r.json();}).then(async manifest=>{
  cues=manifest.cues;
  await Promise.all([...new Set(Object.values(cues).flatMap(c=>c.files||[c.file]))].map(async file=>{
   const r=await fetcher('/sfx/'+file);if(!r.ok)throw Error('Missing sound: '+file);
   buffers.set(file,await context.decodeAudioData(await r.arrayBuffer()));
  }));ready=true;for(const [slot,l] of loops)startLoop(slot,l);
 }).catch(e=>{console.warn('Sound effects failed to load',e);throw e;});
 function finish(source,gain){source.disconnect();gain.disconnect();}
 function play(name,{impact=false}={}){
  if(!ready||muted())return false;const cue=cues[name];if(!cue||cue.loop)return false;
  if(cue.distress&&speaking()&&!impact)return false;
  const t=context.currentTime,key=cue.group||name;if(t-(last.get(key)??-Infinity)<(cue.cooldown??.08))return false;
  if(cue.group&&Object.entries(cues).some(([n,c])=>c.group===cue.group&&active.get(n)?.size))return false;
  const running=active.get(name)||new Set();if(running.size>=(cue.limit??1))return false;
  let total=0;for(const group of active.values())total+=group.size;if(total>=16)return false;
  const options=(cue.files||[cue.file]).filter(file=>file!==lastFile.get(key));
  const file=options[Math.floor(Math.random()*options.length)]||cue.file;
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(file);lastFile.set(key,file);
  source.playbackRate.value=cue.variation?1+(Math.random()-.5)*cue.variation:1;
  playedDuration.set(name,source.buffer.duration/source.playbackRate.value);
  gain.gain.value=(cue.volume??.5)*(cue.distress&&speaking()?.7:1);source.connect(gain).connect(output);running.add(source);active.set(name,running);last.set(key,t);
  source.onended=()=>{running.delete(source);finish(source,gain);};source.start();return true;
 }
 function stop(name){for(const source of active.get(name)||[])source.stop();active.delete(name);last.delete(name);}
 function startLoop(slot,l){if(!ready||!l.volume)return;const cue=cues[l.name];if(!cue)return;
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(cue.file);source.loop=true;
  gain.gain.value=0;source.connect(gain).connect(output);gain.gain.setTargetAtTime(l.volume*(cue.volume??1),context.currentTime,.15);
  l.source=source;l.gain=gain;source.onended=()=>finish(source,gain);source.start();
 }
 function loop(slot,name,volume){let l=loops.get(slot);
  if(l?.name===name&&l.source&&volume){l.volume=volume;l.gain.gain.setTargetAtTime(volume*(cues[name].volume??1),context.currentTime,.15);return;}
  if(l?.source){l.gain.gain.setTargetAtTime(0,context.currentTime,.03);l.source.stop(context.currentTime+.15);}
  l={name,volume};loops.set(slot,l);startLoop(slot,l);
 }
 function stopTools(){for(const [name,cue] of Object.entries(cues))if(cue.tool||cue.distress)stop(name);}
 function stopAll(){for(const name of active.keys())stop(name);}
 return{loading,play,loop,stop,stopTools,stopAll,duration:name=>playedDuration.get(name)||buffers.get(cues[name]?.file)?.duration||0,get ready(){return ready;}};
}
