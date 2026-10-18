import {validateCreation} from './creation-model.js';
export function buildCreation(code){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./creation-worker.js',import.meta.url),{type:'module'});
 const finish=(error,value)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(Error('3D builder exceeded its 3 second execution limit')),3000);
 worker.onerror=e=>finish(Error(e.message||'3D builder failed'));
 worker.onmessage=({data})=>{try{if(data.error)throw Error(data.error);const object=validateCreation(data.json);finish(null,{object,json:data.json});}catch(e){finish(e);}};
 worker.postMessage({code});
});}
