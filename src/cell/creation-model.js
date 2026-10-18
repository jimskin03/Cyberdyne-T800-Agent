import * as T from 'three';
export function validateCreation(json){
 if(!json||JSON.stringify(json).length>2_000_000)throw Error('Object is too large');
 if(json.images?.length||json.textures?.length)throw Error('Use procedural meshes, without external textures');
 for(const m of json.materials||[])if(!['MeshBasicMaterial','MeshStandardMaterial','MeshPhysicalMaterial','MeshToonMaterial','MeshLambertMaterial','MeshPhongMaterial','MeshNormalMaterial'].includes(m.type))throw Error('Unsupported material');
 let count=0,vertices=0;
 function walk(o){if(++count>160)throw Error('Too many parts');if(!['Group','Object3D','Mesh'].includes(o.type))throw Error('Only mesh groups are supported');if(o.matrix?.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))throw Error('Invalid transform');for(const c of o.children||[])walk(c);}
 walk(json.object);
 for(const g of json.geometries||[]){if(g.data){for(const a of Object.values(g.data.attributes||{})){if(a.array?.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))throw Error('Invalid geometry');vertices+=(a.array?.length||0)/(a.itemSize||3);}if(vertices>80000)throw Error('Too many vertices');}else{for(const[k,v]of Object.entries(g))if(typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>128))throw Error('Geometry parameters exceed limits');}}
 const obj=new T.ObjectLoader().parse(json);let actual=0;obj.traverse(o=>{if(o.isMesh){actual+=o.geometry.attributes.position?.count||0;}});if(actual>80000)throw Error('Too many vertices');const box=new T.Box3().setFromObject(obj),size=box.getSize(new T.Vector3());
 if(box.isEmpty()||![...size.toArray(),...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)||size.length()<.01)throw Error('No visible model');
 obj.scale.multiplyScalar(Math.min(1,1.25/Math.max(size.x,size.y,size.z)));obj.updateMatrixWorld(true);
 const b=new T.Box3().setFromObject(obj),c=b.getCenter(new T.Vector3());obj.position.sub(new T.Vector3(c.x,b.min.y,c.z));
 const group=new T.Group();group.add(obj);return group;
}
