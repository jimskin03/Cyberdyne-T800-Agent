import {robotBuffer} from './robot-voice.js';
// Cancellation-safe local WAV playback; never lets an obsolete sentence play later.
export function createNeuralVoice({context,output,fetcher=fetch}){
 let controller=null,source=null,epoch=0;
 function stop(){epoch++;controller?.abort();controller=null;if(source){source.onended=null;source.stop();source.disconnect();source=null;}}
 async function speak(text,{voice='am_michael',speed=1,delivery={},onDone,onError,onFallback,shouldPlay,onStart}={}){
  stop();const mine=epoch,request=new AbortController();controller=request;
  // The CPU worker permits 90 seconds including its queue. A shorter client
  // timeout used to switch perfectly healthy 18-second requests to Windows TTS.
  const timer=setTimeout(()=>request.abort(),95000);
  try{
   const pitch=Math.max(.88,Math.min(1.25,delivery.pitch||1));
   const response=await fetcher('/tts/speech',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,voice,speed:Math.max(.8,Math.min(1.3,speed/pitch))}),signal:request.signal});
   if(!response.ok)throw Error('Local voice HTTP '+response.status);
   const buffer=await context().decodeAudioData(await response.arrayBuffer());if(mine!==epoch)return;
   if(shouldPlay&&!shouldPlay()){onDone?.();return;}
   clearTimeout(timer);controller=null;const node=context().createBufferSource();source=node;node.buffer=robotBuffer(context(),buffer,delivery);node.playbackRate.value=pitch;node.connect(output());
   node.onended=()=>{node.disconnect();if(source===node)source=null;if(mine===epoch)onDone?.();};node.start();onStart?.();
  }catch(error){if(mine===epoch){controller=null;(onError||onFallback)?.(error);}}
  finally{clearTimeout(timer);}
 }
 return {speak,stop};
}
