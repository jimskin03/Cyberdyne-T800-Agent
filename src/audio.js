import {LINES,strip} from './lines.js';
import {createSoundBank} from './sound-bank.js';
import {reactionCue,vocalCue,vocalTag} from './reactions.js';
import {createNeuralVoice} from './neural-voice.js';
import {robotDelivery} from './robot-voice.js';

// Local ElevenLabs Foley and American Kokoro robot speech shared by both modes.
export function createAudio({windowsVoice=false}={}){
 let ctx=null,master=null,muted=true,bank=null,humVolume=.05,radioStation=0;
 const desired=new Map();
 function setLoop(slot,name,volume){desired.set(slot,{name,volume});bank?.loop(slot,name,volume);}
 function init(){if(ctx)return;ctx=new AudioContext();master=ctx.createGain();master.gain.value=0;
  const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.15;
  master.connect(limiter).connect(ctx.destination);
  bank=createSoundBank(ctx,master,{muted:()=>muted,speaking:()=>voice.speaking});
  // Handle the loading failure once; silence is preferable to arcade oscillator fallbacks.
  bank.loading.catch(()=>{});setLoop('room','room',humVolume*2);
  for(const [slot,l] of desired)bank.loop(slot,l.name,l.volume);
 }
 async function enable(){init();muted=false;await ctx.resume();master.gain.setTargetAtTime(.7,ctx.currentTime,.1);await bank.loading;return true;}
 function sfx(name){return bank?.play(name)||false;}
 function radio(on,station=radioStation){radioStation=station;setLoop('radio',station===3?'radio-static':'radio',on?.2:0);}
 function rain(level){setLoop('rain','rain',Math.max(0,level)*.1);}
 function punk(on,vol=.8){setLoop('punk','punk',on?vol*.5:0);}
 function baby(on,vol=.8){setLoop('baby','baby',on?vol*.4:0);}
 // Delivery tags change expression while the speaker remains the same android.
 const PROSODY=[ // [regex on the tag, pitch, rate, volume]
  [/scream|shout|panic|excit|strain|alarm/,.95,1.22,1],[/whisper|quiet|soft|tender/,.35,.78,.5],[/sob|whimper|cry|trembl|dread/,.7,.8,.85],
  [/wail|dramatic|stun/,.8,.92,1],[/groan|sigh|tired|yawn|relax|dream|reluctant/,.3,.7,.8],[/glitch|robot|monoton/,.2,.9,.9],
  [/giggl|laugh|snort|wheez/,1.1,1.2,.95],[/pant|gasp/,.65,1.15,.95],[/deadpan|dry|sarcas|flat/,.3,.88,.9],
 ];
 const BASE={pitch:.5,rate:.95,volume:.95};
 function segments(text){const out=[];let tag='';const re=/\[([^\]]*)\]|([^\[]+)/g;let m;while((m=re.exec(text))){if(m[1]!==undefined){tag=m[1].toLowerCase();if(/^pause|beat$/.test(tag))out.push({pause:true});}else{const t=m[2].trim();if(t)out.push({tag,text:t});}}return out;}
 function prosody(tag){for(const[re,p,r,v]of PROSODY)if(re.test(tag))return{pitch:p,rate:r,volume:v};return BASE;}
 const voiceName='neural:am_michael';
 const neural=createNeuralVoice({context:()=>ctx,output:()=>master});
 let selectedWindows='';
 const systemVoices=()=>windowsVoice&&'speechSynthesis' in window?speechSynthesis.getVoices().filter(v=>v.localService&&/^en/i.test(v.lang)).sort((a,b)=>(/Microsoft David/i.test(b.name)?2:/Microsoft/i.test(b.name)?1:0)-(/Microsoft David/i.test(a.name)?2:/Microsoft/i.test(a.name)?1:0)):[];
 const voicesList=()=>windowsVoice?[{name:'windows:default',label:'Windows · instant (default)',lang:'en-US'},...systemVoices().map(v=>({name:'windows:'+v.name,label:v.name+' · instant',lang:v.lang}))]:[{name:voiceName,label:'Kokoro · American robot',lang:'en-US'}];
 let runId=0;
 function speak(text,done){
  const my=++runId;voice.lastError=null;
  const parts=segments(text).flatMap(s=>s.pause?[s]:s.text.match(/.{1,380}(?:\s|$)|.{1,380}/g).map(t=>({...s,text:t.trim()})));let i=0;
  const next=()=>{if(my!==runId)return;if(i>=parts.length){done();return;}const part=parts[i++];if(part.pause){setTimeout(next,260);return;}
   if(windowsVoice){
    if(!('speechSynthesis' in window)){voice.lastError='Windows speech is unavailable in this browser.';done();return;}
    const utterance=new SpeechSynthesisUtterance(part.text),list=systemVoices(),chosen=list.find(v=>v.name===selectedWindows)||list[0];
    if(chosen)utterance.voice=chosen;utterance.lang=chosen?.lang||'en-US';const p=prosody(part.tag);utterance.rate=Math.max(.85,Math.min(1.25,p.rate));utterance.pitch=.85;utterance.volume=p.volume;
    utterance.onend=next;utterance.onerror=e=>{if(my!==runId)return;voice.lastError=e.error;done();};speechSynthesis.speak(utterance);
   }else neural.speak(part.text,{voice:voiceName.slice(7),speed:Math.max(.8,Math.min(1.3,prosody(part.tag).rate)),delivery:robotDelivery(part.tag),onDone:next,onError:error=>{if(my!==runId)return;voice.lastError=String(error?.message||error);console.warn('American robot voice unavailable:',voice.lastError);done();}});
  };next();
 }
 const voice={
  speaking:false,lastError:null,
  say(id,onDone,textOverride,{model=false,vocalize=''}={}){
   const text=textOverride||LINES[id]?.text||'';const cue=model?vocalCue(vocalize||vocalTag(text)):null;if(!text&&!cue)return 0;stop();
   const lead=cue&&bank?.play(cue)?bank.duration(cue):0;
   const my=runId;
   if(muted){voice.speaking=true;const ms=Math.min(9000,1800+strip(text).length*62);setTimeout(()=>{if(my!==runId)return;voice.speaking=false;onDone&&onDone();},ms);return 0;}
   voice.speaking=true;const begin=()=>{if(my!==runId)return;speak(text,()=>{voice.speaking=false;onDone&&onDone();});};
   if(lead)setTimeout(begin,lead*1000);else begin();return lead;
  },
  has:()=>false,duration:()=>null,
  get voices(){return voicesList();},
  setVoice(name){if(windowsVoice){selectedWindows=String(name||'').replace(/^windows:/,'');return name;}return voiceName;},
  get mp3Count(){return 0;},
 };
 function stop(){runId++;neural.stop();if('speechSynthesis' in window)speechSynthesis.cancel();voice.speaking=false;}
 return {enable,sfx,voice,stopVoice:stop,radio,rain,punk,baby,
  reaction(pain,despair){const cue=reactionCue(pain,despair);return cue? bank?.play(cue,{impact:true})||false:false;},
  stopTools(){bank?.stopTools();},
  async toggle(){if(muted)return enable();muted=true;stop();bank?.stopAll();if(ctx)master.gain.setTargetAtTime(0,ctx.currentTime,.05);return false;},
  get enabled(){return!muted;},get state(){return ctx?.state||'not-started';},
  humLevel(v){humVolume=v;setLoop('room','room',v*2);}};
}
