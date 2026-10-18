import * as T from 'three';

// Every tool is built with its business end at the local origin, pointing +Z, handle trailing back along -Z.
// tick(k,time,ctx) animates the tool; k runs 0..1 over one use (approach <.25, work .25-.8, retreat >.8).
export const TOOLS=[
 {id:'prod',name:'Stun prod',key:'1',pay:12,fx:'zap',hit:1.3,pref:['chest','core','elbowL','elbowR','handL','handR','kneeL','kneeR']},
 {id:'mallet',name:'Mallet',key:'2',pay:8,fx:'clang',hit:1.6,pref:['head','chest','kneeL','kneeR','footL','footR','elbowL','elbowR']},
 {id:'torch',name:'Blowtorch',key:'3',pay:15,fx:'flame',hit:.8,pref:['chest','footL','footR','kneeL','kneeR','handL','handR']},
 {id:'drill',name:'Power drill',key:'4',pay:20,fx:'drill',hit:1,pref:['head','chest','jaw','elbowL','elbowR','kneeL','kneeR']},
 {id:'feather',name:'Feather',key:'5',pay:5,fx:'tickle',hit:1,pref:['footL','footR','kneeL','kneeR','chest','jaw','handL','handR']},
 {id:'squirt',name:'Squirt bottle',key:'6',pay:10,fx:'squirt',hit:.7,pref:['head','chest','jaw','handL','handR','core']},
 {id:'chicken',name:'Rubber chicken',key:'7',pay:6,fx:'squeak',hit:1.2,pref:['head','chest','jaw','kneeL','kneeR','elbowL','elbowR']},
 {id:'magnet',name:'Magnet',key:'8',pay:9,fx:'magnet',hit:1,pref:['chest','core','head','handL','handR','footL','footR']},
];

