// A dry path preserves consonants; ring modulation and a short resonator provide
// the deliberately cheap android vocal box without adding an audible echo tail.
export function robotDelivery(tag=''){
 const text=String(tag).toLowerCase();
 if(/scream|shout|panic|alarm|yell/.test(text))return {pitch:1.2,gain:1.65,strain:1.1,flutter:.18,carrier:91};
 if(/strain|hurt|pain|breathless|pant|gasp/.test(text))return {pitch:1.12,gain:1.4,strain:.75,flutter:.12,carrier:83};
 if(/whisper|quiet|soft|tender/.test(text))return {pitch:.97,gain:.5,strain:0,flutter:0,carrier:67};
 if(/sob|whimper|cry|trembl|dread/.test(text))return {pitch:1.04,gain:.9,strain:.35,flutter:.16,carrier:71};
 if(/groan|sigh|tired|yawn/.test(text))return {pitch:.94,gain:.85,strain:.2,flutter:.05,carrier:61};
 if(/giggl|laugh|snort|wheez/.test(text))return {pitch:1.08,gain:1.05,strain:.25,flutter:.08,carrier:73};
 return {pitch:1,gain:1,strain:0,flutter:0,carrier:67};
}
export function robotSamples(input,sampleRate,{gain=1,strain=0,flutter=0,carrier=67}={}){
 const out=new Float32Array(input.length),delay=Math.round(sampleRate*.014);
 for(let i=0;i<input.length;i++){
  const dry=input[i],ring=dry*(.35+.65*Math.sin(2*Math.PI*carrier*i/sampleRate));
  const resonant=i>=delay?input[i-delay]*.18:0;
  const crushed=Math.round((ring+resonant)*256)/256;
  const voiced=dry*.42+crushed*.66;
  const rough=strain?Math.tanh(voiced*(1+strain))*.95:voiced;
  const shaking=1-flutter+flutter*Math.sin(2*Math.PI*7.3*i/sampleRate);
  out[i]=Math.max(-.95,Math.min(.95,rough*gain*shaking));
 }
 return out;
}
export function robotBuffer(context,buffer,delivery){
 const result=context.createBuffer(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
 for(let channel=0;channel<buffer.numberOfChannels;channel++)result.getChannelData(channel).set(robotSamples(buffer.getChannelData(channel),buffer.sampleRate,delivery));
 return result;
}
