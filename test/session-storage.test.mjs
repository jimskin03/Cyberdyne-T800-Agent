import test from 'node:test';
import assert from 'node:assert/strict';
import {resetSessionStorage,restoreSessionStorage,hasSessionBackup} from '../src/cell/session-storage.js';
test('session reset clears memory and connection preference, remains undoable, and isolates other projects',()=>{
 const map=new Map([['cell-public-cell.v1','private journal'],['cell-public-ai.enabled','true'],['cell-public-cell.computer.v1','private notes'],['other-project','untouched']]);
 const storage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 resetSessionStorage(storage);assert.equal(storage.getItem('cell-public-cell.v1'),null);assert.equal(storage.getItem('cell-public-ai.enabled'),null);assert.equal(storage.getItem('other-project'),'untouched');assert(hasSessionBackup(storage));
 storage.setItem('cell-public-cell.v1','new session');assert(restoreSessionStorage(storage));assert.equal(storage.getItem('cell-public-cell.v1'),'private journal');assert.equal(storage.getItem('cell-public-cell.computer.v1'),'private notes');assert.equal(storage.getItem('other-project'),'untouched');assert(!hasSessionBackup(storage));
});
