import * as T from 'three';
// Shared Luna rig used by the revolver scene and cell berserker mode.
export function createLunaActor(scene){
 const mat=c=>new T.MeshStandardMaterial({color:c,metalness:.55,roughness:.4});
 const box=new T.BoxGeometry(1,1,1),ball=new T.SphereGeometry(1,20,14),cyl=new T.CylinderGeometry(1,1,1,16);
 const add=(parent,geo,color,p,s)=>{const m=new T.Mesh(geo,mat(color));m.position.set(...p);m.scale.set(...s);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 const pivot=(parent,p)=>{const g=new T.Group();g.position.set(...p);parent.add(g);return g;};
 const root=new T.Group(),torso=pivot(root,[0,2.12,0]),head=pivot(torso,[0,1.05,.05]);root.scale.setScalar(.38);scene.add(root);
 add(torso,box,'#21ada8',[0,0,0],[1.12,.98,.63]);add(torso,ball,'#ffbc57',[0,-.35,.38],[.2,.18,.09]);
 add(torso,cyl,'#657b8a',[0,.63,0],[.13,.45,.13]);add(head,ball,'#b9f4df',[0,.18,0],[.63,.45,.44]);add(head,box,'#28565f',[0,-.05,.2],[.85,.22,.45]);
 const pupils=[];for(const [x,size]of[[-.25,.22],[.25,.27]]){add(head,ball,'#faffed',[x,.28,.36],[size,size,.17]);pupils.push(add(head,ball,'#16383d',[x+.02,.3,.51],[.09,.11,.055]));}
 const jaw=pivot(head,[0,-.16,.4]);add(jaw,box,'#ffba52',[0,0,0],[.5,.12,.17]);for(let i=0;i<5;i++)add(jaw,box,'#f9ffef',[-.18+i*.085,.08,.1],[.06,.08,.04]);
 add(head,cyl,'#587180',[0,.85,0],[.025,.55,.025]);const antenna=add(head,ball,'#ff7b42',[0,1.14,0],[.13,.13,.13]);
 const arms={},legs={},nodes={head,torso,jaw,neck:torso,body:root};
 for(const [side,sign]of[['L',-1],['R',1]]){const sh=pivot(torso,[sign*.75,.32,0]),el=pivot(sh,[0,-.65,0]),fa=pivot(el,[0,0,0]),hand=pivot(fa,[0,-.65,0]);add(sh,ball,'#ffaa51',[0,0,0],[.22,.22,.22]);add(sh,cyl,'#5a7180',[0,-.32,0],[.13,.64,.13]);add(el,ball,'#263d45',[0,0,0],[.18,.18,.18]);add(fa,cyl,'#21ada8',[0,-.3,0],[.18,.6,.18]);add(hand,ball,'#ffb955',[0,-.05,0],[.21,.22,.18]);arms[side]={sh,el,fa,hand};const hip=pivot(root,[sign*.36,1.6,0]),knee=pivot(hip,[0,-.7,0]),foot=pivot(knee,[0,-.68,.1]);add(hip,cyl,'#6c8290',[0,-.35,0],[.14,.7,.14]);add(knee,ball,'#ffb955',[0,0,0],[.22,.2,.2]);add(knee,cyl,'#21ada8',[0,-.33,0],[.16,.66,.16]);add(foot,box,side==='L'?'#ffb955':'#df6b40',[0,0,.12],[.44,.18,.64]);legs[side]={hip,knee,foot};Object.assign(nodes,{['sh'+side]:sh,['el'+side]:el,['fa'+side]:fa,['hand'+side]:hand,['hip'+side]:hip,['knee'+side]:knee,['foot'+side]:foot});}
 const luna={root,torso,head,jaw,arms,legs,nodes,update(t,dt,speaking){head.rotation.z=Math.sin(t*1.5)*.05;antenna.scale.y=.13+Math.sin(t*4)*.012;jaw.rotation.x=speaking?Math.abs(Math.sin(t*14))*.35:0;}};
 return luna;
}
