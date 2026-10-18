import {isCharacterOutput} from '../../session.js';
import {vocalCue} from '../../reactions.js';

export function parseDecision(raw){
 if(!raw)return null;let s=String(raw).replace(/<think>[\s\S]*?<\/think>/g,'').replace(/```(?:json)?/g,'');
 const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;
 let j;try{j=JSON.parse(s.slice(a,b+1));}catch{try{j=JSON.parse(s.slice(a,b+1).replace(/,\s*([}\]])/g,'$1'));}catch{return null;}}
 if((j.say&&!isCharacterOutput(j.say))||(j.thought&&!isCharacterOutput(j.thought)))return null;
 const acts=(Array.isArray(j.actions)?j.actions:j.action?[j.action]:[]).filter(x=>x&&typeof x==='object').slice(0,5);
 const str=x=>typeof x==='string'?x.trim():'';
 return {speechKind:j.speechKind==='address'?'address':'reflection',thought:str(j.thought).slice(0,400),say:str(j.say).replace(/\*[^*]*\*/g,'').slice(0,900),vocalize:vocalCue(j.vocalize)?str(j.vocalize).toLowerCase():'',actions:acts,remember:str(j.remember).slice(0,200)};
}

export function parseArt(raw){if(!raw)return null;const s=String(raw).replace(/```(?:json)?/g,'');const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;
 let j;try{j=JSON.parse(s.slice(a,b+1));}catch{try{j=JSON.parse(s.slice(a,b+1).replace(/,\s*([}\]])/g,'$1'));}catch{return null;}}
 const strokes=(Array.isArray(j.strokes)?j.strokes:[]).filter(Array.isArray).map(st=>st.filter(p=>Array.isArray(p)&&p.length>=2&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]])).filter(st=>st.length);
 return strokes.length?{title:String(j.title||'').slice(0,100),strokes}:null;}

export function parseCode(raw){if(!raw)return null;const t=String(raw);
 const title=(t.match(/TITLE:\s*(.+)/)||[])[1],summary=(t.match(/SUMMARY:\s*(.+)/)||[])[1];
 let html=(t.match(/```html\s*([\s\S]*?)```/)||[])[1];if(!html){const a=t.search(/<!doctype html|<html/i),b=t.lastIndexOf('</html>');if(a>=0)html=t.slice(a,b>a?b+7:undefined);}
 if(!html||html.length<80)return null;return {title:(title||'').trim().slice(0,40),summary:(summary||'').trim().slice(0,400),html:html.trim()};}

export function parseCreation(raw){try{const text=String(raw).replace(/```(?:json)?/g,'');const j=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));if(typeof j.code!=='string'||!j.code.trim()||j.code.length>35000)return null;return {name:String(j.name||'').slice(0,80),description:String(j.description||'').slice(0,500),code:j.code};}catch{return null;}}
