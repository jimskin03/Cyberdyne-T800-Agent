import * as THREE from 'three';
// Generated builders run off the render thread and cannot use browser I/O.
for(const key of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','Worker','SharedWorker'])Object.defineProperty(globalThis,key,{value:undefined,writable:false,configurable:false});
self.onmessage=({data})=>{try{
 if(typeof data.code!=='string'||data.code.length>35000||/\b(import|fetch|XMLHttpRequest|WebSocket|globalThis|self|navigator|location|postMessage|constructor|eval|Function)\b/.test(data.code))throw Error('Builder must only construct procedural Three.js meshes');
 const model=new Function('THREE', '"use strict";\n'+data.code)(THREE);
 if(!model?.isObject3D)throw Error('Builder did not return a Three.js object');
 self.postMessage({json:model.toJSON()});
 }catch(e){self.postMessage({error:e.message});}};
