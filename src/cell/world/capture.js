export const POV_CAPTURE_WIDTH=1280;
export const POV_CAPTURE_HEIGHT=720;

export function canonicalPov(camera){
 camera.aspect=POV_CAPTURE_WIDTH/POV_CAPTURE_HEIGHT;
 camera.updateProjectionMatrix();
 camera.updateMatrixWorld(true);
 return camera;
}

// All callers waiting for the next frame receive that frame. A cancelled caller
// is removed without cancelling another observer's request.
export function createCaptureQueue(){
 const waiting=new Set();
 function request(options={}){
  const signal=options?.signal||(typeof options?.aborted==='boolean'?options:null);
  return new Promise((resolve,reject)=>{
   const entry={resolve,reject,signal,abort:null};
   const cancel=()=>{waiting.delete(entry);signal?.removeEventListener('abort',entry.abort);reject(signal?.reason??new DOMException('Capture cancelled.','AbortError'));};
   entry.abort=cancel;
   if(signal?.aborted){cancel();return;}
   waiting.add(entry);signal?.addEventListener('abort',cancel,{once:true});
  });
 }
 function flush(render){
  if(!waiting.size)return false;
  const batch=[...waiting];waiting.clear();
  for(const entry of batch)entry.signal?.removeEventListener('abort',entry.abort);
  try{const frame=render();for(const entry of batch)entry.resolve(frame);}
  catch(error){for(const entry of batch)entry.reject(error);}
  return true;
 }
 function cancelAll(reason=new DOMException('Capture queue destroyed.','AbortError')){
  for(const entry of [...waiting]){waiting.delete(entry);entry.signal?.removeEventListener('abort',entry.abort);entry.reject(reason);}
 }
 return {request,flush,cancelAll,get pending(){return waiting.size;}};
}
