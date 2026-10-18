import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ROOM,RECTS,CIRCLES,FEATURES,S} from '../src/cell/world.js';
import {createNavigation} from '../src/cell/navigation.js';
import {createBody} from '../src/cell/body.js';
import {createBot} from '../src/bot.js';
import {createActions} from '../src/cell/actions.js';
const nav=createNavigation(ROOM,RECTS,CIRCLES);
function rig(){let pose;const bot=createBot(c=>new T.MeshBasicMaterial({color:c}),{free:true});bot.root.scale.setScalar(S);const world={bot,RECTS,CIRCLES,features:FEATURES,items:{},setPose(fn){pose=fn;},pushItems(){}};const body=createBody(world,{sfx(){}});let t=0;const step=()=>{t+=1/60;bot.update(t,1/60,false);pose(t,1/60);bot.root.updateMatrixWorld(true);};return{body,world,step};}

test('actual room feature routes clear every swept segment from saved position and across room',()=>{
 const starts=[[.441871118,-1.73],[.42086,-1.5435],[0,.25],[-1.2,1.5],[2.1,1.5],[.2,-1.5]];let detours=0;
 for(const start of starts)for(const [name,f]of Object.entries(FEATURES)){const result=nav.route(start,f.stand);assert.equal(result.status,'moving',`${start} to ${name}: ${result.reason}`);let previous=start;if(result.path.length>1)detours++;for(const p of result.path){assert.ok(nav.segmentClear(previous,p),`${name}: swept segment`);previous=p;}assert.equal(nav.blocked(...result.goal),false);}
 assert.ok(detours>10,'routes actually go around furniture');
 assert.equal(nav.segmentClear([.7,-1.3],[1.01,-1.3]),false,'short leg cannot clip table');
 assert.equal(nav.segmentClear([1.1,-.72],[2.2,-.72]),false,'circular stool collision');
});

test('actual animated rig reaches room stands with finite moving limbs and cancellation stops it',()=>{
 const {body,step}=rig();let gait=false;
 for(const f of Object.values(FEATURES)){body.st.x=.441871118;body.st.z=-1.73;body.st.heading=Math.PI;assert.ok(body.walkTo(...f.stand));for(let i=0;i<1500&&!body.arrived;i++){step();assert.equal(body.blocked(body.st.x,body.st.z),false);gait ||= body.st.walkW>.5&&body.st.stepPhase>1;}assert.equal(body.navigation.status,'arrived',f.name);assert.ok(Math.hypot(body.st.x-body.navigation.goal[0],body.st.z-body.navigation.goal[1])<.001);}
 assert.ok(gait);body.walkTo(0,.2);for(let i=0;i<20;i++)step();body.stop();const p=[body.st.x,body.st.z];for(let i=0;i<150;i++)step();assert.deepEqual([body.st.x,body.st.z],p);assert.equal(body.navigation.status,'cancelled');
});

test('embedded standing and seated starts recover visibly before following clear route',()=>{
 const {body,step}=rig();body.st.x=1.75;body.st.z=-.72;assert.ok(body.walkTo(0,.2));assert.equal(body.navigation.recovering,true);assert.deepEqual([body.st.x,body.st.z],[1.75,-.72]);for(let i=0;i<600&&!body.arrived;i++)step();assert.equal(body.navigation.status,'arrived');body.st.x=1.75;body.st.z=-.72;body.setPosture('sit',{pos:[1.75,-.72],exit:[1.2,-.55],name:'stool'});assert.ok(body.walkTo(0,.2));let previous=[body.st.x,body.st.z];for(let i=0;i<600&&!body.arrived;i++){step();assert.ok(Math.hypot(body.st.x-previous[0],body.st.z-previous[1])<.08);previous=[body.st.x,body.st.z];}assert.equal(body.navigation.status,'arrived');
});

test('explicit turn clears stale look and compass names follow world coordinates',()=>{
 const {body,step}=rig();body.st.heading=0;body.lookAt(new T.Vector3(0,1,-2),20);body.face(Math.PI/2);for(let i=0;i<300;i++)step();assert.equal(body.describe().facing,'east');assert.ok(Math.abs(body.st.heading-Math.PI/2)<.03);body.st.heading=-Math.PI/2;assert.equal(body.describe().facing,'west');
});

test('walls and artwork resolve actual view position, and stalled action never claims arrival',async()=>{
 const {body,world}=rig();world.surfaceIds=['south_wall'];world.surfaceInfo=()=>({id:'south_wall',name:'south wall',W:5,normal:new T.Vector3(0,0,-1),point:(x,y)=>new T.Vector3(x/20-2.5,y/30,2),artworks:[{title:'The seven stages',bounds:[70,30,90,70]}]});const actions=createActions(world,body,{fear:()=>0});const wall=actions.resolve('south_wall'),art=actions.resolve('the seven stages');assert.equal(wall.kind,'surface');assert.equal(art.artwork,'The seven stages');assert.equal(art.look.x,1.5);assert.equal(body.blocked(...art.stand),false);
 body.st.x=0;body.st.z=.25;const job=actions.run({do:'walk_to',target:'window'});for(let t=1;t<80;t++){actions.tick(t);await Promise.resolve();}const result=await job;assert.match(result,/could not reach/);assert.match(result,/timed out/);assert.doesNotMatch(result,/You walk to/);assert.deepEqual([body.st.x,body.st.z],[0,.25]);
});

test('drawing names cannot override existing room features or the living bird',()=>{
 const {body,world}=rig();world.scene=new T.Scene();world.surfaceIds=['floor'];world.surfaceInfo=()=>({id:'floor',name:'floor',W:5,normal:new T.Vector3(0,1,0),point:()=>new T.Vector3(),artworks:[{title:'Bird table portrait',bounds:[20,20,60,60]}]});const actions=createActions(world,body,{});assert.equal(actions.resolve('bird').kind,'feature');assert.equal(actions.resolve('bird').id,'bird');assert.equal(actions.resolve('table').id,'table');assert.equal(actions.resolve('bird table portrait').kind,'surface');
});
