import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM,FEATURES,RECTS,CIRCLES,S} from '../src/cell/world/definition.js';
import {ROOM as facadeRoom,FEATURES as facadeFeatures} from '../src/cell/world.js';

test('renderer-free world definition preserves stable room ids and navigation geometry',()=>{
 assert.deepEqual(ROOM,{x0:-2.5,x1:2.5,z0:-2,z1:2,h:3});
 assert.equal(S,.38);
 assert.deepEqual(Object.keys(FEATURES),['window','door','bed','table','computer','stool','sink','mirror','chalk_wall','plant','hatch','camera','drain','center','corner_se','corner_sw']);
 assert.equal(RECTS.find(r=>r.id==='bed').h,.47);
 assert.equal(CIRCLES.find(c=>c.id==='stool').r,.2);
 assert.equal(facadeRoom,ROOM);
 assert.equal(facadeFeatures,FEATURES);
});
