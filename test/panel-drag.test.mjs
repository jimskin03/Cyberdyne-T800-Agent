import test from 'node:test';
import assert from 'node:assert/strict';
import {clampPanelPosition} from '../src/cell/panel-drag.js';

test('dragged panel keeps a margin at every viewport edge',()=>{
 assert.deepEqual(clampPanelPosition(-100,-100,330,500,1440,1000),{x:12,y:12});
 assert.deepEqual(clampPanelPosition(2000,2000,330,500,1440,1000),{x:1098,y:488});
 assert.deepEqual(clampPanelPosition(400,200,330,500,1440,1000),{x:400,y:200});
});

test('viewport shrink brings a moved panel back into reach',()=>{
 assert.deepEqual(clampPanelPosition(1098,488,330,500,900,600),{x:558,y:88});
});

test('an oversized panel retains a reachable header for scrolling',()=>{
 assert.deepEqual(clampPanelPosition(500,500,1000,1000,900,600),{x:12,y:12});
});
