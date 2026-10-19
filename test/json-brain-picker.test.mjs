import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPickerItems,pickerItemHaystack,pickerItemLabel} from '../src/cell/json-brain-picker.js';

const family={id:'family',type:'pathway',json:{label:'Home and family',cues:['home','parents'],domain:'family'}};
const m001={id:'m001',type:'memory',json:{fact:'Mother Elena and father David raised me; early years survive as family stories.',domain:'family'}};
const m006={id:'m006',type:'memory',json:{fact:'Mum pushed me on a park swing; I wanted the afternoon to last.',domain:'park'}};
const park={id:'park',type:'pathway',json:{label:'Park and play',cues:['park','swing']}};
const items=[family,m001,m006,park];

test('picker labels match the select option format',()=>{
 assert.equal(pickerItemLabel(m001),'m001 · Mother Elena and father David raised me; early years survive as family stories.');
 assert.equal(pickerItemLabel(family),'family · Home and family');
});

test('empty query keeps the full list',()=>{
 assert.deepEqual(filterPickerItems(items,''),items);
 assert.deepEqual(filterPickerItems(items,'   '),items);
 assert.deepEqual(filterPickerItems(items,null),items);
});

test('search matches id, domain/category, label and memory text case-insensitively',()=>{
 assert.deepEqual(filterPickerItems(items,'M001'),[m001]);
 assert.deepEqual(filterPickerItems(items,'HOME AND'),[family]);
 assert.deepEqual(filterPickerItems(items,'elena'),[m001]);
 assert.deepEqual(filterPickerItems(items,'park'),[m006,park]);
 assert.ok(pickerItemHaystack(m001).includes('family'));
 assert.ok(pickerItemHaystack(family).includes('parents'));
});

test('no matches returns an empty list for the empty state',()=>{
 assert.deepEqual(filterPickerItems(items,'zzz-no-such'),[]);
});
