import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ACTION_ALIASES,SUPPORTED_ACTIONS,canonicalAction,isSupportedAction,ACTION_CATALOG_PROMPT} from '../src/cell/actions/catalog.js';
import {ACTION_STATUSES,actionResult} from '../src/cell/actions/result.js';
import {createActions} from '../src/cell/actions.js';
import {operatorCommand} from '../src/cell/commands.js';

const minimal=()=>{
 const world={items:{},features:{},bot:{head:new T.Object3D()},scene:new T.Scene()};
 const body={st:{x:0,z:0,heading:0},handPos:()=>new T.Vector3(),freeSpotNear:(x,z)=>[x,z],stop(){},clearGesture(){}};
 return createActions(world,body,{});
};

test('one action catalog canonicalizes prompt, command and dispatcher aliases',()=>{
 assert.equal(canonicalAction('go to'),'walk_to');
 assert.equal(canonicalAction('capture'),'snapshot');
 assert.equal(canonicalAction('wave'),'gesture');
 assert(isSupportedAction('walk_to'));
 assert(!isSupportedAction('teleport'));
 assert(ACTION_CATALOG_PROMPT.includes('walk_to'));
 assert(ACTION_CATALOG_PROMPT.includes('Unknown action names are unavailable'));
 assert.deepEqual(operatorCommand('please stand up'),[{do:'stand_up'}]);
 for(const name of Object.values(ACTION_ALIASES))assert(isSupportedAction(name),`${name} should resolve to a supported action`);
 assert(SUPPORTED_ACTIONS.length>10);
});

test('action result statuses are closed and unknown actions are truthful',async()=>{
 assert.deepEqual(ACTION_STATUSES,['completed','blocked','unavailable','cancelled','failed']);
 assert.throws(()=>actionResult('pretended','nope'),/Invalid action status/);
 const actions=minimal();
 const unknown=await actions.runResult({do:'teleport',target:'outside'},{cancelled:false});
 assert.equal(unknown.status,'unavailable');
 assert.match(unknown.text,/Unsupported action/);
 const missing=await actions.runResult({do:'walk_to',target:'moon'},{cancelled:false});
 assert.equal(missing.status,'unavailable');
 assert.match(missing.text,/don't know where/);
});

test('dispatcher reports snapshot target, 3D build and browser failures with explicit status',async()=>{
 const world={items:{},features:{},bot:{head:new T.Object3D()},scene:new T.Scene()};
 const body={st:{x:0,z:0,heading:0,posture:'sit'},handPos:()=>new T.Vector3(),freeSpotNear:(x,z)=>[x,z],stop(){},clearGesture(){},gesture(){}};
 const actions=createActions(world,body,{
   planning(){},
   creator:async()=>{throw Error('broken builder');},
   browser:async()=>({error:'browser blocked'}),
 });
 body.st.seat=actions.SEATS.stool;
 const token={cancelled:false,signal:new AbortController().signal};
 const missing=await actions.runResult({do:'snapshot',target:'nonexistent-object'},token);
 assert.equal(missing.status,'unavailable');
 const build=await actions.runResult({do:'create_3d',name:'test item'},token);
 assert.equal(build.status,'failed');
 assert.match(build.text,/broken builder/);
 const browser=await actions.runResult({do:'browser'},token);
 assert.equal(browser.status,'failed');
});

test('3D cancellation is never reported as a successful build',async()=>{
 const world={items:{},features:{},bot:{head:new T.Object3D()},scene:new T.Scene()};
 const body={st:{x:0,z:0,heading:0,posture:'sit'},handPos:()=>new T.Vector3(),freeSpotNear:(x,z)=>[x,z],stop(){},clearGesture(){},gesture(){}};
 const controller=new AbortController(),token={cancelled:false,signal:controller.signal};
 const actions=createActions(world,body,{
  planning(){},
  creator:async()=>{controller.abort();throw Error('creative response missing');},
 });
 body.st.seat=actions.SEATS.stool;
 const result=await actions.runResult({do:'create_3d',name:'cancelled'},token);
 assert.equal(result.status,'cancelled');
});
