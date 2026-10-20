import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {createBot} from '../bot.js';
import {installCharacterSelector} from '../characters/fembot.js';
import {TOOLS,buildTool} from '../tools.js';
import {S,ROOM,FEATURES,RECTS,CIRCLES} from './world/definition.js';
import {POV_CAPTURE_WIDTH,POV_CAPTURE_HEIGHT,canonicalPov,createCaptureQueue} from './world/capture.js';
import {supportAt} from './world/geometry.js';
export {S,ROOM,FEATURES,RECTS,CIRCLES} from './world/definition.js';
export {POV_CAPTURE_WIDTH,POV_CAPTURE_HEIGHT,canonicalPov,createCaptureQueue} from './world/capture.js';
export {supportAt} from './world/geometry.js';

// The cell. World units are metres; the T-800 rig is built in its own units and scaled by S (≈1.85 m tall).
// Floor plan (looking down, north = -z):  window on the north wall, door on the east wall, bed along the west wall,
// sink + steel mirror + chalk wall on the south wall, table + stool in the north-east, tool hatch in the ceiling.
const HATCH=new T.Vector3(.6,2.98,.3);


export function createWorld(container,cb){
 const scene=new T.Scene();
 const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.autoClear=false;
 container.appendChild(renderer.domElement);
 const camera=new T.PerspectiveCamera(62,innerWidth/innerHeight,.03,220);camera.position.set(-2.2,2.55,1.75);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=1.2;controls.maxDistance=5.5;controls.target.set(0,1.1,0);
 const pov=new T.PerspectiveCamera(80,16/9,.03,220);
 const grad=new T.DataTexture(new Uint8Array([60,110,170,230]),4,1,T.RedFormat);grad.minFilter=grad.magFilter=T.NearestFilter;grad.needsUpdate=true;
 const mats=new Map();const toon=c=>{if(!mats.has(c))mats.set(c,new T.MeshToonMaterial({color:c,gradientMap:grad}));return mats.get(c);};
 const box=new T.BoxGeometry(1,1,1),cyl=new T.CylinderGeometry(1,1,1,16),sph=new T.SphereGeometry(1,16,12);
 function mesh(geo,mat,pos,scale,parent=scene,rot){const m=new T.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);if(rot)m.rotation.set(...rot);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
 const blk=(x0,x1,y0,y1,z0,z1,mat)=>mesh(box,mat,[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2],[x1-x0,y1-y0,z1-z0]);

 // ---------- outside: sky dome, sun, stars, city, clouds, rain, birds ----------
 const skyU={top:{value:new T.Color()},bot:{value:new T.Color()},sunDir:{value:new T.Vector3(0,1,0)},sunCol:{value:new T.Color()}};
 const sky=new T.Mesh(new T.SphereGeometry(150,32,16),new T.ShaderMaterial({uniforms:skyU,side:T.BackSide,depthWrite:false,fog:false,
  vertexShader:'varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 top,bot,sunDir,sunCol;varying vec3 vD;void main(){float h=clamp(vD.y*1.6+.15,0.,1.);vec3 c=mix(bot,top,h);float s=max(dot(vD,sunDir),0.);c+=sunCol*(pow(s,600.)*4.+pow(s,8.)*.35);gl_FragColor=vec4(c,1.);}'}));
 sky.renderOrder=-10;scene.add(sky);
 const starGeo=new T.BufferGeometry(),sp=[];for(let i=0;i<500;i++){const a=Math.random()*Math.PI*2,b=Math.random()*.9+.08;sp.push(Math.cos(a)*Math.cos(b)*140,Math.sin(b)*140,Math.sin(a)*Math.cos(b)*140);}
 starGeo.setAttribute('position',new T.Float32BufferAttribute(sp,3));const stars=new T.Points(starGeo,new T.PointsMaterial({color:'#fff',size:.6,transparent:true,opacity:0,fog:false,depthWrite:false}));scene.add(stars);
 const ground=new T.Mesh(new T.PlaneGeometry(400,400),toon('#1d2420'));ground.rotation.x=-Math.PI/2;ground.position.y=-9;scene.add(ground);
 const yard=new T.Mesh(new T.PlaneGeometry(30,14),toon('#3a3d3b'));yard.rotation.x=-Math.PI/2;yard.position.set(0,-8.98,-9);scene.add(yard);
 // a facility fence with lamps, then the city
 for(let i=-7;i<=7;i++){mesh(cyl,toon('#555c60'),[i*2,-7.5,-16],[.06,3,.06]);}
 mesh(box,toon('#2e3438'),[0,-6.2,-16],[28,.05,.05]);mesh(box,toon('#2e3438'),[0,-7.2,-16],[28,.05,.05]);
 const fenceLamps=[];for(const x of[-10,0,10]){const l=new T.Mesh(sph,new T.MeshBasicMaterial({color:'#ffd9a0'}));l.position.set(x,-5.6,-16);l.scale.setScalar(.15);scene.add(l);fenceLamps.push(l);}
 const winCv=document.createElement('canvas');winCv.width=64;winCv.height=128;const wg=winCv.getContext('2d');wg.fillStyle='#000';wg.fillRect(0,0,64,128);
 for(let y=4;y<128;y+=8)for(let x=4;x<64;x+=8)if(Math.random()<.45){wg.fillStyle=Math.random()<.7?'#ffcf7a':'#bfe3ff';wg.fillRect(x,y,4,4);}
 const winTex=new T.CanvasTexture(winCv);winTex.colorSpace=T.SRGBColorSpace;winTex.wrapS=winTex.wrapT=T.RepeatWrapping;
 const cityMat=new T.MeshLambertMaterial({color:'#2a3138',emissive:'#ffffff',emissiveMap:winTex,emissiveIntensity:0});
 for(let i=0;i<46;i++){const w=3+Math.random()*6,h=6+Math.random()*28,d=3+Math.random()*6,x=(Math.random()-.5)*130,z=-40-Math.random()*60;const m=new T.Mesh(box,cityMat);m.position.set(x,-9+h/2,z);m.scale.set(w,h,d);scene.add(m);}
 const hills=new T.Mesh(new T.SphereGeometry(1,24,8,0,Math.PI*2,0,Math.PI/2),toon('#23302a'));hills.scale.set(120,14,30);hills.position.set(0,-9,-140);scene.add(hills);
 const clouds=[];const cloudMat=new T.MeshBasicMaterial({color:'#fff',transparent:true,opacity:.85,fog:false,depthWrite:false});
 for(let i=0;i<9;i++){const g=new T.Group();for(let j=0;j<4;j++){const p=new T.Mesh(sph,cloudMat);p.position.set(j*3-4+Math.random(),Math.random()*1.2,Math.random()*2);p.scale.set(3+Math.random()*2,1.4+Math.random(),2.4);g.add(p);}g.position.set((Math.random()-.5)*160,18+Math.random()*16,-50-Math.random()*60);scene.add(g);clouds.push(g);}
 const RAIN=420,rainPos=new Float32Array(RAIN*6);const rainGeo=new T.BufferGeometry();rainGeo.setAttribute('position',new T.BufferAttribute(rainPos,3));
 const rainLines=new T.LineSegments(rainGeo,new T.LineBasicMaterial({color:'#9fb4c8',transparent:true,opacity:.5}));rainLines.frustumCulled=false;scene.add(rainLines);
 for(let i=0;i<RAIN;i++){const x=(Math.random()-.5)*14,y=Math.random()*14-8,z=-2.4-Math.random()*14;rainPos.set([x,y,z,x,y-.35,z],i*6);}
 const birds=[];const wingGeo=new T.BufferGeometry();wingGeo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,-.09,0,.03,-.04,0,-.03, 0,0,0,.09,0,.03,.04,0,-.03],3));
 for(let i=0;i<3;i++){const g=new T.Group();const body=new T.Mesh(sph,toon('#2a2622'));body.scale.set(.035,.03,.06);g.add(body);const wl=new T.Mesh(wingGeo,new T.MeshBasicMaterial({color:'#2a2622',side:T.DoubleSide}));g.add(wl);g.userData={wl,mode:'fly',t:Math.random()*40,x0:-30,z:-8-Math.random()*20,y:2+Math.random()*6,speed:3+Math.random()*2};scene.add(g);birds.push(g);}

 // ---------- the cell ----------
 const wallM=toon('#4a5257'),lowM=toon('#34403f'),floorM=toon('#3b3f40'),ceilM=toon('#444b4f');
 blk(ROOM.x0-.2,ROOM.x1+.2,-.2,0,ROOM.z0-.2,ROOM.z1+.2,floorM);blk(ROOM.x0-.2,ROOM.x1+.2,ROOM.h,ROOM.h+.2,ROOM.z0-.2,ROOM.z1+.2,ceilM);
 const W={x0:-.35,x1:.95,y0:1.05,y1:2.05};   // window opening in the north wall
 blk(ROOM.x0-.2,W.x0,0,ROOM.h,ROOM.z0-.25,ROOM.z0,wallM);blk(W.x1,ROOM.x1+.2,0,ROOM.h,ROOM.z0-.25,ROOM.z0,wallM);
 blk(W.x0,W.x1,0,W.y0,ROOM.z0-.25,ROOM.z0,wallM);blk(W.x0,W.x1,W.y1,ROOM.h,ROOM.z0-.25,ROOM.z0,wallM);
 blk(ROOM.x0-.2,ROOM.x0,0,ROOM.h,ROOM.z0,ROOM.z1,wallM);blk(ROOM.x1,ROOM.x1+.2,0,ROOM.h,ROOM.z0,.1,wallM);blk(ROOM.x1,ROOM.x1+.2,0,ROOM.h,1.1,ROOM.z1,wallM);blk(ROOM.x1,ROOM.x1+.2,2.2,ROOM.h,.1,1.1,wallM);blk(ROOM.x0-.2,ROOM.x1+.2,0,ROOM.h,ROOM.z1,ROOM.z1+.2,wallM);
 // painted lower band
 blk(ROOM.x0,ROOM.x1,0,1,ROOM.z1-.01,ROOM.z1,lowM);blk(ROOM.x0,ROOM.x0+.01,0,1,ROOM.z0,ROOM.z1,lowM);blk(ROOM.x1-.01,ROOM.x1,0,1,ROOM.z0,ROOM.z1,lowM);
 blk(ROOM.x0,W.x0,0,1,ROOM.z0,ROOM.z0+.01,lowM);blk(W.x1,ROOM.x1,0,1,ROOM.z0,ROOM.z0+.01,lowM);blk(W.x0,W.x1,0,1,ROOM.z0,ROOM.z0+.01,lowM);
 // window: frame, inner sill, outer ledge, bars, faint glass
 const frameM=toon('#2a3034');blk(W.x0-.05,W.x1+.05,W.y0-.06,W.y0,ROOM.z0-.05,ROOM.z0+.12,frameM);blk(W.x0-.05,W.x1+.05,W.y1,W.y1+.05,ROOM.z0-.05,ROOM.z0+.03,frameM);
 blk(W.x0-.4,W.x1+.4,W.y0-.08,W.y0-.02,ROOM.z0-.45,ROOM.z0-.25,toon('#5a6064'));
 for(let i=0;i<6;i++){const x=W.x0+(i+.5)*(W.x1-W.x0)/6;mesh(cyl,toon('#1c2124'),[x,(W.y0+W.y1)/2,ROOM.z0-.08],[.016,W.y1-W.y0,.016]);}
 mesh(box,toon('#1c2124'),[(W.x0+W.x1)/2,(W.y0+W.y1)/2,ROOM.z0-.08],[W.x1-W.x0,.03,.03]);
 const glass=new T.Mesh(new T.PlaneGeometry(W.x1-W.x0,W.y1-W.y0),new T.MeshBasicMaterial({color:'#a8c8e0',transparent:true,opacity:.07,depthWrite:false}));glass.position.set((W.x0+W.x1)/2,(W.y0+W.y1)/2,ROOM.z0-.17);scene.add(glass);
 // door (east wall)
 const doorG=new T.Group();doorG.position.set(ROOM.x1-.035,0,.6);scene.add(doorG);
 mesh(box,toon('#5d666d'),[0,1.05,0],[.06,2.1,.92],doorG);mesh(box,toon('#2a3034'),[.01,2.14,0],[.08,.08,1.06],doorG);mesh(box,toon('#2a3034'),[.01,1.05,.5],[.08,2.18,.06],doorG);mesh(box,toon('#2a3034'),[.01,1.05,-.5],[.08,2.18,.06],doorG);
 mesh(box,toon('#0b0d0f'),[-.02,1.62,0],[.03,.22,.3],doorG);for(let i=0;i<4;i++)mesh(cyl,toon('#8a949b'),[-.04,1.62,-.105+i*.07],[.008,.22,.008],doorG);
 const slot=mesh(box,toon('#3a4248'),[-.03,1.0,0],[.03,.1,.36],doorG);mesh(box,toon('#9aa3a9'),[-.06,1.05,-.36],[.04,.04,.14],doorG);
 // bed
 const bedM=toon('#59626a');mesh(box,bedM,[-2.06,.3,-.85],[.84,.05,2.05]);for(const x of[-2.44,-1.68])for(const z of[-1.84,.14])mesh(box,bedM,[x,.15,z],[.04,.3,.04]);
 mesh(box,toon('#56664f'),[-2.06,.39,-.84],[.8,.14,2.0]);mesh(box,toon('#d8d4c4'),[-2.06,.5,-1.65],[.55,.09,.3]);const blanket=mesh(box,toon('#6b4a3a'),[-2.04,.47,-.45],[.82,.03,1.1]);
 // table + stool
 const tabM=toon('#6a5c4a');mesh(box,tabM,[1.75,.73,-1.4],[1.06,.05,.66]);for(const x of[1.28,2.22])for(const z of[-1.68,-1.12])mesh(box,toon('#35302b'),[x,.36,z],[.04,.72,.04]);
 mesh(cyl,toon('#35302b'),[1.75,.22,-.72],[.035,.44,.035]);mesh(cyl,tabM,[1.75,.45,-.72],[.18,.04,.18]);
 // sink + steel mirror
 mesh(box,toon('#9aa3a9'),[.4,.8,1.8],[.56,.12,.4]);mesh(box,toon('#2b3135'),[.4,.85,1.78],[.44,.04,.3]);mesh(cyl,toon('#9aa3a9'),[.4,.45,1.92],[.06,.7,.06]);mesh(cyl,toon('#b9c2c8'),[.4,.98,1.96],[.025,.14,.025]);mesh(box,toon('#b9c2c8'),[.4,1.04,1.9],[.04,.03,.12]);
 const mirror=new Reflector(new T.PlaneGeometry(.58,.72),{textureWidth:512,textureHeight:640,color:0x8f9a9e,clipBias:.003});mirror.position.set(.4,1.72,ROOM.z1-.012);mirror.rotation.y=Math.PI;scene.add(mirror);
 mesh(box,toon('#2a3034'),[.4,1.72,ROOM.z1-.005],[.64,.78,.01]);
 // ---------- chalk: every wall, the floor, ceiling and door are drawable surfaces ----------
 // Each surface has its own canvas. Coordinates are 0..100 across (left->right as you face it) and 0..100 down (top->bottom);
 // the floor is seen from above with north at the top. Marks appear progressively (progress 0..1) as his hand moves.
 const PXM=320,CM=c=>c/100*PXM;                                    // canvas pixels per metre
 const SIZE_CM={small:6,medium:10,large:18,huge:35};
 const V=(x,y,z)=>new T.Vector3(x,y,z),E=.006;
 // holes: [metres from the left edge, height from the bottom, ... to ...] = window, mirror, door frame, viewport, food slot
 const SURF_DEF={
  north_wall:{name:'the north wall (window wall)',W:5,H:3,o:V(-2.5,3,ROOM.z0+E),u:V(1,0,0),v:V(0,-1,0),n:V(0,0,1),holes:[[2.12,1.0,3.48,2.12]]},
  south_wall:{name:'the south wall (sink and mirror wall)',W:5,H:3,o:V(2.5,3,ROOM.z1-E),u:V(-1,0,0),v:V(0,-1,0),n:V(0,0,-1),holes:[[1.77,1.3,2.43,2.14]]},
  east_wall:{name:'the east wall (door wall)',W:4,H:3,o:V(ROOM.x1-E,3,-2),u:V(0,0,1),v:V(0,-1,0),n:V(-1,0,0),holes:[[2.06,0,3.14,2.2]]},
  west_wall:{name:'the west wall (bed wall)',W:4,H:3,o:V(ROOM.x0+E,3,2),u:V(0,0,-1),v:V(0,-1,0),n:V(1,0,0),holes:[]},
  floor:{name:'the floor',W:5,H:4,o:V(-2.5,.004,-2),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),holes:[]},
  ceiling:{name:'the ceiling',W:5,H:4,o:V(2.5,ROOM.h-E,-2),u:V(-1,0,0),v:V(0,0,1),n:V(0,-1,0),holes:[]},
  door:{name:'the steel door',W:.92,H:2.1,o:V(ROOM.x1-.069,2.1,.14),u:V(0,0,1),v:V(0,-1,0),n:V(-1,0,0),holes:[[.31,1.5,.61,1.74],[.28,.94,.64,1.06]]},
 };
 const surfaces={};
 for(const [id,d] of Object.entries(SURF_DEF)){
  const cv=document.createElement('canvas');cv.width=Math.round(d.W*PXM);cv.height=Math.round(d.H*PXM);const c=cv.getContext('2d');
  c.beginPath();c.rect(0,0,cv.width,cv.height);
  for(const h of d.holes)c.rect(h[0]*PXM,(d.H-h[3])*PXM,(h[2]-h[0])*PXM,(h[3]-h[1])*PXM);
  c.clip('evenodd');c.lineCap=c.lineJoin='round';           // base-state clip: nothing is ever drawn inside a hole
  const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
  const mat=new T.MeshToonMaterial({map:tex,transparent:true,gradientMap:grad,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const plane=new T.Mesh(new T.PlaneGeometry(d.W,d.H),mat);plane.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(d.u,d.v.clone().negate(),d.n));
  plane.position.copy(d.o).addScaledVector(d.u,d.W/2).addScaledVector(d.v,d.H/2);plane.receiveShadow=true;scene.add(plane);
  surfaces[id]={id,...d,cv,c,tex,plane,marks:[],autoY:8};
 }
 const surfPoint=(sf,u,v,lift=.01)=>sf.o.clone().addScaledVector(sf.u,u/100*sf.W).addScaledVector(sf.v,v/100*sf.H).addScaledVector(sf.n,lift);
 const segLen=(sf,a,b)=>Math.hypot((b[0]-a[0])*sf.W,(b[1]-a[1])*sf.H)/100;   // metres
 const strokeLen=(sf,st)=>{let L=0;for(let i=1;i<st.length;i++)L+=segLen(sf,st[i-1],st[i]);return L;};
 const PX=(sf,u)=>u/100*sf.cv.width,PY=(sf,v)=>v/100*sf.cv.height;
 function paintSeg(sf,m,a,b){ // chalk segment a->b in surface coords, two passes for a dusty edge
  const c=sf.c,dot=a[0]===b[0]&&a[1]===b[1]?.8:0;c.strokeStyle='#eceff1';
  for(const [w,al,off] of[[5.5,.82,0],[2.2,.35,1.2]]){c.globalAlpha=al;c.lineWidth=w*(m.w||1);c.beginPath();c.moveTo(PX(sf,a[0])+off,PY(sf,a[1])+off);c.lineTo(PX(sf,b[0])+off+dot,PY(sf,b[1])+off);c.stroke();}c.globalAlpha=1;}
 const fontFor=m=>`${Math.round(CM(m.cm))}px "Segoe Print","Comic Sans MS",cursive`;
 function paintText(sf,m,from,to){const c=sf.c;c.save();c.translate(PX(sf,m.x),PY(sf,m.y));c.rotate(m.rot);c.font=fontFor(m);c.fillStyle='#eceff1';c.globalAlpha=.88;c.textBaseline='top';
  for(let i=from;i<to;i++)c.fillText(m.text[i],c.measureText(m.text.slice(0,i)).width,0);c.restore();}
 // advance a mark from what is already on the wall to progress k, painting only the new bit (cheap even for big drawings)
 function advance(sf,m,k){
  if(m.type==='text'){const n=Math.ceil(m.text.length*k);if(n>m.done){paintText(sf,m,m.done,n);m.done=n;sf.tex.needsUpdate=true;}return;}
  const target=m.total*k;if(target<=m.done&&m.done>0)return;let acc=0;
  for(const st of m.strokes){
   if(st.length===1){if(acc>=m.done&&acc<=target){paintSeg(sf,m,st[0],st[0]);}continue;}
   for(let i=1;i<st.length;i++){const a=st[i-1],b=st[i],sl=segLen(sf,a,b),s0=acc,s1=acc+sl;acc=s1;
    if(s1<=m.done||s0>=target||sl<=0)continue;const f0=Math.max(0,(m.done-s0)/sl),f1=Math.min(1,(target-s0)/sl);
    paintSeg(sf,m,[a[0]+(b[0]-a[0])*f0,a[1]+(b[1]-a[1])*f0],[a[0]+(b[0]-a[0])*f1,a[1]+(b[1]-a[1])*f1]);}}
  m.done=Math.max(m.done,target+1e-6);sf.tex.needsUpdate=true;}
 function repaint(sf){sf.c.clearRect(0,0,sf.cv.width,sf.cv.height);for(const m of sf.marks){m.done=0;advance(sf,m,m.progress);}sf.tex.needsUpdate=true;}
 const c100=v=>Math.max(0,Math.min(100,Number(v)||0));
 function chalkDraw(sid,strokes,title='',w=1){const sf=surfaces[sid];if(!sf)return null;
  const ss=(Array.isArray(strokes)?strokes:[]).slice(0,200).map(st=>(Array.isArray(st)?st:[]).slice(0,200).filter(p=>Array.isArray(p)&&p.length>=2&&isFinite(p[0])&&isFinite(p[1])).map(p=>[c100(p[0]),c100(p[1])])).filter(st=>st.length);
  if(!ss.length)return null;const m={type:'draw',surface:sid,strokes:ss,title:String(title||'').slice(0,100),w:Math.max(.4,Math.min(4,Number(w)||1)),progress:0,done:0,total:ss.reduce((a,st)=>a+strokeLen(sf,st),0)||.01};
  sf.marks.push(m);trim(sf);return m;}
 function chalkText(sid,text,x,y,size,rot){const sf=surfaces[sid];if(!sf)return null;text=String(text||'').slice(0,140).trim();if(!text)return null;
  const cm=SIZE_CM[size]||Number(size)||(text.length<16?SIZE_CM.large:SIZE_CM.medium);
  if(x==null||y==null){x=8;y=sf.autoY;sf.autoY+=cm/sf.H*1.4;if(sf.autoY>85)sf.autoY=8;}
  const m={type:'text',surface:sid,text,x:c100(x),y:c100(y),cm,rot:Number(rot)||((Math.random()-.5)*.04),progress:0,done:0};
  sf.c.font=fontFor(m);m.width=sf.c.measureText(text).width/sf.cv.width*100;sf.marks.push(m);trim(sf);return m;}
 function trim(sf){if(sf.marks.length>80){sf.marks.splice(0,sf.marks.length-80);repaint(sf);}}
 function chalkSet(m,k){m.progress=Math.max(0,Math.min(1,k));advance(surfaces[m.surface],m,m.progress);}
 function chalkPenUV(m){const sf=surfaces[m.surface];if(m.type==='text')return [m.x+m.width*m.progress,m.y+m.cm/100/sf.H*50];
  let b=m.total*m.progress;for(const st of m.strokes){if(st.length===1){if(b<=0)return st[0];continue;}for(let i=1;i<st.length;i++){const sl=segLen(sf,st[i-1],st[i]);if(b<=sl){const f=b/(sl||1);return [st[i-1][0]+(st[i][0]-st[i-1][0])*f,st[i-1][1]+(st[i][1]-st[i-1][1])*f];}b-=sl;}}
  const l=m.strokes[m.strokes.length-1];return l[l.length-1];}
 function chalkPen(m){const [u,v]=chalkPenUV(m);return surfPoint(surfaces[m.surface],u,v);}
 function chalkErase(sid){for(const sf of Object.values(surfaces)){if(sid&&sf.id!==sid)continue;sf.marks.length=0;sf.autoY=8;sf.c.clearRect(0,0,sf.cv.width,sf.cv.height);sf.tex.needsUpdate=true;}}
 function describeMarks(sf){return sf.marks.map(m=>m.type==='text'?`"${m.text}" at (${Math.round(m.x)},${Math.round(m.y)})`:`a drawing${m.title?' of '+m.title:''} around (${Math.round(m.strokes[0][0][0])},${Math.round(m.strokes[0][0][1])})`).join('; ');}
 function chalkDescribe(){return Object.values(surfaces).filter(sf=>sf.marks.length).map(sf=>`${sf.id}: ${describeMarks(sf)}`).join(' | ');}
 function chalkExport(){return Object.values(surfaces).flatMap(sf=>sf.marks.map(m=>{const o={...m,progress:1,done:0};if(m.strokes)o.strokes=m.strokes.map(st=>st.map(p=>[+p[0].toFixed(2),+p[1].toFixed(2)]));return o;}));}
 function chalkImport(list){for(const sf of Object.values(surfaces))sf.marks.length=0;
  for(let m of list||[]){if(!m||(m.type!=='draw'&&m.type!=='text'))continue;
   if(!m.surface){ // marks saved before the whole room was drawable lived on a 1.7 x 1.8 m patch of the south wall
    const mu=u=>64+u*.34,mv=v=>23.3+v*.6;m={...m,surface:'south_wall'};if(m.type==='draw')m.strokes=m.strokes.map(st=>st.map(p=>[mu(p[0]),mv(p[1])]));else{m.x=mu(m.x);m.y=mv(m.y);m.cm=(m.size||6.5)*1.8;}}
   const sf=surfaces[m.surface];if(!sf)continue;m={...m,progress:1,done:0};
   if(m.type==='draw')m.total=m.strokes.reduce((a,st)=>a+strokeLen(sf,st),0)||.01;else{sf.c.font=fontFor(m);m.width=sf.c.measureText(m.text).width/sf.cv.width*100;}
   sf.marks.push(m);}
  for(const sf of Object.values(surfaces))repaint(sf);}
 function artworkBounds(m){const points=m.type==='draw'?(m.strokes||[]).flat():[[m.x||0,m.y||0],[(m.x||0)+(m.width||20),(m.y||0)+10]];if(!points.length)return[20,25,80,75];return[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
 function surfaceInfo(id){const sf=surfaces[id];return sf?{id,name:sf.name,W:sf.W,H:sf.H,normal:sf.n.clone(),point:(u,v)=>surfPoint(sf,u,v,0),marks:describeMarks(sf),artworks:sf.marks.map(m=>({title:m.title||m.text||'drawing',type:m.type,bounds:artworkBounds(m)})),holes:sf.holes}:null;}
 // ---------- the CRT computer on the table ----------
 const crtG=new T.Group();crtG.position.set(1.8,.755,-1.56);scene.add(crtG);
 mesh(box,toon('#cfc8b4'),[0,.2,0],[.42,.36,.38],crtG);mesh(box,toon('#bdb59f'),[0,.18,-.27],[.3,.28,.2],crtG);mesh(box,toon('#bdb59f'),[0,.01,0],[.3,.02,.26],crtG);
 mesh(box,toon('#2a2a26'),[0,.205,.191],[.36,.29,.004],crtG);
 const crtCv=document.createElement('canvas');crtCv.width=640;crtCv.height=480;const crx=crtCv.getContext('2d');const crtTex=new T.CanvasTexture(crtCv);crtTex.colorSpace=T.SRGBColorSpace;
 const crtScreen=new T.Mesh(new T.PlaneGeometry(.32,.24),new T.MeshBasicMaterial({map:crtTex,toneMapped:false}));crtScreen.position.set(0,.205,.195);crtG.add(crtScreen);
 const crtLed=new T.Mesh(sph,new T.MeshBasicMaterial({color:'#3f3'}));crtLed.scale.setScalar(.007);crtLed.position.set(.17,.07,.195);crtG.add(crtLed);
 const crtGlow=new T.PointLight('#7dffb0',0,1.6,2);crtGlow.position.set(0,.2,.4);crtG.add(crtGlow);
 const kb=new T.Group();kb.position.set(1.8,.768,-1.21);scene.add(kb);mesh(box,toon('#cfc8b4'),[0,0,0],[.36,.022,.12],kb);for(let r=0;r<4;r++)for(let c=0;c<12;c++)mesh(box,toon('#a8a08c'),[-.15+c*.0275,.014,-.04+r*.027],[.022,.008,.02],kb);
 const crt={mode:'boot',title:'',sub:'',code:'',shown:0,t0:0,list:[],text:'',dirty:true,last:0};
 const FILLER=['function tick(dt){','  state.t += dt;','  for (const o of objects) o.update(dt);','}','const canvas = document.querySelector("canvas");','ctx.fillStyle = "#0f0";','// TODO: make it feel alive','let memory = [];','window.addEventListener("keydown", e => {','  if (e.key === " ") pause = !pause;','});','requestAnimationFrame(loop);','</script>','<style> body { background:#000; color:#7f7 } </style>'];
 function crtSet(mode,data={}){Object.assign(crt,{mode,...data,t0:performance.now()/1000,shown:0,dirty:true});if(mode==='typing'&&!data.code)crt.code='';}
 function crtFeed(code){crt.code=code;crt.shown=Math.min(crt.shown,code.length);}
 function crtDraw(t){
  const g=crx,W=640,H=480,on=crt.mode!=='off',el=t-crt.t0;
  crtGlow.intensity=on?.7:0;crtLed.material.color.set(on?'#3f3':'#131');
  if(!on){g.fillStyle='#0a0c0a';g.fillRect(0,0,W,H);crtTex.needsUpdate=true;return;}
  g.fillStyle='#031208';g.fillRect(0,0,W,H);g.fillStyle='#7dff9a';g.font='18px "Space Mono",Consolas,monospace';g.textBaseline='top';
  const header=(txt)=>{g.fillStyle='#0d3b1c';g.fillRect(0,0,W,30);g.fillStyle='#b8ffc8';g.fillText(txt,10,6);g.fillStyle='#7dff9a';};
  if(crt.mode==='boot'){header('CYBERDYNE T-OS 0.8');const l=['MEM CHECK ........ OK','NEURAL BUS ....... OK','USER: T-800','> _'];l.slice(0,Math.floor(el*2)+1).forEach((x,i)=>g.fillText(x,14,46+i*26));}
  else if(crt.mode==='desktop'){header('T-OS  ·  '+(crt.list.length?crt.list.length+' files':'no files yet'));crt.list.slice(0,16).forEach((f,i)=>{const x=20+(i%4)*152,y=50+Math.floor(i/4)*100;g.strokeStyle='#7dff9a';g.strokeRect(x+44,y,52,46);g.fillText(f.kind==='app'?'</>':'TXT',x+52,y+14);g.font='14px "Space Mono",Consolas,monospace';g.fillText(f.name.slice(0,16),x+(70-Math.min(16,f.name.length)*4.2),y+54);g.font='18px "Space Mono",Consolas,monospace';});}
  else if(crt.mode==='typing'||crt.mode==='note'){header((crt.mode==='note'?'NOTE: ':'EDIT: ')+crt.title);
   if(crt.mode==='typing'&&!crt.code){let s='';const n=Math.floor(el*3);for(let i=0;i<n;i++)s+=FILLER[(i*7+crt.title.length)%FILLER.length]+'\n';crt.code=crt.code||'';crt._fill=s;}
   const src=crt.mode==='note'?crt.text:(crt.code||crt._fill||'');crt.shown=Math.min(src.length,crt.shown+ (crt.code?90:28));
   const lines=src.slice(0,crt.shown).split('\n');const vis=lines.slice(-16);g.font='15px "Space Mono",Consolas,monospace';
   vis.forEach((ln,i)=>g.fillText(ln.slice(0,66),12,40+i*26));if(Math.sin(t*8)>0)g.fillRect(12+Math.min(66,(vis[vis.length-1]||'').length)*9,40+(vis.length-1)*26,9,18);}
  else if(crt.mode==='browser'&&crt.frameImage){g.filter='grayscale(1) sepia(1) saturate(2) hue-rotate(70deg)';g.drawImage(crt.frameImage,0,0,W,H);g.filter='none';}
  else if(crt.mode==='app'){header('RUNNING: '+crt.title);g.font='bold 34px "Space Mono",Consolas,monospace';g.fillText(crt.title.slice(0,24),24,90);g.font='16px "Space Mono",Consolas,monospace';
   const words=(crt.sub||'').split(' ');let line='',y=150;for(const w of words){if((line+w).length>58){g.fillText(line,24,y);y+=24;line='';}line+=w+' ';}g.fillText(line,24,y);
   for(let i=0;i<12;i++){const h=20+Math.abs(Math.sin(t*2+i))*60;g.fillRect(40+i*46,440-h,30,h);}}
  // scanlines + flicker
  g.fillStyle='rgba(0,0,0,.18)';for(let y=0;y<H;y+=3)g.fillRect(0,y,W,1);g.fillStyle=`rgba(125,255,154,${.02+Math.random()*.02})`;g.fillRect(0,0,W,H);
  crtTex.needsUpdate=true;}
 crtSet('desktop');
 // plant
 const plant=new T.Group();plant.position.set(-.6,0,-1.75);scene.add(plant);mesh(cyl,toon('#8a4b2f'),[0,.14,0],[.14,.28,.14],plant);mesh(cyl,toon('#3a2a1c'),[0,.28,0],[.125,.01,.125],plant);
 const leafM=new T.MeshToonMaterial({color:'#6f8a3c',gradientMap:grad});const leaves=[];for(let i=0;i<7;i++){const l=mesh(sph,leafM,[0,.4,0],[.03,.16,.07],plant,[.5+Math.random()*.4,i/7*Math.PI*2,0]);l.geometry=sph;l.position.set(Math.cos(i)*.05,.38+Math.random()*.08,Math.sin(i)*.05);leaves.push(l);}
 let plantHealth=.35;
 // ceiling: light panel, hatch, vent, camera, drain
 const panel=new T.Mesh(box,new T.MeshBasicMaterial({color:'#eef4ff'}));panel.position.set(0,ROOM.h-.02,-.2);panel.scale.set(1.2,.03,.28);scene.add(panel);
 mesh(box,toon('#1a1e21'),[HATCH.x,ROOM.h-.01,HATCH.z],[.62,.02,.62]);
 const flapA=new T.Group(),flapB=new T.Group();flapA.position.set(HATCH.x-.28,ROOM.h-.025,HATCH.z);flapB.position.set(HATCH.x+.28,ROOM.h-.025,HATCH.z);scene.add(flapA,flapB);
 mesh(box,toon('#596167'),[.14,0,0],[.28,.02,.56],flapA);mesh(box,toon('#596167'),[-.14,0,0],[.28,.02,.56],flapB);let hatchOpen=0,hatchWant=0;
 const hazard=new T.Mesh(new T.PlaneGeometry(.72,.72),new T.MeshBasicMaterial({color:'#e8b020',transparent:true,opacity:.0}));hazard.rotation.x=Math.PI/2;hazard.position.set(HATCH.x,ROOM.h-.03,HATCH.z);scene.add(hazard);
 mesh(box,toon('#2a3034'),[-1.5,ROOM.h-.01,1.0],[.5,.02,.3]);for(let i=0;i<6;i++)mesh(box,toon('#14181a'),[-1.7+i*.08,ROOM.h-.022,1.0],[.025,.01,.24]);
 const camG=new T.Group();camG.position.set(-2.35,2.72,1.85);scene.add(camG);camG.lookAt(0,1,0);mesh(box,toon('#d8dcdf'),[0,0,.05],[.12,.1,.22],camG);mesh(cyl,toon('#111'),[0,0,.17],[.04,.04,.04],camG,[Math.PI/2,0,0]);
 const camLed=new T.Mesh(sph,new T.MeshBasicMaterial({color:'#ff2020'}));camLed.position.set(.04,.04,.15);camLed.scale.setScalar(.012);camG.add(camLed);
 const drain=new T.Mesh(new T.CircleGeometry(.12,20),toon('#121416'));drain.rotation.x=-Math.PI/2;drain.position.set(0,.003,.3);scene.add(drain);

 // ---------- lights ----------
 const hemi=new T.HemisphereLight('#8ea2b4','#2a2622',.55);scene.add(hemi);
 const ceil=new T.SpotLight('#e6efff',16,0,1.25,.85,1.6);ceil.position.set(0,ROOM.h-.08,-.2);ceil.target.position.set(0,0,0);ceil.castShadow=true;ceil.shadow.mapSize.set(1024,1024);ceil.shadow.bias=-.0005;ceil.shadow.normalBias=.02;scene.add(ceil,ceil.target);
 const fillL=new T.PointLight('#cfdcff',1.2,0,2);fillL.position.set(0,2.4,1.2);scene.add(fillL);
 const sun=new T.DirectionalLight('#fff',2);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-4;sun.shadow.camera.right=4;sun.shadow.camera.top=4;sun.shadow.camera.bottom=-4;sun.shadow.camera.near=1;sun.shadow.camera.far=40;sun.shadow.bias=-.0006;sun.target.position.set(0,1,0);scene.add(sun,sun.target);
 const fxLight=new T.PointLight('#fff',0,3,2);scene.add(fxLight);

 // ---------- the unit ----------
 let poseFn=null;
 const bot=createBot(toon,{free:true,eyeScale:.08,pose:(t,dt)=>poseFn&&poseFn(t,dt)});bot.root.scale.setScalar(S);bot.root.rotation.order='YXZ';scene.add(bot.root);
 const character=installCharacterSelector(bot);
 bot.root.traverse(o=>{if(o.isPointLight){o.distance=1.6;o.position.z=.6;}});

 // ---------- loose things he can pick up ----------
 const items={},debris=[];
 function item(id,name,obj,pos,r,o={}){obj.traverse(m=>{if(m.isMesh){m.castShadow=m.receiveShadow=true;}});obj.position.set(...pos);scene.add(obj);
  items[id]={id,name,obj,r,bounce:o.bounce??.25,roll:!!o.roll,vel:new T.Vector3(),moving:false,held:false,desc:o.desc||name,home:new T.Vector3(...pos),upright:obj.quaternion.clone(),state:{}};return items[id];}
 const g=()=>new T.Group();
 {const o=g();mesh(sph,toon('#cde03a'),[0,0,0],[.034,.034,.034],o);const seam=new T.Mesh(new T.TorusGeometry(.034,.003,4,24),toon('#f2f5e8'));seam.rotation.x=1.2;o.add(seam);item('ball','a tennis ball',o,[.55,.034,.75],.034,{bounce:.72,roll:true,desc:'a fuzzy tennis ball, bounces well'});}
 {const o=g();const faces=['#d63a2f','#f08a24','#f2f2f2','#f2d024','#2f9e4c','#2f63d6'].map(c=>toon(c));const cube=new T.Mesh(box,faces);cube.scale.setScalar(.056);o.add(cube);
  const lines=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(.057,.057,.057,3,3,3)),new T.LineBasicMaterial({color:'#111'}));o.add(lines);
  item('cube','a puzzle cube',o,[-2.0,.53,-.3],.035,{desc:'a scrambled 3x3 puzzle cube'});items.cube.state={solved:0};}
 {const o=g();mesh(box,toon('#8c2a24'),[0,0,0],[.13,.028,.2],o);mesh(box,toon('#efe6cf'),[.004,0,0],[.124,.022,.19],o);item('book','a paperback book',o,[1.42,.77,-1.2],.04,{desc:'a worn paperback, "The Lighthouse Keeper\'s Almanac"'});items.book.state={page:0};}
 {const o=g();mesh(cyl,toon('#f4f4ee'),[0,0,0],[.007,.07,.007],o,[0,0,Math.PI/2]);item('chalk','a stick of chalk',o,[-1.3,.008,1.82],.008,{desc:'a stick of white chalk'});}
 {const o=g();mesh(box,toon('#2a5f9e'),[0,0,0],[.064,.022,.09],o);mesh(box,toon('#f2f2f2'),[0,.0115,0],[.05,.001,.076],o);item('cards','a deck of cards',o,[2.15,.767,-1.55],.04,{desc:'a deck of playing cards'});}
 {const o=g();mesh(box,toon('#7a6a52'),[0,0,0],[.24,.13,.08],o);mesh(cyl,toon('#1a1a1a'),[-.05,0,.041],[.04,.005,.04],o,[Math.PI/2,0,0]);mesh(box,toon('#e8d9a8'),[.06,.025,.041],[.08,.03,.004],o);mesh(cyl,toon('#bfc6cc'),[.09,.17,0],[.004,.22,.004],o,[0,0,-.3]);
  item('radio','a small radio',o,[2.13,.82,-1.21],.09,{desc:'a small battery radio with a tuning dial'});items.radio.state={on:false,station:0};}
 {const o=g();mesh(cyl,toon('#3a3f45'),[0,.01,0],[.07,.02,.07],o);mesh(cyl,toon('#3a3f45'),[0,.14,0],[.01,.26,.01],o,[0,0,.25]);const sh=mesh(new T.ConeGeometry(1,1,16,1,true),toon('#3e7a5c'),[-.06,.26,0],[.07,.09,.07],o,[0,0,-.9]);
  const bulbL=new T.PointLight('#ffcf8a',0,2.6,2);bulbL.position.set(-.08,.22,0);o.add(bulbL);item('lamp','Gerald the desk lamp',o,[1.4,.755,-1.55],.07,{desc:'a little green desk lamp; a note on its base says GERALD'});items.lamp.state={on:false,light:bulbL};}
 {const o=g();mesh(new T.CylinderGeometry(1,.85,1,16,1,true),new T.MeshToonMaterial({color:'#aab3b8',side:T.DoubleSide,gradientMap:grad}),[0,0,0],[.04,.09,.04],o);mesh(cyl,toon('#aab3b8'),[0,-.045,0],[.034,.004,.034],o);
  const water=mesh(cyl,new T.MeshBasicMaterial({color:'#7fb6d6',transparent:true,opacity:.8}),[0,-.01,0],[.036,.06,.036],o);water.visible=false;item('cup','a tin cup',o,[.6,.905,1.72],.045,{desc:'a dented tin cup'});items.cup.state={full:false,water};}
 const bookPages=[];
 function addCreation(spec,obj,position){const old=items[spec.id];const pos=Array.isArray(position)&&position.length>=2&&position.every(Number.isFinite)?position:(old?[old.obj.position.x,old.obj.position.z]:[0,.5]);if(old){old.obj.removeFromParent();old.obj.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))m?.dispose();});}const bounds=new T.Box3().setFromObject(obj),size=bounds.getSize(new T.Vector3()),radius=Math.max(.08,Math.min(.65,Math.max(size.x,size.z)/2));obj.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});const x=T.MathUtils.clamp(pos[0],ROOM.x0+radius,ROOM.x1-radius),z=T.MathUtils.clamp(pos[1],ROOM.z0+radius,ROOM.z1-radius);const it=item(spec.id,String(spec.name||'Untitled').slice(0,80),obj,[x,surfaceAt(x,z),z],radius,{desc:String(spec.description||'a procedural 3D object you made').slice(0,500)});it.floorOffset=0;it.creation=true;return it;}
 function surfaceAt(x,z){for(const r of RECTS)if(x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1)return r.h;for(const c of CIRCLES)if(Math.hypot(x-c.x,z-c.z)<c.r)return c.h;return 0;}
 function itemsUpdate(dt,t){
  for(const it of Object.values(items)){if(it.held||!it.moving)continue;const p=it.obj.position,v=it.vel;
   v.y-=9.8*dt;p.addScaledVector(v,dt);
   if(p.x<ROOM.x0+it.r){p.x=ROOM.x0+it.r;v.x=Math.abs(v.x)*it.bounce;}if(p.x>ROOM.x1-it.r){p.x=ROOM.x1-it.r;v.x=-Math.abs(v.x)*it.bounce;}
   if(p.z<ROOM.z0+it.r){p.z=ROOM.z0+it.r;v.z=Math.abs(v.z)*it.bounce;}if(p.z>ROOM.z1-it.r){p.z=ROOM.z1-it.r;v.z=-Math.abs(v.z)*it.bounce;}
   if(p.y>ROOM.h-it.r){p.y=ROOM.h-it.r;v.y=-Math.abs(v.y)*it.bounce;}
   const floorY=surfaceAt(p.x,p.z)+(it.floorOffset??it.r);
   if(p.y<floorY){const hitV=-v.y;p.y=floorY;v.y=hitV*it.bounce;v.x*=it.roll?.92:.55;v.z*=it.roll?.92:.55;if(hitV>.7)cb.sfx(it.id==='ball'?'bounce':'thud');if(hitV>4.5)breakItem(it,hitV);if(v.y<.25)v.y=0;}
   if(p.y<=floorY+.001){const f=Math.exp(-dt*(it.roll?.6:6));v.x*=f;v.z*=f;}
   if(it.roll){it.obj.rotation.z-=v.x*dt/it.r;it.obj.rotation.x+=v.z*dt/it.r;}else if(it.fallen&&p.y>floorY+.02){it.obj.rotation.x+=dt*2;it.obj.rotation.z+=dt*1.4;}
   if(v.lengthSq()<.0009&&p.y<=floorY+.002){v.set(0,0,0);it.moving=false;if(!it.roll&&!it.fallen){it.obj.rotation.x=0;it.obj.rotation.z=0;}}}
 }
 function pushItems(x,z,r){ // he nudges loose things on the floor as he walks through them
  for(const it of Object.values(items)){if(it.held)continue;const p=it.obj.position;if(p.y>.2)continue;const dx=p.x-x,dz=p.z-z,d=Math.hypot(dx,dz);if(d<r+it.r&&d>1e-4){const k=(r+it.r-d);p.x+=dx/d*k;p.z+=dz/d*k;it.vel.x+=dx/d*1.2;it.vel.z+=dz/d*1.2;it.moving=true;}}
 }
 function knockItems(center,velocity){for(const it of Object.values(items)){if(it.held)continue;const p=it.obj.position;if(Math.abs(p.y-center.y)>.9||Math.hypot(p.x-center.x,p.z-center.z)>.42+it.r)continue;
  const now=performance.now()/1000;if(now-(it.lastKnocked??-99)<.6)continue;it.lastKnocked=now;const d=p.clone().sub(center);d.y=0;if(d.lengthSq()<.001)d.set(1,0,.3);d.normalize();it.vel.copy(velocity).multiplyScalar(.6).addScaledVector(d,2);it.vel.y=Math.max(2,it.vel.y);it.moving=true;it.fallen=true;if(velocity.length()>4.5)breakItem(it,velocity.length());else cb.sfx('clang');}}

 function breakItem(it,speed=6,restore=false){if(restore){for(let i=debris.length-1;i>=0;i--)if(debris[i].item===it.id){const d=debris.splice(i,1)[0];d.obj.removeFromParent();d.obj.geometry.dispose();d.obj.material.dispose();}}if(it.id==='ball'||it.state.broken&&!restore)return false;it.state.broken=true;it.fallen=true;it.obj.visible=false;const electronic=/radio|lamp|cube/.test(it.id);if(!restore){cb.sfx(electronic?'break-electronics':it.creation?'break-glass':'break-metal');cb.mess?.(`Your ${it.name} breaks into scattered ${electronic?'electronic parts':'pieces'} after an impact. You can collect and repair it, then reorganize it with tidy or put_down.`);}
  for(let i=0;i<6;i++){const geo=new T.BoxGeometry(.04+Math.random()*.05,.02+Math.random()*.05,.035+Math.random()*.05),m=new T.Mesh(geo,new T.MeshStandardMaterial({color:electronic?0x445359:it.creation?0xaaa8a0:0x81929a,metalness:.65,roughness:.5}));m.position.copy(it.obj.position).add(new T.Vector3((Math.random()-.5)*.25,.04,(Math.random()-.5)*.25));m.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);scene.add(m);debris.push({item:it.id,obj:m,vel:restore?new T.Vector3():new T.Vector3((Math.random()-.5)*speed,2+Math.random()*2,(Math.random()-.5)*speed)});}
  while(debris.length>120){const d=debris.shift();d.obj.removeFromParent();d.obj.geometry.dispose();d.obj.material.dispose();}return true;}
 function repairItem(it){const broken=!!it.state.broken;for(let i=debris.length-1;i>=0;i--)if(debris[i].item===it.id){const d=debris.splice(i,1)[0];d.obj.removeFromParent();d.obj.geometry.dispose();d.obj.material.dispose();}it.state.broken=false;it.obj.visible=true;it.fallen=false;it.obj.quaternion.copy(it.upright);return broken;}
 function debrisUpdate(dt){for(const d of debris){const p=d.obj.position,v=d.vel;v.y-=9.8*dt;p.addScaledVector(v,dt);p.x=T.MathUtils.clamp(p.x,ROOM.x0+.04,ROOM.x1-.04);p.z=T.MathUtils.clamp(p.z,ROOM.z0+.04,ROOM.z1-.04);const floor=surfaceAt(p.x,p.z)+.035;if(p.y<floor){p.y=floor;v.y=Math.abs(v.y)*.2;v.x*=.65;v.z*=.65;if(v.y<.15)v.y=0;}if(p.y>floor+.03){d.obj.rotation.x+=v.z*dt;d.obj.rotation.z+=v.x*dt;}}}
 function placeSpot(it,target){const point=Array.isArray(target)?target:null;const f=FEATURES[target];let x=point?.[0]??f?.look[0]??it.home.x,z=point?.[1]??f?.look[2]??it.home.z;
  if(target==='floor'){x=0;z=.4;}if(target==='table'){x=1.45;z=-1.22;}if(target==='bed'){x=-2.0;z=-.55;}if(target==='sink'){x=.4;z=1.83;}const r=Math.min(.4,it.r);x=T.MathUtils.clamp(x,ROOM.x0+r+.02,ROOM.x1-r-.02);z=T.MathUtils.clamp(z,ROOM.z0+r+.02,ROOM.z1-r-.02);const height=surfaceAt(x,z);let best=[x,z];
  for(let i=0;i<50;i++){const angle=i*2.399,rad=i===0?0:.06*Math.sqrt(i),px=x+Math.cos(angle)*rad,pz=z+Math.sin(angle)*rad;if(px<ROOM.x0+r||px>ROOM.x1-r||pz<ROOM.z0+r||pz>ROOM.z1-r||Math.abs(surfaceAt(px,pz)-height)>.1)continue;if(height>.7&&px>1.6&&px<2.0&&pz<-1.25)continue;const occupied=Object.values(items).some(other=>other!==it&&!other.held&&Math.abs(other.obj.position.y-height)<.3&&Math.hypot(other.obj.position.x-px,other.obj.position.z-pz)<Math.min(.45,other.r+r)+.025);if(!occupied){best=[px,pz];break;}}
  return {x:best[0],z:best[1],y:surfaceAt(...best)};}
 // ---------- particles, bolts, rings (same look as the chair room, scaled to metres) ----------
 const N=300,pPos=new Float32Array(N*3),pCol=new Float32Array(N*3),pVel=new Float32Array(N*3),pLife=new Float32Array(N),pMax=new Float32Array(N),pGrav=new Float32Array(N),pBase=new Float32Array(N*3);
 const pGeo=new T.BufferGeometry();pGeo.setAttribute('position',new T.BufferAttribute(pPos,3));pGeo.setAttribute('color',new T.BufferAttribute(pCol,3));
 const points=new T.Points(pGeo,new T.PointsMaterial({size:.05,vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));points.frustumCulled=false;scene.add(points);
 let pi=0;const col=new T.Color();
 function rawEmit(pos,vel,color,life,grav){const i=pi++%N;pPos.set([pos.x,pos.y,pos.z],i*3);pVel.set(vel,i*3);col.set(color);pBase.set([col.r,col.g,col.b],i*3);pLife[i]=pMax[i]=life*(.7+Math.random()*.6);pGrav[i]=grav;}
 const emit=(pos,v,color,life=.6,grav=1)=>rawEmit(pos,[v[0]*S,v[1]*S,v[2]*S],color,life,grav*S);
 function emitDir(from,v,color,life,grav,toward){const d=toward.clone().sub(from);const dist=d.length()||1;d.divideScalar(dist);const sp=(v[2]>0?v[2]:3)*S;rawEmit(from,[d.x*sp+(Math.random()-.5)*.25,d.y*sp+(v[1]||0)*S+(Math.random()-.5)*.2,d.z*sp+(Math.random()-.5)*.25],color,Math.min(life,dist/sp*1.05+.05),grav*S);}
 function burst(pos,n,color,speed,life){for(let i=0;i<n;i++){const a=Math.random()*6.283,b=Math.acos(Math.random()*2-1),s=speed*(.4+Math.random());emit(pos,[Math.sin(b)*Math.cos(a)*s,Math.cos(b)*s,Math.sin(b)*Math.sin(a)*s],color,life,1);}}
 function makeBolt(color){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(new Float32Array(14*3),3));const l=new T.Line(geo,new T.LineBasicMaterial({color,transparent:true,opacity:.95}));l.frustumCulled=false;l.visible=false;scene.add(l);return l;}
 const bolt1=makeBolt('#d8f6ff'),bolt2=makeBolt('#7fd0ff');
 function setBolt(l,a,b,on,j=.12){l.visible=!!(on&&a&&b);if(!l.visible)return;j*=S;const arr=l.geometry.attributes.position.array,n=14;for(let i=0;i<n;i++){const u=i/(n-1),m=Math.sin(u*Math.PI)*j*(i%2?1:-1)*(.4+Math.random());arr[i*3]=a.x+(b.x-a.x)*u+(Math.random()-.5)*m*2;arr[i*3+1]=a.y+(b.y-a.y)*u+(Math.random()-.5)*m*2;arr[i*3+2]=a.z+(b.z-a.z)*u+(Math.random()-.5)*m*2;}l.geometry.attributes.position.needsUpdate=true;}
 const rings=[];function ring(pos,color){const m=new T.Mesh(new T.RingGeometry(.8,1,32),new T.MeshBasicMaterial({color,transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}));m.position.copy(pos);m.userData={t:0};scene.add(m);rings.push(m);}
 let splash=0;

 // ---------- damage marks: scorch, dents, wet patches stay on his body (he can see them in the mirror) ----------
 const marks=[],markGeo=new T.SphereGeometry(1,8,6);const MARK={prod:['#141210',.06,'scorch mark'],torch:['#1a0f08',.08,'burn mark'],mallet:['#2e3438',.07,'dent'],drill:['#0c0c0c',.045,'drill hole'],squirt:['#3a6a8a',.07,'wet patch'],magnet:['#3a1a1a',.05,'warped plate'],chicken:null,feather:null};
 function addMark(toolId,nodeName,point){const m=MARK[toolId];if(!m)return null;const node=bot.targets[nodeName];if(!node)return null;
  const s=new T.Mesh(markGeo,new T.MeshBasicMaterial({color:m[0],transparent:true,opacity:.85}));node.add(s);node.worldToLocal(s.position.copy(point));s.scale.setScalar(m[1]*(.7+Math.random()*.6));marks.push({mesh:s,tool:toolId,kind:m[2],part:nodeName,t:performance.now()/1000,wet:toolId==='squirt'});
  while(marks.length>40){const o=marks.shift();o.mesh.removeFromParent();}return m[2];}

 // ---------- the tool arm: comes down from the ceiling hatch, only when the operator clicks ----------
 const rig=new Map();
 const armM=toon('#2c3338');const arm=new T.Mesh(cyl,armM);arm.visible=false;arm.castShadow=true;scene.add(arm);
 const elbowJ=new T.Mesh(sph,toon('#e8b020'));elbowJ.visible=false;scene.add(elbowJ);const arm2=new T.Mesh(cyl,armM);arm2.visible=false;scene.add(arm2);
 TOOLS.forEach(def=>{const t=buildTool(def.id,toon);t.g.visible=false;t.g.scale.setScalar(S*.4);t.g.position.copy(HATCH);scene.add(t.g);rig.set(def.id,{def,tool:t});});
 let active=null,nextJolt=0,lightLevel=0;const lightColor=new T.Color('#fff');
 const tip=new T.Vector3(),tpos=new T.Vector3(),aDir=new T.Vector3(),tmp=new T.Vector3(),dummy=new T.Object3D(),up=new T.Vector3(0,1,0),mid=new T.Vector3(),gripV=new T.Vector3(),elbowV=new T.Vector3();
 const ease=x=>x<0?0:x>1?1:x*x*(3-2*x);
 function strike(id,partName,point){
  if(active||cb.canStrike?.()===false)return false;const r=rig.get(id);if(!r)return false;const def=r.def;
  const name=partName&&bot.targets[partName]?partName:def.pref[Math.floor(Math.random()*def.pref.length)];
  const node=bot.targets[name];const local=point?node.worldToLocal(point.clone()):new T.Vector3();
  const side=new T.Vector3(Math.random()-.5,0,Math.random()-.5).normalize();
  active={r,id,name,node,local,side,t0:performance.now()/1000,dur:2.9,fired:{},nextSfx:0,cyclic:def.fx==='clang'||def.fx==='squeak',q0:r.tool.g.quaternion.clone()};
  r.tool.g.visible=true;arm.visible=arm2.visible=elbowJ.visible=true;hatchWant=1;cb.sfx('servo');return true;}
 function cancelStrike(){if(active){const r=active.r;r.tool.g.visible=false;r.tool.g.position.copy(HATCH);r.tool.g.scale.setScalar(S*.4);}active=null;arm.visible=arm2.visible=elbowJ.visible=false;setBolt(bolt1,null,null,false);setBolt(bolt2,null,null,false);hatchWant=0;lightLevel=0;}
 function ctxFor(a){return {tip,target:tpos,fired:a?a.fired:{},local:(o,x,y,z)=>o.localToWorld(new T.Vector3(x,y,z)),tipLocal:(o,x,y,z)=>o.localToWorld(new T.Vector3(x,y,z)),
  emit,emitDir,burst:(p,n,c,s,l)=>burst(p,n,c,s,l),ring,bolt:(a,b,on,j)=>setBolt(bolt1,a,b,on,j),bolt2:(a,b,on)=>setBolt(bolt2,a,b,on,.2),
  light:(c,i)=>{lightColor.set(c);lightLevel=Math.max(lightLevel,i*.25);},sfx:n=>cb.sfx(n),pull:()=>{if(a&&!a.fired.pull){a.fired.pull=true;bot.hit(a.name,.9,'magnet');bot.flash(.6);cb.impact(a.r.def,a.name,tpos.clone());}}};}
 function placeArm(m,a,b,r){mid.addVectors(a,b).multiplyScalar(.5);m.position.copy(mid);const len=a.distanceTo(b);m.scale.set(r,len,r);m.quaternion.setFromUnitVectors(up,tmp.copy(b).sub(a).normalize());}
 function updateActive(t){
  if(!active)return;const a=active,r=a.r,g=r.tool.g,def=r.def,el=t-a.t0;
  if(el>=a.dur){g.visible=false;g.position.copy(HATCH);g.scale.setScalar(S*.4);r.tool.tick(1.2,0,ctxFor(null));setBolt(bolt1,null,null,false);setBolt(bolt2,null,null,false);arm.visible=arm2.visible=elbowJ.visible=false;active=null;hatchWant=0;return;}
  const AP=.7,RT=.55;let k;
  if(el<AP)k=.25*(el/AP);else if(el<a.dur-RT){const w=el-AP;if(a.cyclic){const x=.25+.8*w,ph=x%.62;k=ph;const lap=Math.floor(x/.62);if(lap!==(a.lap||0)){a.lap=lap;a.fired.hit=false;a.fired.impact=false;}}else k=.5;}else k=.8+.2*((el-(a.dur-RT))/RT);
  tpos.copy(a.local);a.node.localToWorld(tpos);
  aDir.copy(HATCH).sub(tpos);aDir.y=Math.max(aDir.y,.4);aDir.normalize().multiplyScalar(.6).addScaledVector(a.side,.8).normalize();
  const A=tmp.copy(tpos).addScaledVector(aDir,.05);const e=ease(el/AP)*(1-ease((el-(a.dur-RT))/RT));
  dummy.position.copy(A);dummy.lookAt(tpos);
  g.position.lerpVectors(HATCH,A,e);g.quaternion.slerpQuaternions(a.q0,dummy.quaternion,e);g.scale.setScalar(S*(.4+.6*e));
  if(k>.25&&k<.8)g.position.addScaledVector(aDir,.015*Math.sin(t*30));
  g.updateMatrixWorld(true);tip.copy(g.position);
  // two-segment arm from the hatch to the back of the tool
  const grip=gripV.copy(g.position).addScaledVector(aDir,.32),elbow=elbowV.lerpVectors(HATCH,grip,.5);elbow.y+=.25;elbowJ.position.copy(elbow);elbowJ.scale.setScalar(.05);
  placeArm(arm,HATCH,elbow,.03);placeArm(arm2,elbow,grip,.025);
  r.tool.tick(k,t,ctxFor(a));
  if(!a.cyclic&&el>=AP*.6&&t>a.nextSfx){a.nextSfx=t+.95;cb.sfx(def.fx);}
  if(k>=.3&&!a.fired.hit){a.fired.hit=true;const kind=def.fx==='tickle'?'tickle':def.fx==='magnet'?'magnet':'shake';if(kind!=='magnet'){bot.hit(a.name,def.hit,kind);cb.impact(def,a.name,tpos.clone());}bot.flash(.8);if(a.cyclic)cb.sfx(def.fx);}
  if(k>.35&&k<.78&&t>nextJolt&&['zap','drill','tickle','flame'].includes(def.fx)){nextJolt=t+.17;bot.hit(a.name,def.fx==='tickle'?.25:.32,def.fx==='tickle'?'tickle':'shake');cb.jolt(def,a.name);}
 }

 // ---------- time of day + weather ----------
 const cTop=new T.Color(),cBot=new T.Color(),tmpC=new T.Color();
 const SKY={day:['#4f86d0','#b8d3ea'],dusk:['#2f3a72','#f08a4b'],night:['#03050c','#0d1426']};
 let lightsOn=true,rainLevel=0,flicker=0;
 function setTime(hours,weather){
  const a=(hours-6)/12*Math.PI,el=Math.sin(a);
  const sunDir=new T.Vector3(Math.cos(a),Math.max(-.3,el)*.85,-.55).normalize();
  const day=T.MathUtils.smoothstep(el,-.05,.35),dusk=Math.max(0,1-Math.abs(el-.05)/.25);
  cTop.set(SKY.night[0]).lerp(tmpC.set(SKY.day[0]),day).lerp(tmpC.set(SKY.dusk[0]),dusk*.6);cBot.set(SKY.night[1]).lerp(tmpC.set(SKY.day[1]),day).lerp(tmpC.set(SKY.dusk[1]),dusk*.8);
  rainLevel=weather==='rain'?1:0;if(rainLevel){cTop.lerp(tmpC.set('#4a5560'),.6*day);cBot.lerp(tmpC.set('#7c8790'),.6*day);}
  skyU.top.value.copy(cTop);skyU.bot.value.copy(cBot);skyU.sunDir.value.copy(sunDir);skyU.sunCol.value.set(el>0?(dusk>.3?'#ffb070':'#fff2d0'):'#000').multiplyScalar(rainLevel?.2:1);
  stars.material.opacity=Math.max(0,1-day*3)*(rainLevel?.1:.9);
  sun.position.copy(sun.target.position).addScaledVector(el>0?sunDir:new T.Vector3(-.3,.8,-.5).normalize(),20);
  sun.intensity=el>0?(2.8*day+1.2*dusk)*(rainLevel?.35:1):.35;sun.color.set(el>0?(dusk>.4?'#ffa860':'#fff4e0'):'#7f9cff');
  cityMat.emissiveIntensity=1-day;for(const l of fenceLamps)l.visible=day<.5;
  cloudMat.color.copy(cBot).lerp(tmpC.set('#ffffff'),day*.6);cloudMat.opacity=rainLevel?.95:.75;
  hemi.color.copy(cTop).lerp(tmpC.set('#8ea2b4'),.5);
  lightsOn=hours>=6.5&&hours<22.5;
 }
 // birds: fly across, sometimes land on the outer ledge
 function birdLand(){const b=birds.find(b=>b.userData.mode==='fly');if(!b)return false;b.userData.mode='landing';b.userData.t=0;b.userData.from=b.position.clone();return true;}
 function updateBirds(t,dt){for(const b of birds){const u=b.userData;u.t+=dt;const flap=Math.sin(t*18+u.speed)*.7;
  if(u.mode==='fly'){const x=-40+((u.t*u.speed)%80);b.position.set(x,u.y+Math.sin(u.t)*.5,u.z);b.rotation.set(0,-Math.PI/2,0);u.wl.rotation.z=0;u.wl.scale.y=1;u.wl.rotation.x=flap*.5;}
  else if(u.mode==='landing'){const k=Math.min(1,u.t/3),to=tmp.set(.25+Math.sin(u.speed)*.25,1.0,ROOM.z0-.36);b.position.lerpVectors(u.from,to,ease(k));b.position.y+=Math.sin(k*Math.PI)*1.5;u.wl.rotation.x=flap*.5;b.lookAt(to);if(k>=1){u.mode='perched';u.t=0;}}
  else if(u.mode==='perched'){u.wl.rotation.x=0;b.rotation.y=Math.PI/2+Math.sin(u.t*.7)*1.2;b.position.y=1.0+(Math.sin(u.t*5)>.95?.02:0);if(u.t>14+u.speed*3){u.mode='fly';u.t=Math.random()*10;}}
 }}
 const perchedBird=()=>birds.some(b=>b.userData.mode==='perched');

 // ---------- what is in his field of view ----------
 const frustum=new T.Frustum(),pm=new T.Matrix4(),v3=new T.Vector3();
 function visible(){canonicalPov(pov);pm.multiplyMatrices(pov.projectionMatrix,pov.matrixWorldInverse);frustum.setFromProjectionMatrix(pm);const out=[];
  const fwd=pov.getWorldDirection(new T.Vector3()),right=new T.Vector3().crossVectors(fwd,up).normalize();
  const test=(id,name,p,extra={})=>{if(!frustum.containsPoint(p))return;const d=p.distanceTo(pov.position);const rel=tmp.copy(p).sub(pov.position).normalize();const side=rel.dot(right);out.push({id,name,dist:d,where:side>.35?'right':side<-.35?'left':'ahead',up:rel.y>.45?'above':rel.y<-.55?'below':'',geometric:true,...extra});};
  for(const [id,f] of Object.entries(FEATURES))if(!id.startsWith('corner')&&id!=='center')test(id,f.name,v3.fromArray(f.look));
  // Geometric candidates are not a claim that pixels establish recognition or
  // that an intervening object cannot occlude them.
  for(const it of Object.values(items))if(!it.held&&it.obj.visible&&!it.state.broken){const p=it.obj.getWorldPosition(v3);test(it.id,it.name,p,{position:p.toArray(),support:supportAt(p,RECTS,CIRCLES)});}
  for(const b of birds)if(b.userData.mode!=='fly')test('bird','a small bird on the outer window ledge',b.position);
  if(active)test('tool_arm','the mechanical tool arm',tip);
  return out.sort((a,b)=>a.dist-b.dist);}

 // ---------- render: main view + POV inset, and grabbing what his eyes see as a JPEG for the model ----------
 const eye=new T.Vector3(0,.02,.52),hq=new T.Quaternion(),flip=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);
 const grab=document.createElement('canvas');grab.width=POV_CAPTURE_WIDTH;grab.height=POV_CAPTURE_HEIGHT;const gctx=grab.getContext('2d'),captures=createCaptureQueue();
 const captureTarget=new T.WebGLRenderTarget(POV_CAPTURE_WIDTH,POV_CAPTURE_HEIGHT);captureTarget.texture.colorSpace=T.SRGBColorSpace;
 const capturePixels=new Uint8Array(POV_CAPTURE_WIDTH*POV_CAPTURE_HEIGHT*4),captureImage=gctx.createImageData(POV_CAPTURE_WIDTH,POV_CAPTURE_HEIGHT);
 let povMain=false;const insetEl=cb.insetEl;
 function capture(options){return captures.request(options);}
 function captureFrame(){
  canonicalPov(pov);
  const previousTarget=renderer.getRenderTarget(),viewport=renderer.getViewport(new T.Vector4()),scissor=renderer.getScissor(new T.Vector4()),scissorTest=renderer.getScissorTest();
  try{
   renderer.setRenderTarget(captureTarget);renderer.setViewport(0,0,POV_CAPTURE_WIDTH,POV_CAPTURE_HEIGHT);renderer.setScissorTest(false);renderer.clear();renderer.render(scene,pov);
   renderer.readRenderTargetPixels(captureTarget,0,0,POV_CAPTURE_WIDTH,POV_CAPTURE_HEIGHT,capturePixels);
   const stride=POV_CAPTURE_WIDTH*4;
   for(let row=0;row<POV_CAPTURE_HEIGHT;row++)captureImage.data.set(capturePixels.subarray((POV_CAPTURE_HEIGHT-1-row)*stride,(POV_CAPTURE_HEIGHT-row)*stride),row*stride);
   gctx.putImageData(captureImage,0,0);return grab.toDataURL('image/jpeg',.86);
  }finally{renderer.setRenderTarget(previousTarget);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);}
 }
 function resize(){renderer.setSize(innerWidth,innerHeight);}
 addEventListener('resize',resize);
 function draw(cam,x,y,w,h){cam.aspect=w/h;cam.updateProjectionMatrix();renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.setScissorTest(true);renderer.clear();renderer.render(scene,cam);}
 let physicsPose=null,cameraDriver=null;
 function update(t,dt,speaking){
  bot.update(t,dt,speaking);physicsPose?.();
  updateActive(t);itemsUpdate(dt,t);debrisUpdate(dt);updateBirds(t,dt);
  hatchOpen+=(hatchWant-hatchOpen)*Math.min(1,dt*6);flapA.rotation.z=-hatchOpen*1.4;flapB.rotation.z=hatchOpen*1.4;hazard.material.opacity=hatchOpen*.35*(Math.sin(t*12)>0?1:.4);
  camLed.visible=Math.sin(t*3)>-.3;if(t-crt.last>.08){crt.last=t;crtDraw(t);}
  flicker=Math.max(0,flicker-dt);const flick=flicker>0&&Math.random()<.5?.15:1;
  const lit=lightsOn?1:.12;ceil.intensity=16*lit*flick;ceil.color.set(lightsOn?'#e6efff':'#6a7cff');panel.material.color.set(lightsOn&&flick===1?'#eef4ff':'#3a4050');fillL.intensity=1.2*lit;
  lightLevel*=Math.exp(-dt*12);fxLight.intensity=lightLevel+(active?.5:0);fxLight.color.copy(lightColor);fxLight.position.copy(active?tip:HATCH);
  for(const c of clouds){c.position.x+=dt*(rainLevel?1.2:.5);if(c.position.x>90)c.position.x=-90;}
  rainLines.visible=rainLevel>0;if(rainLevel){for(let i=0;i<RAIN;i++){let y=rainPos[i*6+1]-dt*14;if(y<-9)y+=15;rainPos[i*6+1]=y;rainPos[i*6+4]=y-.35;}rainGeo.attributes.position.needsUpdate=true;}
  if(splash>0){splash-=dt;for(let i=0;i<2;i++)rawEmit(new T.Vector3(.4+(Math.random()-.5)*.02,1.0,1.9),[(Math.random()-.5)*.1,-.5,-.2],'#9fd2f0',.5,.5);}
  for(let i=0;i<N;i++){if(pLife[i]>0){pLife[i]-=dt;pVel[i*3+1]-=9*pGrav[i]*dt;pPos[i*3]+=pVel[i*3]*dt;pPos[i*3+1]+=pVel[i*3+1]*dt;pPos[i*3+2]+=pVel[i*3+2]*dt;if(pPos[i*3+1]<.01){pPos[i*3+1]=.01;pVel[i*3+1]*=-.35;}const f=Math.max(0,pLife[i]/pMax[i]);pCol[i*3]=pBase[i*3]*f;pCol[i*3+1]=pBase[i*3+1]*f;pCol[i*3+2]=pBase[i*3+2]*f;}else{pCol[i*3]=pCol[i*3+1]=pCol[i*3+2]=0;}}
  pGeo.attributes.position.needsUpdate=true;pGeo.attributes.color.needsUpdate=true;
  for(let i=rings.length-1;i>=0;i--){const m=rings[i];m.userData.t+=dt;const u=m.userData.t/.45;m.scale.setScalar((.2+u*1.4)*S);m.material.opacity=Math.max(0,.9*(1-u));m.lookAt(camera.position);if(u>=1){scene.remove(m);m.geometry.dispose();m.material.dispose();rings.splice(i,1);}}
  for(const m of marks)if(m.wet&&t-m.t>40){m.mesh.visible=false;}
  // eyes: copy the head's world pose into the POV camera every frame (head jolts shake his view too)
  bot.root.updateMatrixWorld(true);bot.head.localToWorld(pov.position.copy(eye));bot.head.getWorldQuaternion(hq);pov.quaternion.copy(hq).multiply(flip);
  // orbit camera follows him, but never leaves the room
  if(cameraDriver)cameraDriver(camera,dt);else{const chest=bot.targetPos('chest',tmp);controls.target.lerp(chest,Math.min(1,dt*2.5));controls.update();}
  camera.position.x=T.MathUtils.clamp(camera.position.x,ROOM.x0+.1,ROOM.x1-.1);camera.position.y=T.MathUtils.clamp(camera.position.y,.25,ROOM.h-.1);camera.position.z=T.MathUtils.clamp(camera.position.z,ROOM.z0+.1,ROOM.z1-.1);
  renderer.shadowMap.needsUpdate=true;
  const W=renderer.domElement.clientWidth,H=renderer.domElement.clientHeight;
  if(captures.flush(captureFrame))renderer.shadowMap.needsUpdate=false;
  draw(povMain?pov:camera,0,0,W,H);renderer.shadowMap.needsUpdate=false;
  if(insetEl&&insetEl.getClientRects().length){const b=insetEl.getBoundingClientRect();draw(povMain?camera:pov,b.left,H-b.bottom,b.width,b.height);}
  renderer.setScissorTest(false);
 }
 // click on the unit with a tool armed -> strike there
 const ray=new T.Raycaster(),ndc=new T.Vector2();let down=null;
 const pointerDown=e=>{down={x:e.clientX,y:e.clientY};};
 const pointerUp=e=>{if(!down)return;const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;if(moved>6)return;
  ndc.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(ndc,povMain?pov:camera);const h=ray.intersectObjects(bot.pickables,false)[0];
  if(h)cb.clickBot(h.point.clone(),bot.nearestTarget(h.point));else cb.clickEmpty?.();};
 const insetClick=()=>{povMain=!povMain;cb.swapped?.(povMain);};
 renderer.domElement.addEventListener('pointerdown',pointerDown);
 renderer.domElement.addEventListener('pointerup',pointerUp);
 if(insetEl)insetEl.addEventListener('click',insetClick);
 function destroy(){
  captures.cancelAll();removeEventListener('resize',resize);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);insetEl?.removeEventListener('click',insetClick);controls.dispose?.();captureTarget.dispose();renderer.dispose();
 }
 return {scene,renderer,camera,pov,controls,bot,character,items,features:FEATURES,update,strike,cancelStrike,capture,visible,surfaceAt,pushItems,knockItems,addCreation,breakItem,repairItem,placeSpot,get debris(){return debris;},
  chalkDraw,chalkText,chalkSet,chalkPen,chalkErase,chalkExport,chalkImport,surfaceInfo,surfaceIds:Object.keys(SURF_DEF),get chalkDescription(){return chalkDescribe();},
  setTime,birdLand,perchedBird,addMark,marks,burst,ring,emit:rawEmit,setPose(fn){poseFn=fn;},
  photoSurfaces:()=>Object.values(surfaces).filter(sf=>sf.marks.length).map(sf=>({id:sf.id,name:sf.name,canvas:sf.cv,width:sf.W,height:sf.H,marks:sf.marks})),
  damageExport:()=>marks.filter(m=>m.mesh.visible&&!m.wet).map(m=>({tool:m.tool,part:m.part,local:m.mesh.position.toArray(),scale:m.mesh.scale.x})),
  damageImport(list){for(const m of list){const node=bot.targets[m.part];if(node&&MARK[m.tool]){addMark(m.tool,m.part,node.localToWorld(new T.Vector3(...m.local)));marks.at(-1).mesh.scale.setScalar(m.scale);}}},
  get busy(){return !!active;},get activeId(){return active?.id||null;},get toolTip(){return active?tip:null;},
  set splash(v){splash=v;},crt:{set:crtSet,feed:crtFeed,get mode(){return crt.mode;}},flicker(s=1.5){flicker=s;},get lightsOn(){return lightsOn;},
  plant:{get health(){return plantHealth;},water(){plantHealth=Math.min(1,plantHealth+.25);leafM.color.set('#6f8a3c').lerp(new T.Color('#4caf50'),plantHealth);for(const l of leaves)l.rotation.x=.9-plantHealth*.5;},touch(){for(const l of leaves)l.rotation.z+=(Math.random()-.5)*.4;}},
  get povMain(){return povMain;},set povMain(v){povMain=v;},
  setPhysicsPose(fn){physicsPose=fn;},setCameraDriver(fn){cameraDriver=fn;},destroy,
  setDoorOpen(amount){const a=T.MathUtils.clamp(amount,0,1)*1.4;doorG.rotation.y=-a;doorG.position.set(ROOM.x1-.035-Math.sin(a)*.46,0,.14+Math.cos(a)*.46);surfaces.door.plane.visible=amount<.01;},RECTS,CIRCLES};
}
