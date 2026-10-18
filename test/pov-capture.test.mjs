import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createCaptureQueue,canonicalPov,supportAt,RECTS,CIRCLES,POV_CAPTURE_WIDTH,POV_CAPTURE_HEIGHT} from '../src/cell/world.js';

test('concurrent capture callers share one frame and none are overwritten',async()=>{
 const queue=createCaptureQueue(),first=queue.request(),second=queue.request();let renders=0;
 assert.equal(queue.pending,2);
 queue.flush(()=>{renders++;return 'data:image/jpeg;base64,current-frame';});
 assert.deepEqual(await Promise.all([first,second]),['data:image/jpeg;base64,current-frame','data:image/jpeg;base64,current-frame']);
 assert.equal(renders,1);assert.equal(queue.pending,0);
 assert.equal(queue.flush(()=>{throw Error('No pending render expected');}),false);
});

test('aborted captures reject promptly while another observer still receives its frame',async()=>{
 const queue=createCaptureQueue(),controller=new AbortController();
 const cancelled=queue.request({signal:controller.signal}),failure=assert.rejects(cancelled,{name:'AbortError'}),survivor=queue.request();
 controller.abort();await failure;assert.equal(queue.pending,1);
 queue.flush(()=>'surviving frame');assert.equal(await survivor,'surviving frame');
});

test('pre-cancelled captures never enter queue, and completed callers detach cancellation',async()=>{
 const queue=createCaptureQueue(),before=new AbortController(),after=new AbortController();before.abort();
 await assert.rejects(queue.request(before.signal),{name:'AbortError'});assert.equal(queue.pending,0);
 const completed=queue.request({signal:after.signal});queue.flush(()=>'completed');after.abort();
 assert.equal(await completed,'completed');assert.equal(queue.pending,0);
});

test('render failure rejects all current callers and later captures can recover',async()=>{
 const queue=createCaptureQueue(),first=queue.request(),second=queue.request();
 const failures=[assert.rejects(first,/render failed/),assert.rejects(second,/render failed/)];
 queue.flush(()=>{throw Error('render failed');});await Promise.all(failures);
 const later=queue.request();queue.flush(()=>'recovered');assert.equal(await later,'recovered');
});

test('destroying a capture queue rejects every pending observer',async()=>{
 const queue=createCaptureQueue(),first=queue.request(),second=queue.request();
 const failures=[assert.rejects(first,{name:'AbortError'}),assert.rejects(second,{name:'AbortError'})];
 queue.cancelAll();await Promise.all(failures);assert.equal(queue.pending,0);
});

test('canonical perception projection restores object visibility after narrow inset rendering',()=>{
 const camera=new T.PerspectiveCamera(80,.25,.03,220),point=new T.Vector3(1.5,0,-2),projection=new T.Matrix4(),frustum=new T.Frustum();
 const sees=()=>{camera.updateMatrixWorld(true);projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);return frustum.containsPoint(point);};
 assert.equal(sees(),false);canonicalPov(camera);assert.equal(sees(),true);
 camera.aspect=3;camera.updateProjectionMatrix();canonicalPov(camera);assert.equal(sees(),true);
 assert.equal(camera.aspect,16/9);assert(POV_CAPTURE_WIDTH>=1280&&POV_CAPTURE_HEIGHT>=720);
});

test('support metadata tracks dynamic placement rather than original item home',()=>{
 const cube=new T.Vector3(-2,.505,-.55);assert.equal(supportAt(cube,RECTS,CIRCLES),'bed');
 cube.set(1.45,.79,-1.22);assert.equal(supportAt(cube,RECTS,CIRCLES),'table');
 cube.set(.2,.035,.4);assert.equal(supportAt(cube,RECTS,CIRCLES),'floor');
 cube.set(-2,1.7,-.55);assert.equal(supportAt(cube,RECTS,CIRCLES),null);
});
