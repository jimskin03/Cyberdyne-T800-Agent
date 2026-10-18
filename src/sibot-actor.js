import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Si BoT: single-view stylized reconstruction. Back and boots are inferred.
// Same articulated interface as the arena rigs; +Z forward, feet at ground.
export function createSiBotActor(scene){
 const root=new T.Group();root.name='Si BoT';root.scale.setScalar(.38);scene.add(root);
 const palette={cloth:['#302b2c',.86,0],cream:['#fff0d1',.5,0],straw:['#bca36b',.88,0],black:['#151718',.72,0],rubber:['#202123',.64,0],steel:['#aaa99f',.28,.85],yellow:['#e5af16',.45,.15]};
 const materials=Object.fromEntries(Object.entries(palette).map(([k,[color,roughness,metalness]])=>[k,new T.MeshStandardMaterial({color,roughness,metalness})]));
 const parts={},pivots={},rest=new Map(),tags=[];
 function pivot(id,parent,pos){const n=new T.Group();n.name=id;n.position.set(...pos);parent.add(n);pivots[id]=n;return n;}
 function mesh(id,parent,geo,mat,pos=[0,0,0],scale=[1,1,1]){const m=new T.Mesh(geo,materials[mat]||mat);m.name=id;m.userData.partId=id;m.userData.materialId=typeof mat==='string'?mat:'decal';m.position.set(...pos);m.scale.set(...scale);m.castShadow=m.receiveShadow=true;parent.add(m);parts[id]=m;rest.set(m,m.position.clone());return m;}
 const round=(id,parent,mat,pos,size,r=.06)=>mesh(id,parent,new RoundedBoxGeometry(...size,2,r),mat,pos);
 const ball=(id,parent,mat,pos,size)=>mesh(id,parent,new T.SphereGeometry(1,24,16),mat,pos,size);
 const torso=pivot('torso-pivot',root,[0,2.12,0]),head=pivot('head-pivot',torso,[0,1.05,.05]),jaw=pivot('jaw-pivot',head,[0,-.17,.32]);
 round('torso',torso,'cloth',[0,0,0],[1.12,1.05,.65],.16);
 round('neck',torso,'black',[0,.68,0],[.45,.45,.43],.12);
 round('pelvis',root,'cloth',[0,1.54,0],[.92,.30,.57],.1);
 ball('head',head,'cream',[0,.17,0],[.55,.49,.43]);
 for(const x of [-.21,.21])ball('eye-'+x,head,'black',[x,.19,.402],[.067,.18,.033]).rotation.z=-.1;
 const hat=pivot('hat-pivot',head,[0,.57,0]);hat.rotation.z=-.07;
 const points=[new T.Vector2(0,0),new T.Vector2(.58,0),new T.Vector2(.9,.025),new T.Vector2(1.2,.1),new T.Vector2(1.4,.2),new T.Vector2(1.43,.25),new T.Vector2(1.4,.28),new T.Vector2(1.2,.18),new T.Vector2(.85,.10),new T.Vector2(.55,.065),new T.Vector2(0,.065)];
 mesh('hat',hat,new T.LatheGeometry(points,64),'straw').scale.z=.87;
 mesh('crown',hat,new T.LatheGeometry([new T.Vector2(.55,.02),new T.Vector2(.53,.27),new T.Vector2(.45,.64),new T.Vector2(.31,.85),new T.Vector2(.08,.90),new T.Vector2(0,.89)],48),'straw').scale.z=.9;
 mesh('hat-band',hat,new T.CylinderGeometry(.57,.60,.24,48,1,true),'black',[0,.19,0],[1,1,.9]);
 const rim=mesh('hat-rim',hat,new T.TorusGeometry(1.405,.022,6,64),'black',[0,.244,0],[1,.87,1]);rim.rotation.x=Math.PI/2;
 for(let i=0;i<20;i++){
  const a=i*Math.PI/10,shape=new T.Shape();shape.moveTo(-.12,0);shape.lineTo(0,.19);shape.lineTo(.12,0);shape.closePath();const hole=new T.Path();hole.moveTo(-.055,.03);hole.lineTo(.055,.03);hole.lineTo(0,.12);hole.closePath();shape.holes.push(hole);
  const tri=mesh('hat-triangle-'+i,hat,new T.ShapeGeometry(shape),'black',[Math.sin(a)*1.26,.155,Math.cos(a)*1.26*.87]);tri.rotation.set(-1.2,a,0,'YXZ');tri.material.side=T.DoubleSide;
  // Matching dark woven triangles on the underside, readable at character eye level.
  const vertices=[],point=(angle,r,y)=>[Math.sin(angle)*r,y,Math.cos(angle)*r*.87];
  const outer=[point(a-.075,1.32,.132),point(a+.075,1.32,.132),point(a,1.06,.058)],inner=[point(a-.035,1.265,.113),point(a+.035,1.265,.113),point(a,1.15,.087)];
  for(let j=0;j<3;j++){const k=(j+1)%3;vertices.push(...outer[j],...outer[k],...inner[j],...inner[j],...outer[k],...inner[k]);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();mesh('hat-woven-triangle-'+i,hat,geo,'black');
 }
 function label(id,parent,text,pos,size,{bg='#181b1d',fg='#fff2d7',border=false}={}){
  if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,256);if(border){ctx.strokeStyle=fg;ctx.lineWidth=8;ctx.strokeRect(12,12,488,232);}ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 '+(text.length>3?100:182)+'px Arial';ctx.fillText(text,256,135,470);const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;const m=new T.MeshStandardMaterial({map,roughness:.85,side:T.DoubleSide});const out=mesh(id,parent,new T.PlaneGeometry(...size),m,pos);out.userData.explodeWithParent=true;return out;
 }
 round('vest',torso,'rubber',[0,-.01,.32],[1.09,.94,.22],.055);
 for(const x of [-.44,.44]){round('strap-'+x,torso,'black',[x,.08,.43],[.13,.88,.07],.025);round('strap-buckle-'+x,torso,'steel',[x,.39,.478],[.13,.13,.018],.01);}
 round('patch',torso,'black',[0,.25,.46],[.81,.30,.035],.018);label('patch-lettering',torso,'SI-WAT',[0,.25,.482],[.76,.28]);
 for(let row=0;row<3;row++)for(let col=0;col<5;col++)round('webbing-'+row+'-'+col,torso,'cloth',[(col-2)*.185,-.01-row*.135,.451],[.15,.052,.036],.013);
 for(const x of [-.34,0,.34]){round('pouch-'+x,torso,'cloth',[x,-.37,.49],[.28,.31,.18],.04);round('pouch-flap-'+x,torso,'rubber',[x,-.26,.59],[.26,.11,.03],.015);}
 round('belt',torso,'black',[0,-.55,0],[1.07,.20,.72],.04);round('buckle',torso,'steel',[0,-.55,.375],[.22,.15,.04],.015);
 function tag(id,parent,pos,angle=0){const g=pivot('tag-pivot-'+id,parent,pos);g.rotation.z=angle;tags.push(g);round('tag-'+id,g,'steel',[0,-.16,0],[.23,.32,.035],.022);label('tag-letter-'+id,g,'SI',[0,-.16,.02],[.21,.29],{bg:'#f4e4b8',fg:'#1b1d1c',border:true});mesh('tag-ring-'+id,g,new T.TorusGeometry(.051,.009,6,12),'steel',[0,.025,0]);return g;}
 for(let i=0;i<4;i++)tag('belt-'+i,torso,[(i<2?-.46:.46)+(i%2)*.12,-.60,.41],(i-1.5)*.09);
 const drill=pivot('drill-pivot',torso,[.68,-.55,.06]);round('drill',drill,'yellow',[0,0,0],[.24,.24,.43],.05);round('drill-grip',drill,'black',[0,-.2,-.08],[.16,.29,.18],.03);round('drill-battery',drill,'yellow',[0,-.36,-.05],[.26,.12,.25],.025);const chuck=mesh('drill-chuck',drill,new T.CylinderGeometry(.06,.085,.16,12),'steel',[0,0,.28]);chuck.rotation.x=Math.PI/2;
 const arms={},legs={},nodes={head,torso,jaw,neck:torso,body:root};
 for(const [side,sign]of[['L',-1],['R',1]]){
  const sh=pivot('shoulder-'+side,torso,[sign*.73,.34,0]),el=pivot('elbow-'+side,sh,[0,-.65,0]),fa=pivot('forearm-pivot-'+side,el,[0,0,0]),hand=pivot('hand-'+side,fa,[0,-.65,0]);
  ball('shoulder-shell-'+side,sh,'cloth',[0,-.04,0],[.24,.27,.25]);round('arm-'+side,sh,'cloth',[0,-.32,0],[.37,.62,.40],.14);ball('elbow-shell-'+side,el,'rubber',[0,0,0],[.18,.18,.18]);round('forearm-'+side,fa,'cloth',[0,-.30,0],[.34,.61,.36],.13);round('glove-'+side,hand,'rubber',[0,-.06,.03],[.34,.30,.29],.07);
  const hip=pivot('hip-'+side,root,[sign*.34,1.6,0]),knee=pivot('knee-'+side,hip,[0,-.7,0]),foot=pivot('foot-'+side,knee,[0,-.68,.1]);
  round('leg-'+side,hip,'cloth',[0,-.34,0],[.44,.7,.44],.14);round('shin-'+side,knee,'cloth',[0,-.33,0],[.39,.66,.43],.12);round('boot-'+side,foot,'rubber',[0,0,.12],[.46,.22,.7],.07);
  ball('knee-joint-'+side,knee,'black',[0,0,0],[.17,.17,.17]);
  round('knee-pad-'+side,knee,'rubber',[0,-.03,.218],[.33,.30,.085],.06);
  for(let i=0;i<3;i++){round('sleeve-fold-'+side+i,fa,'rubber',[0,-.1-i*.17,.025],[.35,.035,.36],.014);round('boot-lace-'+side+i,foot,'cloth',[0,.12,.13+i*.09],[.31,.018,.027],.008);round('knuckle-'+side+i,hand,'black',[(i-1)*.09,-.015,.183],[.067,.11,.044],.018);}
  arms[side]={sh,el,fa,hand};legs[side]={hip,knee,foot};Object.assign(nodes,{['sh'+side]:sh,['el'+side]:el,['fa'+side]:fa,['hand'+side]:hand,['hip'+side]:hip,['knee'+side]:knee,['foot'+side]:foot});
 }
 // Belt tags remain clear of hand-held scene props.
 for(let i=0;i<3;i++)tag('side-'+i,torso,[-.58-i*.06,-.25-i*.10,.02],.2+i*.15);
 const runtime={parts,pivots,sockets:{leftHand:arms.L.hand,rightHand:arms.R.hand,head},colliders:[{part:'torso',type:'box',size:[1.12,1.05,.65]},{part:'head',type:'sphere',radius:.55}],destructionGroups:Object.keys(parts),pickPart(hit){return hit?.object?.userData.partId||null;},explode(amount=0){for(const [m,p]of rest)m.position.copy(p).multiplyScalar(1+Math.max(0,amount));}};
 root.userData.sculptRuntime=runtime;
 return {root,torso,head,jaw,arms,legs,nodes,rigKind:'compact',robotId:'sibot',baseY:0,update(t,dt,speaking){head.rotation.z=Math.sin(t*1.5)*.025;head.rotation.x=speaking?Math.sin(t*8)*.025:0;for(let i=0;i<tags.length;i++)tags[i].rotation.z=Math.sin(t*2.6+i)*.07;}};
}
