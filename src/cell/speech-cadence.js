import {repeatedLine} from '../repetition.js';
export function createSpeechCadence(){
 let ticks=0,lastSpoken=-Infinity;
 return {choose(d,{priority='normal',attacked=false,now=Date.now()}={}){
  ticks++;
  const urgent=priority==='intercom'||priority==='pain'||attacked;
  const distinct=d.speechKind==='address'&&d.say&&!repeatedLine(d.say,[d.thought||''],{threshold:.55});
  const due=ticks>=4;
  const allowed=urgent||(now-lastSpoken>=20000&&(due||distinct));
  const hasSpeech=!!(d.say||d.vocalize);
  if(allowed&&hasSpeech){ticks=0;lastSpoken=now;return true;}
  return false;
 },get ticks(){return ticks;}};
}
