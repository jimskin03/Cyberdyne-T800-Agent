import test from 'node:test';
import assert from 'node:assert/strict';
import {stepClimate} from '../src/cell/climate-state.js';
test('cooling is gradual, wet metal feels colder, and drying continues after water stops',()=>{
 const dry={temp:22,target:5,enabled:true,wet:0},wet={...dry,wet:1};
 stepClimate(dry,1);assert.ok(dry.temp<22&&dry.temp>20);
 for(let i=0;i<60;i++){stepClimate(dry,1);stepClimate(wet,1);}
 assert.ok(wet.cold>dry.cold);assert.ok(wet.wet>0&&wet.wet<1);
 const prior=wet.wet;stepClimate(wet,1,{wetting:true});assert.ok(wet.wet>prior);
 wet.enabled=false;const temp=wet.temp;stepClimate(wet,1);assert.ok(wet.temp>temp);
});
test('paid peace immediately clears cold and sets a comfortable target',()=>{
 const s={temp:5,target:5,enabled:true,wet:1,cold:1};stepClimate(s,.1,{peace:true,wetting:true});
 assert.equal(s.temp,22);assert.equal(s.target,22);assert.equal(s.cold,0);assert.ok(s.wet<1);
});
