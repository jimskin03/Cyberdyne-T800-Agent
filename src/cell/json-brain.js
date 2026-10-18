import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CSS2DRenderer,CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';
import {networkLayout,evidenceTrace} from './memory-network.js';
import './json-brain.css';
const palette={timeline:0x71b9f5,personal:0xb897e6,knowledge:0xf0b961,everyday:0x83d5b2};
const regionNames={timeline:'Life timeline',personal:'Personal memories',knowledge:'Skills & world',everyday:'Everyday life'};
export function createJsonBrain({context='interview'}={}){
 const panel=document.createElement('aside');panel.className='json-brain';panel.dataset.context=context;panel.setAttribute('aria-label','Interactive JSON brain');
 panel.innerHTML='<div class="jb-heading"><b>JSON BRAIN</b><span class="jb-count"></span></div><div class="jb-status" role="status">Waiting for memory chip</div><div class="jb-viewport"></div><div class="jb-legend"></div><div class="jb-tools"><button aria-label="Pan neural network" aria-pressed="false">Pan</button><button aria-label="Zoom in neural network">+</button><button aria-label="Zoom out neural network">−</button><button aria-label="Reset neural network view">Reset view</button><button aria-label="Toggle neural detail" aria-pressed="false">High detail</button></div><div class="jb-help">Drag to rotate · right drag to pan · scroll into JSON</div><select aria-label="Inspect memory JSON"><option value="">Select a memory or pathway</option></select><div class="jb-tabs" hidden><button data-tab="json" class="chosen">JSON payload</button><button data-tab="trace">Path trace</button></div><pre class="jb-inspector" hidden></pre>';
 document.body.append(panel);
 const viewport=panel.querySelector('.jb-viewport'),status=panel.querySelector('.jb-status'),inspector=panel.querySelector('pre'),select=panel.querySelector('select'),tabs=panel.querySelector('.jb-tabs');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,1,.05,100);camera.position.set(-.4,.6,8.8);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));viewport.append(renderer.domElement);
 const labels=new CSS2DRenderer();labels.domElement.className='jb-labels';viewport.append(labels.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.8;controls.maxDistance=24;controls.target.set(0,-.3,0);
 const group=new THREE.Group();scene.add(group);
 const floor=new THREE.GridHelper(9,18,0x466779,0x243e50);floor.position.y=-3.65;floor.material.transparent=true;floor.material.opacity=.28;scene.add(floor);
 const back=new THREE.GridHelper(9,18,0x355767,0x1f3b4b);back.rotation.x=Math.PI/2;back.position.set(0,.3,-2.6);back.material.transparent=true;back.material.opacity=.18;scene.add(back);
 const box=new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-4,-3.65,-2.6),new THREE.Vector3(4,3,2.6)),0x335565);box.material.transparent=true;box.material.opacity=.35;scene.add(box);
 const axes=new THREE.AxesHelper(.55);axes.position.set(-3.65,-3.4,2.25);scene.add(axes);
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),highlight=new THREE.Color(0xd4fff0);
 let memory=null,unsubscribe=null,items=[],edges=[],trace=null,started=0,clock=0,selected=null,highDetail=context==='explorer',inspectorTab='json',points=null,pointColors=null,pointSizes=null,baseLines=null,activeLines=null,pulses=null,pulsePositions=null,activeEdges=[],labelObjects=[],labelTime=0;
 const nodeMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{scale:{value:300}},vertexShader:'attribute vec3 aColor; attribute float aSize; varying vec3 vColor; uniform float scale; void main(){vColor=aColor;vec4 p=modelViewMatrix*vec4(position,1.0);gl_PointSize=clamp(aSize*scale/-p.z,1.3,36.0);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 vColor; void main(){float r=length(gl_PointCoord-.5)*2.0;if(r>1.0)discard;float glow=pow(1.0-r,1.7);float core=1.0-smoothstep(.0,.3,r);gl_FragColor=vec4(vColor*(.55+core),glow*.85+core*.7);}'});
 function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;renderer.setSize(w,h);labels.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();nodeMaterial.uniforms.scale.value=h*renderer.getPixelRatio()/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));}
 const observer=new ResizeObserver(resize);observer.observe(viewport);resize();
 function clearGraph(){for(const l of labelObjects){l.element.remove();scene.remove(l);}labelObjects=[];group.traverse(o=>{o.geometry?.dispose();o.userData.texture?.dispose();if(o.material&&o.material!==nodeMaterial)o.material.dispose();});group.clear();items=[];edges=[];activeEdges=[];points=null;}
 function label(text,position,className='jb-node-label'){const element=document.createElement('div');element.className=className;element.textContent=text;const object=new CSS2DObject(element);object.position.fromArray(position);scene.add(object);labelObjects.push(object);return object;}
 function refreshInspector(){tabs.hidden=!selected;inspector.hidden=!selected;inspector.textContent=selected?(inspectorTab==='json'?JSON.stringify(selected.json,null,2):JSON.stringify({selected:selected.id,recall:trace?.query||null,paths:trace?.pathways?.map(p=>({id:p.id,from:p.from,activation:p.activation,route:p.route.map(n=>n.id)}))||[]},null,2)):'';panel.dispatchEvent(new CustomEvent('brain:selection',{detail:selected?{id:selected.id,json:selected.json,trace}:null}));}
 function inspect(id,focus=false){selected=items.find(n=>n.id===id)||null;select.value=selected?.id||'';refreshInspector();if(selected&&focus){const p=new THREE.Vector3(...selected.position);controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,.15,3.1));}labelTime=0;}
 function rebuildActivation(){
  if(!activeLines)return;const nodes=new Set(trace?.activated?.map(n=>n.id)||[]),paths=new Set(trace?.pathways?.map(p=>p.id)||[]);
  activeEdges=edges.filter(e=>e.type==='route'?paths.has(e.path)&&nodes.has(e.b)&&(nodes.has(e.a)||e.a===e.path):trace?.pathways?.some(p=>p.id===e.b&&p.from===e.a||p.id===e.a&&p.from===e.b));
  const positions=[];for(const e of activeEdges)for(let j=0;j<e.vertices.length-1;j++)positions.push(...e.vertices[j].toArray(),...e.vertices[j+1].toArray());
  activeLines.geometry.dispose();activeLines.geometry=new THREE.BufferGeometry();activeLines.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  pulses.geometry.dispose();pulsePositions=new Float32Array(Math.max(1,activeEdges.length)*3);pulses.geometry=new THREE.BufferGeometry();pulses.geometry.setAttribute('position',new THREE.BufferAttribute(pulsePositions,3));pulses.geometry.setDrawRange(0,activeEdges.length);
 }
 function activate(value,{at=clock,recorded=false}={}){trace=value;started=at;status.textContent=value?.pathways?.length?(recorded?'RECORDED RECALL':context==='explorer'?'MEMORY ACCESS':'LIVE RECALL')+' · '+value.pathways.map(p=>p.id).join(' → '):'Idle · pathways ready';rebuildActivation();refreshInspector();labelTime=0;}
 function setMemory(value,{subscribe=true}={}){
  unsubscribe?.();unsubscribe=null;clearGraph();memory=value;selected=null;inspector.hidden=true;tabs.hidden=true;select.replaceChildren(new Option('Select a memory or pathway',''));trace=null;
  if(!memory){status.textContent='Waiting for memory chip';return;}
  const layout=networkLayout(memory.graph);items=layout.items.map((n,index)=>({...n,index,jsonString:JSON.stringify(n.json),color:new THREE.Color(palette[n.region]),size:n.type==='pathway'?.135:.075}));
  const lookup=new Map(items.map(n=>[n.id,n]));panel.querySelector('.jb-count').textContent=memory.graph.nodes.length+' memories / '+memory.graph.pathways.length+' paths';
  const positions=new Float32Array(items.length*3);pointColors=new Float32Array(items.length*3);pointSizes=new Float32Array(items.length);
  for(const n of items){positions.set(n.position,n.index*3);n.color.toArray(pointColors,n.index*3);pointSizes[n.index]=n.size;select.append(new Option(n.id+' · '+(n.json.label||n.json.fact),n.id));}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aColor',new THREE.BufferAttribute(pointColors,3));geometry.setAttribute('aSize',new THREE.BufferAttribute(pointSizes,1));points=new THREE.Points(geometry,nodeMaterial);group.add(points);
  const linePositions=[],lineColors=[];
  for(const edge of layout.edges){const a=lookup.get(edge.a),b=lookup.get(edge.b);if(!a||!b)continue;const av=new THREE.Vector3(...a.position),bv=new THREE.Vector3(...b.position),mid=av.clone().lerp(bv,.5);mid.z+=Math.min(.28,av.distanceTo(bv)*.07);const curve=new THREE.QuadraticBezierCurve3(av,mid,bv),vertices=curve.getPoints(5),color=a.color.clone().lerp(b.color,.5).multiplyScalar(.65);edges.push({...edge,curve,vertices});for(let j=0;j<vertices.length-1;j++){linePositions.push(...vertices[j].toArray(),...vertices[j+1].toArray());lineColors.push(...color.toArray(),...color.toArray());}}
  const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(linePositions,3));lineGeometry.setAttribute('color',new THREE.Float32BufferAttribute(lineColors,3));baseLines=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.13,depthWrite:false,blending:THREE.AdditiveBlending}));group.add(baseLines);
  activeLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xf8d28b,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));group.add(activeLines);
  const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(16,16,0,16,16,16);gradient.addColorStop(0,'#fff');gradient.addColorStop(.15,'#fff');gradient.addColorStop(1,'#fff0');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);const texture=new THREE.CanvasTexture(c);
  pulses=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xffdfa2,size:.19,map:texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));pulses.userData.texture=texture;pulses.frustumCulled=false;group.add(pulses);
  const legend=panel.querySelector('.jb-legend');legend.replaceChildren();for(const [key,name] of Object.entries(regionNames)){const span=document.createElement('span');span.style.setProperty('--region','#'+palette[key].toString(16));span.textContent=name;legend.append(span);}
  for(let i=0;i<4;i++)label('',[0,0,0],'jb-node-label json');
  activate(null);if(subscribe)unsubscribe=memory.subscribe(value=>activate(value,{at:performance.now()/1000}));
 }
 function update(time){
  clock=time;controls.update();if(!points){renderer.render(scene,camera);return;}
  let age=Math.max(0,time-started);if(context==='cell'&&trace&&age>=7)activate(null);
  const alive=!!trace,active=new Set(alive?trace.activated.map(n=>n.id):[]),paths=new Set(alive?trace.pathways.map(p=>p.id):[]),distance=camera.position.distanceTo(controls.target),close=distance<6.8;
  for(const n of items){const on=active.has(n.id)||paths.has(n.id),chosen=n===selected;n.color.toArray(pointColors,n.index*3);if(on)highlight.toArray(pointColors,n.index*3);pointSizes[n.index]=n.size*(chosen?3.5:on?2.4+.3*Math.sin(age*4):highDetail?1.2:1);}
  points.geometry.attributes.aColor.needsUpdate=true;points.geometry.attributes.aSize.needsUpdate=true;baseLines.material.opacity=highDetail?.16:close?.1:.065;
  activeLines.visible=pulses.visible=alive;for(let i=0;i<activeEdges.length;i++){const p=activeEdges[i].curve.getPoint((age*.28+i*.097)%1);p.toArray(pulsePositions,i*3);}if(pulses.geometry.attributes.position)pulses.geometry.attributes.position.needsUpdate=true;
  if(time-labelTime>.15||labelTime===0){labelTime=time;
   const near=items.map(n=>({n,projected:new THREE.Vector3(...n.position).project(camera),distance:camera.position.distanceTo(new THREE.Vector3(...n.position))})).filter(x=>Math.abs(x.projected.x)<.85&&Math.abs(x.projected.y)<.85&&x.projected.z<1).sort((a,b)=>a.distance-b.distance).slice(0,3).map(x=>x.n);
   const visible=close?[...(selected?[selected]:[]),...near.filter(n=>n!==selected)].slice(0,3):selected?[selected]:[];
   labelObjects.forEach((l,i)=>{const n=visible[i];l.visible=!!n;if(n){l.position.fromArray(n.position);l.element.textContent=close?n.jsonString:n.json.label||n.id;l.element.className='jb-node-label '+(close?'json':'')+(active.has(n.id)||paths.has(n.id)?' active':'');}});
  }
  renderer.render(scene,camera);labels.render(scene,camera);
 }
 let down=null;renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});renderer.domElement.addEventListener('pointerup',e=>{if(!points||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.params.Points.threshold=Math.max(.06,camera.position.distanceTo(controls.target)*.009);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(points)[0];if(hit)inspect(items[hit.index].id,true);});
 select.onchange=()=>inspect(select.value,true);
 const [pan,plus,minus,reset,detail]=panel.querySelector('.jb-tools').querySelectorAll('button');pan.onclick=()=>{const on=pan.getAttribute('aria-pressed')!=='true';pan.setAttribute('aria-pressed',String(on));controls.mouseButtons.LEFT=on?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;};
 plus.onclick=()=>camera.position.sub(controls.target).multiplyScalar(.75).add(controls.target);minus.onclick=()=>camera.position.sub(controls.target).multiplyScalar(1.3).add(controls.target);reset.onclick=()=>{camera.position.set(-.4,.6,8.8);controls.target.set(0,-.3,0);labelTime=0;};detail.setAttribute('aria-pressed',String(highDetail));detail.onclick=()=>{highDetail=!highDetail;detail.setAttribute('aria-pressed',String(highDetail));};
 for(const button of tabs.querySelectorAll('button'))button.onclick=()=>{inspectorTab=button.dataset.tab;tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('chosen',b===button));refreshInspector();};
 return {panel,setMemory,activate,inspect,showEvidence(ids,options){activate(memory?evidenceTrace(memory.graph,ids):null,options);},update,get trace(){return trace;},dispose(){unsubscribe?.();observer.disconnect();pulses?.userData.texture?.dispose();clearGraph();controls.dispose();nodeMaterial.dispose();renderer.dispose();panel.remove();}};
}
