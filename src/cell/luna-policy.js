export const LUNA_ACTIONS=['wait','water','lift_towel','release','cool','warm','tool','noise'];
export function parseLunaPlan(raw){
 const text=String(raw),a=text.indexOf('{'),b=text.lastIndexOf('}');
 const p=JSON.parse(text.slice(a,b+1));if(!LUNA_ACTIONS.includes(p.action))throw Error('Unknown Luna action');
 const number=(v,d,min,max)=>Number.isFinite(+v)?Math.max(min,Math.min(max,+v)):d;
 const tool=['prod','mallet','torch','drill','feather','squirt','chicken','magnet'].includes(p.tool)?p.tool:'feather';
 return {action:p.action,tool,seconds:number(p.seconds,2,1,4),temperature:Math.round(number(p.temperature,16,5,26)),wait:number(p.wait,28,18,65),say:typeof p.say==='string'?p.say.trim().slice(0,240):'',reason:typeof p.reason==='string'?p.reason.slice(0,160):''};
}
export function lunaAllowed({enabled,started,peace,busy,hidden,manualUntil=0},now=Date.now()){
 return enabled&&started&&!peace&&!busy&&!hidden&&now>=manualUntil;
}