export function buildTool(id,toon){
 const g=new T.Group(),inner=new T.Group();g.add(inner);
 const sph=new T.SphereGeometry(1,16,12),cyl=new T.CylinderGeometry(1,1,1,12),box=new T.BoxGeometry(1,1,1),cone=new T.ConeGeometry(1,1,12);
 // horizontal cylinder along Z from z=a to z=b
 function rod(parent,mat,r,a,b,x=0,y=0){const m=new T.Mesh(cyl,mat);m.scale.set(r,Math.abs(b-a),r);m.rotation.x=Math.PI/2;m.position.set(x,y,(a+b)/2);m.castShadow=true;parent.add(m);return m;}
 function blob(parent,mat,pos,scale,geo=sph){const m=new T.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;parent.add(m);return m;}
 let tick=()=>{};
 const basic=c=>new T.MeshBasicMaterial({color:c});
 if(id==='prod'){
  rod(inner,toon('#262b30'),.07,-1.4,-.35);rod(inner,toon('#e8c53a'),.08,-.8,-.55);
  blob(inner,toon('#e8c53a'),[0,0,-.35],[.13,.13,.13]);
  rod(inner,toon('#a0a8ae'),.025,-.35,.2,.09);rod(inner,toon('#a0a8ae'),.025,-.35,.2,-.09);
  const glow=basic('#bff0ff');blob(inner,glow,[.09,0,.2],[.04,.04,.04]);blob(inner,glow,[-.09,0,.2],[.04,.04,.04]);
  tick=(k,time,c)=>{if(k>.25&&k<.8){c.bolt(c.local(inner,.09,0,.2),c.local(inner,-.09,0,.2),true,.07);c.bolt2(c.tip,c.target,true);if(Math.random()<.9)c.emit(c.tip,[ (Math.random()-.5)*5,(Math.random()-.2)*5,(Math.random()-.5)*5],'#9fe3ff',.35,1);c.light('#8fd8ff',9);}else{c.bolt(null,null,false);c.bolt2(null,null,false);}};
 }
 if(id==='mallet'){
  const wood=toon('#c4883f'),iron=toon('#a9b4bc');
  const pivot=new T.Group();pivot.position.set(0,0,-.2);inner.add(pivot);
  rod(pivot,wood,.06,-1.1,.3);blob(pivot,iron,[0,0,.35],[.3,.28,.5],box);blob(pivot,toon('#9aa4ab'),[0,0,.35],[.34,.07,.52],box);
  g.userData.hold=true;
  tick=(k,time,c)=>{ // wind up back, whack, recoil
   const w=k<.25?-1.35*(k/.25):k<.33?-1.35+(k-.25)/.08*1.35:k<.6?.2*Math.exp(-(k-.33)*10)*Math.sin((k-.33)*40):0;
   pivot.rotation.x=w*(k>.8?(1-(k-.8)/.2):1);
   if(k>=.3&&!c.fired.impact){c.fired.impact=true;c.burst(c.tip,18,'#ffd88a',6,.5);c.ring(c.tip,'#fff1c4');}
  };
 }
 if(id==='torch'){
  const steel=toon('#9aa3aa'),red=toon('#c0392b');
  blob(inner,red,[0,-.3,-.7],[.18,.4,.3],box);rod(inner,toon('#222'),.07,-1.2,-.4);rod(inner,steel,.1,-.6,-.2);rod(inner,steel,.04,-.2,.15);
  const fl=new T.Mesh(cone,basic('#ff8a1d'));fl.rotation.x=Math.PI/2;fl.position.z=.45;fl.scale.set(.1,.6,.1);inner.add(fl);
  const fl2=new T.Mesh(cone,basic('#fff3a0'));fl2.rotation.x=Math.PI/2;fl2.position.z=.3;fl2.scale.set(.05,.35,.05);inner.add(fl2);
  fl.visible=fl2.visible=false;
  tick=(k,time,c)=>{const on=k>.22&&k<.82;fl.visible=fl2.visible=on;if(on){const f=1+Math.sin(time*60)*.2+Math.random()*.2;fl.scale.set(.1*f,.55*f,.1*f);fl2.scale.set(.05*f,.32*f,.05*f);c.emit(c.tip,[(Math.random()-.5)*1.5,Math.random()*2.4+.8,(Math.random()-.5)*1.5],Math.random()<.5?'#ff8a1d':'#ffd25a',.5,1.4);if(Math.random()<.5)c.emit(c.tip,[(Math.random()-.5)*1,Math.random()*1.5+1,(Math.random()-.5)*1],'#6a625c',1,1.6);c.light('#ff9a3a',9);}};
 }
 if(id==='drill'){
  const body=toon('#e3a21a'),blk=toon('#2d3238');
  blob(inner,body,[0,0,-.55],[.2,.26,.7],box);blob(inner,blk,[0,-.35,-.7],[.14,.4,.16],box);rod(inner,toon('#8e969c'),.07,-.2,.1);
  const bit=new T.Mesh(cone,toon('#cfd6db'));bit.rotation.x=Math.PI/2;bit.scale.set(.06,.4,.06);bit.position.z=.28;inner.add(bit);
  const stripe=new T.Mesh(new T.BoxGeometry(.012,.012,.38),basic('#3b4148'));stripe.position.set(.03,0,.28);bit.add(stripe);
  const spin=new T.Group();inner.add(spin);spin.position.z=.28;spin.add(bit);bit.position.z=0;
  tick=(k,time,c)=>{const on=k>.22&&k<.82;spin.rotation.z+=on?.9:0;inner.position.x=on?Math.sin(time*80)*.012:0;inner.position.y=on?Math.cos(time*70)*.012:0;if(on){c.emit(c.tip,[(Math.random()-.5)*5,(Math.random()-.2)*5,(Math.random()-.5)*5],Math.random()<.5?'#ffd25a':'#ffffff',.4,1);c.light('#ffd58a',4);}};
 }
 if(id==='feather'){
  const q=toon('#e8e1c9'),f=toon('#ff7bb0');
  rod(inner,q,.02,-1.2,.2);
  for(let i=0;i<9;i++){const z=.2-i*.075,w=.3*Math.sin((i+1)/10*Math.PI)+.06;blob(inner,i%2?f:toon('#ff9cc4'),[0,0,z],[w,.025,.1],sph);}
  tick=(k,time,c)=>{inner.rotation.z=(k>.25&&k<.8)?Math.sin(time*26)*.5:0;inner.position.x=(k>.25&&k<.8)?Math.sin(time*13)*.12:0;if(k>.3&&k<.78&&Math.random()<.35)c.emit(c.tip,[(Math.random()-.5)*1.2,Math.random()*1.2,(Math.random()-.5)*1.2],'#ffd1e6',.9,1.1);if(k>.3&&k<.8&&Math.random()<.04)c.sfx('giggle');};
 }
 if(id==='squirt'){
  const b=toon('#3fa9d8'),w=toon('#e8eef0');
  blob(inner,b,[0,-.25,-.6],[.22,.5,.22],cyl);blob(inner,w,[0,.05,-.6],[.12,.22,.12],cyl);blob(inner,w,[0,.12,-.45],[.12,.12,.36],box);rod(inner,w,.045,-.45,.12,0,.12);blob(inner,toon('#c0392b'),[0,-.1,-.75],[.05,.24,.06],box);
  tick=(k,time,c)=>{if(k>.25&&k<.8){for(let i=0;i<3;i++){const sp=(i%2)*.5;c.emitDir(c.tipLocal(inner,0,.12,.12),[0,.4+Math.random()*.2,6+Math.random()],'#a5e4ff',.5,1.1,c.target);}if(Math.random()<.35)c.emit(c.target,[(Math.random()-.5)*2,Math.random()*2+1,(Math.random()-.5)*2],'#e8f8ff',.6,1.4);}};
 }
 if(id==='chicken'){
  const y=toon('#ffd23a'),o=toon('#ff8a1d'),r=toon('#e03a3a');
  const pivot=new T.Group();pivot.position.set(0,0,-.2);inner.add(pivot);
  blob(pivot,y,[0,0,.35],[.22,.2,.5]);blob(pivot,y,[0,.08,.8],[.14,.14,.14]);blob(pivot,o,[0,.06,1.0],[.05,.05,.15],cone).rotation.x=Math.PI/2;blob(pivot,r,[0,.22,.8],[.03,.07,.1]);
  blob(pivot,toon('#111'),[.07,.12,.9],[.02,.02,.02]);blob(pivot,toon('#111'),[-.07,.12,.9],[.02,.02,.02]);
  blob(pivot,y,[.2,-.05,.2],[.12,.04,.2],sph);blob(pivot,y,[-.2,-.05,.2],[.12,.04,.2],sph);
  const l1=blob(pivot,o,[.07,-.22,-.05],[.025,.22,.025],cyl),l2=blob(pivot,o,[-.07,-.22,-.05],[.025,.22,.025],cyl);
  rod(pivot,toon('#7a5b36'),.04,-.9,.0);
  tick=(k,time,c)=>{const w=k<.25?-1.4*(k/.25):k<.33?-1.4+(k-.25)/.08*1.9:k<.62?.5*Math.exp(-(k-.33)*9)*Math.sin((k-.33)*34):0;pivot.rotation.x=w*(k>.8?(1-(k-.8)/.2):1);l1.rotation.x=l2.rotation.x=Math.sin(time*30)*.3;if(k>=.3&&!c.fired.impact){c.fired.impact=true;c.burst(c.tip,16,'#fff3a0',5,.5);c.ring(c.tip,'#ffe9a0');}};
 }
 if(id==='magnet'){
  const holder=new T.Group();inner.add(holder);
  const red=toon('#d9342b'),sil=toon('#d8dde0');
  blob(holder,red,[-.2,0,-.45],[.08,.1,.55],box);blob(holder,red,[.2,0,-.45],[.08,.1,.55],box);blob(holder,red,[0,0,-.75],[.48,.1,.1],box);
  blob(holder,sil,[-.2,0,-.1],[.09,.11,.12],box);blob(holder,sil,[.2,0,-.1],[.09,.11,.12],box);
  tick=(k,time,c)=>{if(k>.25&&k<.8){if(Math.random()<.5){const a=Math.random()*6.28;c.emitDir(c.target.clone().add(new T.Vector3(Math.cos(a)*.5,Math.sin(a)*.5,.5)),[0,0,0],'#ff6b6b',.5,1,c.tip);}holder.rotation.z=Math.sin(time*20)*.04;c.light('#ff5a5a',3);c.pull(1);}};
 }
 return {g,tick};
}
