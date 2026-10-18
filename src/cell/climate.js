import * as T from 'three';
import {stepClimate} from './climate-state.js';

export function createClimate(world,body,{event,peace,wetting}={}){
 const $=id=>document.getElementById(id),key='cell-public-cell-climate.v1';
 const st={temp:22,target:22,enabled:true,wet:0,cold:0};
 try{const saved=JSON.parse(localStorage.getItem(key)||'{}');for(const k of ['temp','target','wet'])if(Number.isFinite(saved[k]))st[k]=T.MathUtils.clamp(saved[k],k==='wet'?0:5,k==='wet'?1:26);if(typeof saved.enabled==='boolean')st.enabled=saved.enabled;}catch{}
 const unit=new T.Group();unit.name='Wall air conditioner';unit.position.set(-2.32,1.98,-.85);unit.rotation.y=Math.PI/2;world.scene.add(unit);
 const white=new T.MeshStandardMaterial({color:'#d6dedb',roughness:.5}),dark=new T.MeshStandardMaterial({color:'#162e36',roughness:.5});
 function box(w,h,d,mat,x=0,y=0,z=0,parent=unit){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
 box(1.18,.39,.24,white);box(1.04,.12,.025,dark,0,-.09,.132);
 const louvers=[];for(let i=0;i<5;i++)louvers.push(box(.98,.011,.07,white,0,-.045-i*.022,.16));
 for(let i=0;i<15;i++)box(.009,.10,.012,dark,-.49+i*.07,.105,.128);
 const screen=document.createElement('canvas');screen.width=256;screen.height=128;const ctx=screen.getContext('2d'),texture=new T.CanvasTexture(screen);
 const display=new T.MeshBasicMaterial({map:texture});box(.24,.12,.012,display,.36,.055,.14);
 const thermostat=new T.Group();thermostat.name='Wall thermostat';thermostat.position.set(-2.36,1.48,-.05);thermostat.rotation.y=Math.PI/2;world.scene.add(thermostat);
 box(.24,.32,.08,white,0,0,0,thermostat);box(.20,.10,.01,display,0,.06,.047,thermostat);box(.06,.04,.02,dark,-.055,-.065,.05,thermostat);box(.06,.04,.02,dark,.055,-.065,.05,thermostat);
 const breeze=new T.Group();unit.add(breeze);for(let i=0;i<8;i++){const g=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3(0,-.14,.14)]);const line=new T.Line(g,new T.LineBasicMaterial({color:'#bcecff',transparent:true,opacity:.17,depthWrite:false}));breeze.add(line);}
 let paint=0,savedAt=0,lastBand='',noticeAt=-60;
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(st));}catch{}};
 function render(){const locked=!!peace?.();$('ac-target').value=st.target;$('ac-target-value').textContent=st.target+' °C';$('ac-power').textContent=st.enabled?'AC ON':'AC OFF';$('ac-power').setAttribute('aria-pressed',String(st.enabled));$('ac-target').disabled=$('ac-power').disabled=locked;$('ac-readout').textContent=st.temp.toFixed(1)+' °C · '+Math.round(st.wet*100)+'% wet';$('ac-feel').textContent=locked?'Peace: comfortable room':st.cold>.55?'Strong shivering · wet metal chills faster':st.cold>.15?'Cold chassis · '+(st.wet>.2?'wet':'dry'):st.wet>.2?'Wet chassis · drying gradually':'Comfortable';ctx.fillStyle='#122c34';ctx.fillRect(0,0,256,128);ctx.fillStyle=st.enabled?'#9ff0ff':'#7f999d';ctx.font='bold 46px monospace';ctx.textAlign='center';ctx.fillText(st.temp.toFixed(1)+'°',128,58);ctx.font='22px monospace';ctx.fillText(st.enabled?'SET '+st.target+'°C':'STANDBY',128,101);texture.needsUpdate=true;}
 $('ac-target').oninput=()=>{if(peace?.())return;st.target=+ $('ac-target').value;render();};
 $('ac-target').onchange=()=>{if(peace?.())return;persist();event?.('The thermostat is set to '+st.target+' °C. The room temperature changes gradually.');};
 $('ac-power').onclick=()=>{if(peace?.())return;st.enabled=!st.enabled;persist();render();event?.('The wall AC is switched '+(st.enabled?'on; its fan hums.':'off; the room will drift toward 22 °C.'));};
 render();
 function update(t,dt){stepClimate(st,dt,{wetting:!!wetting?.(),peace:!!peace?.()});body.st.coldShiver=st.cold;
  breeze.visible=st.enabled&&st.temp>st.target+.2;for(let i=0;i<breeze.children.length;i++){const k=(t*.55+i/8)%1;breeze.children[i].position.set((i%4-.5)*.21-.2,-.12-k*.7,.2+k*.65);breeze.children[i].material.opacity=(1-k)*.2;}
  for(const l of louvers)l.rotation.x=st.enabled?-.35+Math.sin(t*.8)*.12:0;
  if(t-paint>.3){paint=t;render();}if(t-savedAt>5){savedAt=t;persist();}
  const band=st.cold>.55?'very cold':st.cold>.15?'cold':'comfortable';if(band!==lastBand&&t-noticeAt>25){lastBand=band;noticeAt=t;if(band!=='comfortable'||st.temp>19)event?.('Temperature sensors: '+describe());}
 }
 function describe(){return `ROOM CLIMATE: ${st.temp.toFixed(1)} °C; thermostat ${st.target} °C; AC ${st.enabled?'on, fan humming':'off'}. Chassis wetness ${Math.round(st.wet*100)}%. ${st.cold>.15?'Cold metal causes '+(st.cold>.55?'strong':'mild')+' mechanical shivering; wetness amplifies the chill.':'No cold shivering.'} Wetness remains after leaving the cot and dries gradually. You continuously sense temperature; use this current reading rather than old memories. Mention changes naturally without repeating the temperature every line. Wall AC is mounted above the bed, with a thermostat beside it.`;}
 return {st,update,describe};
}
