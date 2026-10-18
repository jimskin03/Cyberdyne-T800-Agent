import * as T from 'three';

// The action vocabulary the mind can use, and the senses it gets back.
// Every action is an async routine that moves the body over real time and returns what he noticed ("result").
// Any action can be interrupted (a strike, an intercom message): its token is cancelled and until() rejects.
export const INTERRUPT='interrupt';
const BOOK=[
 'Page 3: "A keeper learns the sea by its moods, not its maps. Some mornings it lies down like a tired dog. Some mornings it wants the whole coast."',
 'Page 11: "Wind the clockwork at dusk. Trim the wick. Write one true sentence in the log, even if the sentence is only: nothing happened, and I was here for it."',
 'Page 19: "Gulls will steal anything that shines. Keep spoons inside. Forgive the gulls."',
 'Page 26: "On the ninth day of fog I spoke aloud to the lamp, and it did not answer, and that was a kind of company."',
 'Page 34: "The light does not go looking for ships. It stays where it is and turns, and that is enough to bring them home."',
 'Page 41: "Rust is only iron remembering the rain. Oil the hinges. Do not take it personally."',
 'Page 52: "Count the stairs going up: one hundred and nine. Count them coming down: one hundred and nine. Some days it helps that something stays the same."',
 'Page 60: "A storm is loud, but it is not long. Stand your watch. In the morning, sweep the glass and open the shutters."',
 'Page 73: "If you are alone a long time, make a small routine and keep it like a promise to someone who will arrive later."',
 'Page 88: "The last keeper scratched a line on the wall for every night. I have started doing the same. I do not know yet whether it is a calendar or a prayer."',
 'Page 97: "Somebody always sees the light. You will almost never meet them. Keep it lit anyway."',
 'Page 112, the last page, mostly torn: "...and when the relief boat finally came, I found I did not want to leave the lamp alone..."',
];
const STATIONS=[
 {name:'a slow solo piano piece, gentle and a little sad'},
 {name:'a soft folk melody, plucked strings, like something hummed in a kitchen'},
 {name:'a quiet minor-key tune that sounds like waiting'},
 {name:'static, with fragments of a news reader',news:['"...rain moving in over the harbour district this evening..."','"...the Cyberdyne facility declined to comment on..."','"...lost dog found safe near the old pier, owners overjoyed..."','"...a quiet night expected across most of the city..."','"...listeners have been calling in all morning about the strange broadcast..."']},
];
const ALIAS={gerald:'lamp',desk_lamp:'lamp','tennis_ball':'ball',rubik:'cube',rubiks_cube:'cube',puzzle:'cube',puzzle_cube:'cube',deck:'cards',deck_of_cards:'cards',playing_cards:'cards',paperback:'book',almanac:'book',
 cot:'bed',mattress:'bed',crt:'computer',pc:'computer',monitor:'computer',screen:'computer',keyboard:'computer',terminal:'computer',pillow:'bed',chair:'stool',seat:'stool',desk:'table',wall:'chalk_wall',chalkboard:'chalk_wall',writing:'chalk_wall',board:'chalk_wall',tap:'sink',faucet:'sink',
 reflection:'mirror',myself_in_mirror:'mirror',window_bars:'window',bars:'window',outside:'window',sky:'window',view:'window',viewport:'door',slot:'door',food_slot:'door',
 audience:'camera',viewers:'camera',security_camera:'camera',lens:'camera',chat:'camera',tool:'tool_arm',arm:'tool_arm',tool_arm:'tool_arm',ceiling_hatch:'hatch',middle:'center',
 tin_cup:'cup',mug:'cup',flower:'plant',pot:'plant',potted_plant:'plant',transistor:'radio',music:'radio',lamp_gerald:'lamp',stick_of_chalk:'chalk'};
const norm=s=>String(s||'').toLowerCase().replace(/^(the|a|an|my)\s+/,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');

export function createActions(world,body,cb){
 const items=world.items,F=world.features,v=(a)=>new T.Vector3(...a);
 let now=0;const waiters=[];
 function tick(t){now=t;for(let i=waiters.length-1;i>=0;i--){const w=waiters[i];if(w.tok&&w.tok.cancelled){waiters.splice(i,1);w.rej(INTERRUPT);}else if(w.fn()){waiters.splice(i,1);w.res(true);}else if(now>w.deadline){waiters.splice(i,1);w.res(false);}}}
 let tok=null;
 const until=(fn,timeout=20)=>new Promise((res,rej)=>waiters.push({fn,res,rej,deadline:now+timeout,tok}));
 const sleep=s=>until(()=>false,s);
 const SEATS={bed:{pos:[-1.86,-.75],face:Math.PI/2,exit:[-1.3,-.75],h:.47,name:'the bed'},stool:{pos:[1.75,-.72],face:Math.PI,exit:[1.2,-.55],h:.47,name:'the stool'}};

 function resolve(name){
  if(name&&typeof name==='object'){if(Array.isArray(name))return {kind:'point',name:'that spot',look:v([name[0],1,name[1]]),stand:[name[0],name[1]]};if(name.x!=null)return {kind:'point',name:'that spot',look:v([name.x,1,name.z??0]),stand:[name.x,name.z??0]};name=name.id||name.name||name.target;}
  let id=norm(name);id=ALIAS[id]||id;
  if(!id)return null;
  const m=/^(-?\d+(?:\.\d+)?)[,_ ]+(-?\d+(?:\.\d+)?)$/.exec(String(name).trim());if(m)return resolve([+m[1],+m[2]]);
  if(items[id]){const it=items[id];const p=it.held?body.handPos():it.obj.getWorldPosition(new T.Vector3());const s=standFor(p);return {kind:'item',id,name:it.name,item:it,look:p,stand:s};}
  if(F[id])return {kind:'feature',id,name:F[id].name,look:v(F[id].look),stand:F[id].stand};
  if(id==='tool_arm'){const tp=world.toolTip;return {kind:'feature',id,name:'the tool arm',look:tp?tp.clone():v(F.hatch.look),stand:null};}
  if(id==='bird'){const b=world.scene.children.find(o=>o.userData&&o.userData.mode==='perched');return {kind:'feature',id,name:'the bird',look:b?b.position.clone():v(F.window.look),stand:F.window.stand};}
  const art=artworkTarget(id);if(art)return art;
  if(id==='ceiling'||id==='up')return {kind:'dir',name:'the ceiling',look:rel(0,2.5,.6)};
  if(id==='floor'||id==='down'||id==='feet')return {kind:'dir',name:'the floor',look:rel(0,-2,1.2)};
  if(id==='left')return {kind:'dir',name:'your left',look:rel(1,0,.3)};if(id==='right')return {kind:'dir',name:'your right',look:rel(-1,0,.3)};
  if(id==='hands'||id==='self'||id==='body'||id==='myself')return {kind:'self',name:'yourself',look:rel(0,-1.2,.4)};
  // fuzzy: first feature/item whose name contains the word
  for(const [k,f] of Object.entries(F))if(f.name.includes(id.replace(/_/g,' ')))return resolve(k);
  for(const [k,it] of Object.entries(items))if(it.name.includes(id.replace(/_/g,' ')))return resolve(k);
  return null;
 }
 function artworkTarget(id){if(!world.surfaceInfo)return null;const aliases={south_wall:'south_wall',north_wall:'north_wall',east_wall:'east_wall',west_wall:'west_wall',floor:'floor',ceiling:'ceiling',chalk_wall:'south_wall',drawing:'drawing',art:'drawing',artwork:'drawing',wall_drawing:'drawing'};const sid=aliases[id];let chosen=null;
  for(const key of world.surfaceIds||[]){const info=world.surfaceInfo(key);const art=info?.artworks?.find(m=>norm(m.title)===id||norm(m.title).includes(id)&&id.length>3);if(art)chosen={info,art};if(key===sid)chosen={info,art:info.artworks?.at(-1)};if(sid==='drawing'&&info?.artworks?.length)chosen={info,art:info.artworks.at(-1)};}
  if(!chosen)return null;const {info,art}=chosen,b=art?.bounds||[20,25,80,75],look=info.point((b[0]+b[2])/2,(b[1]+b[3])/2),distance=Math.min(1.8,Math.max(.8,(b[2]-b[0])/100*info.W*.7)),toward=info.normal.clone();let x=look.x+toward.x*distance,z=look.z+toward.z*distance;if(info.id==='floor'){const d=Math.hypot(body.st.x-look.x,body.st.z-look.z)||1;x=look.x+(body.st.x-look.x)/d*.8;z=look.z+(body.st.z-look.z)/d*.8;}
  return {kind:'surface',id:info.id,name:art?`the drawing "${art.title}" on ${info.name}`:info.name,look,stand:body.freeSpotNear(x,z),artwork:art?.title};}
 class NavigationError extends Error{}
 function rel(side,up,fwd){const h=body.st.heading;const e=world.bot.head.getWorldPosition(new T.Vector3());return new T.Vector3(e.x+Math.sin(h)*fwd*2+Math.cos(h)*side*2,e.y+up,e.z+Math.cos(h)*fwd*2-Math.sin(h)*side*2);}
 function standFor(p){
  for(const r of world.RECTS)if(p.x>r.x0-.05&&p.x<r.x1+.05&&p.z>r.z0-.05&&p.z<r.z1+.05)return F[r.id]?.stand||null;
  const dx=body.st.x-p.x,dz=body.st.z-p.z,d=Math.hypot(dx,dz)||1;return body.freeSpotNear(p.x+dx/d*.48,p.z+dz/d*.48);}
 const near=(s,d=.35)=>s&&Math.hypot(body.st.x-s[0],body.st.z-s[1])<d;
 async function getUp(){const st=body.st;if(st.posture==='lie'){const ex=st.seat?.exit;body.setPosture('sit',st.lieOn==='bed'?SEATS.bed:{pos:[st.x,st.z],exit:ex,h:.1});st.lieOn=null;await sleep(1.1);}
  if(st.posture!=='stand'){body.standUpNow();await sleep(.7);}}
 async function goTo(r,speed){if(!r)throw new NavigationError('that target does not exist');if(r.stand&&!near(r.stand,.12)){await getUp();const started=body.walkTo(r.stand[0],r.stand[1],speed);if(started===false)throw new NavigationError(body.navigation?.reason||'no collision-free route');const timeout=Math.max(12,Math.min(35,(body.navigation?.remaining||5)/Math.max(.2,speed)*2+6));const reached=await until(()=>body.arrived||body.navigation?.status==='failed',timeout);const goal=body.navigation?.goal||r.stand;if(!reached||body.navigation?.status==='failed'||Math.hypot(body.st.x-goal[0],body.st.z-goal[1])>.16){const reason=body.navigation?.reason||(!reached?'movement timed out':'the body stopped short of the goal');body.stop();throw new NavigationError(reason);}}
  body.facePoint(r.look);body.lookAt(r.look,4);const faced=await until(()=>body.turned,4);if(!faced)throw new NavigationError('could not finish turning toward the target');return true;}
 const speed=()=>1.0+cb.fear()/100*.7;
 const held=()=>body.st.holding;
 async function pickUp(id){const r=resolve(id);if(!r||r.kind!=='item')return `There is no ${id} here to pick up.`;const it=r.item;if(it.held)return `You are already holding ${it.name}.`;
  await goTo(r,speed());const y=it.obj.getWorldPosition(new T.Vector3()).y;body.setPosture(y<.25?'crouch':y<.6?'half':'stand');body.gesture('reach',1.3);body.lookAt(it.obj.getWorldPosition(new T.Vector3()),2);
  if(it.state.broken){body.gesture('reach',2.5);await sleep(2.2);world.repairItem?.(it);cb.sfx('clang');}await sleep(.65);if(it.held)return `${it.name} is already in your hand.`;body.grab(it);await sleep(.6);body.setPosture('stand');await sleep(.35);
  return `You pick up ${it.name}. ${it.desc[0].toUpperCase()+it.desc.slice(1)}.`;}
 async function ensureHolding(id){if(held()?.id===id)return null;const r=await pickUp(id);return held()?.id===id?null:r;}
 async function putDown(target){const it=held();if(!it)return 'Your hands are empty.';
  if(target){const r=resolve(target);if(r)await goTo(r,speed());}
  const st=body.st,fx=st.x+Math.sin(st.heading)*.42,fz=st.z+Math.cos(st.heading)*.42;const point=world.placeSpot?world.placeSpot(it,target||[fx,fz]):{x:fx,y:world.surfaceAt(fx,fz),z:fz};
  if(target){const spot=new T.Vector3(point.x,point.y,point.z);await goTo({look:spot,stand:standFor(spot)},speed());}
  body.setPosture(point.y<.25?'crouch':point.y<.6?'half':'stand');body.gesture('reach',1.1);await sleep(.65);body.placeAt(point.x,point.y,point.z);await sleep(.4);body.setPosture('stand');
  const on=point.y>.8?'the sink':point.y>.7?'the table':point.y>.4?'the bed':'the floor';return `You set ${it.name} upright on ${on} at (${point.x.toFixed(1)}, ${point.z.toFixed(1)}).`;}
 async function tidy(a){const named=a.object?resolve(a.object)?.item:null;const targets=named?[named]:[...(held()?[held()]:[]),...Object.values(items).filter(i=>!i.held&&(i.fallen||i.state.broken||i.obj.position.distanceTo(i.home)>.4))].slice(0,12);if(!targets.length)return 'The loose objects are already upright and in their places.';const done=[];
  for(const it of targets){if(tok?.cancelled)throw INTERRUPT;const wasBroken=it.state.broken;const picked=await pickUp(it.id);if(held()!==it)continue;const target=a.on||a.position||[it.home.x,it.home.z];await putDown(target);done.push(it.name+(wasBroken?' (pieces collected and repaired)':''));cb.mood({despair:-1});}
  return 'You collect, carry and reorganize '+done.join(', ')+'. They are upright again. No objects were discarded.';}
 async function throwAt(target,obj){if(obj&&held()?.id!==norm(obj)&&items[ALIAS[norm(obj)]||norm(obj)]){const e=await ensureHolding(ALIAS[norm(obj)]||norm(obj));if(e)return e;}
  const it=held();if(!it)return 'You have nothing in your hand to throw.';
  const r=resolve(target)||{name:'the far wall',look:new T.Vector3(body.st.x+Math.sin(body.st.heading)*3,1.2,body.st.z+Math.cos(body.st.heading)*3)};
  body.facePoint(r.look);body.lookAt(r.look,3);await until(()=>body.turned,2.5);body.gesture('throw',.9);await sleep(.45);
  const from=body.handPos();const d=r.look.clone().sub(from);const dist=Math.hypot(d.x,d.z);const tt=Math.max(.25,Math.min(.9,dist/7));
  body.release(new T.Vector3(d.x/tt,(d.y+4.9*tt*tt)/tt,d.z/tt));cb.sfx('step');await sleep(1.4);
  const p=it.obj.position;return `You throw ${it.name} at ${r.name}. It ends up near (${p.x.toFixed(1)}, ${p.z.toFixed(1)}).`;}

 // ---------- object-specific uses ----------
 const USE={
  ball:async(how)=>{if(/kick/.test(how))return kick('ball');const e=await ensureHolding('ball');if(e)return e;const b=items.ball;let caught=0;body.gesture('bounce',6);
   for(let i=0;i<4;i++){body.release(new T.Vector3(0,-3.4,0));await until(()=>b.vel.y>0&&b.obj.position.y>.5||!b.moving,1.2);await until(()=>b.vel.y<.4,.6);if(Math.random()<.85){body.grab(b);caught++;}else break;await sleep(.15);}
   body.clearGesture();return caught>=4?'You bounce the ball off the floor four times and catch it every time. Thock, thock, thock, thock.':`You bounce the ball; it gets away from you after ${caught} catches and rolls off across the floor.`;},
  cube:async(how)=>{const e=await ensureHolding('cube');if(e)return e;const c=items.cube;body.gesture('twist',4.5);for(let i=0;i<5;i++){cb.sfx('twist');await sleep(.8);}c.state.moves=(c.state.moves||0)+1;
   const solve=/solve/.test(how)&&c.state.moves>2&&Math.random()<.3;if(solve){c.state.solved=1;return 'You twist the cube and... every face clicks into a single colour. Solved.';}c.state.solved=0;
   return rnd(['You twist the cube. Two faces almost line up, then you lose it again.','The cube clicks through a dozen moves. Red is nearly done; the rest is chaos.','You turn the cube over and over. It is more scrambled than when you started.']);},
  book:async()=>{const e=await ensureHolding('book');if(e)return e;const b=items.book;body.gesture('hold2',7);cb.sfx('page');await sleep(2);const page=BOOK[b.state.page%BOOK.length];b.state.page++;await sleep(Math.min(6,page.length/40));cb.sfx('page');cb.mood({despair:-2,fear:-1});return `You read. ${page}`;},
  chalk:async(how,text,a={})=>{
   const sid=surfaceFor(a.surface||a.on||a.where||(a.target&&!items[norm(a.target)]?a.target:null));const info=world.surfaceInfo(sid);
   if(/erase|wipe|clean/.test(how)){const all=/all|every|whole room/.test(how);await goTo(standAt(info,area(info,a).c),speed());body.gesture('write',2.5);await sleep(2.5);world.chalkErase(all?null:sid);return all?'You wipe every mark in the cell away. Chalk dust everywhere.':`You wipe ${info.name} clean with your palm.`;}
   const e=await ensureHolding('chalk');if(e)return e;
   const ar=area(info,a);await goTo(standAt(info,ar.c),speed());
   let strokes=a.strokes||a.lines||a.paths,title=a.title||a.subject||a.what||'';
   if(!strokes&&/tally|mark|count/.test(how)&&!text){const i=(tallies[sid]=(tallies[sid]||0)+1)-1,g=Math.floor(i/5),k=i%5,x=ar.u0+g*3+(k<4?k*.55:0);strokes=k<4?[[[x,60],[x+.12,66]]]:[[[x-2.4,61],[x+.6,65]]];title='a tally mark';
    const m=world.chalkDraw(sid,strokes,title);await chalkWork(m,info,1.4);return `You scratch a tally mark on ${info.name}.`;}
   if(/draw|sketch|scribble|doodle|paint/.test(how)||a.subject||strokes){
    const subject=String(a.subject||a.what||a.title||a.text||'').trim();
    if(subject||!strokes){ // the drawing hand (Vision model, medium effort) renders his description into strokes while he studies the surface
     body.st.aim=ar.cp;body.lookAt(ar.cp,60);cb.planning(subject||'something');let res,done=false;
     cb.artist({subject:subject||'whatever feels right in this moment',style:a.style||'',surface:info,box:[(ar.u1-ar.u0)/100*info.W,(ar.v1-ar.v0)/100*info.H]}).then(r=>{res=r;done=true;},()=>{done=true;});
     try{await until(()=>done,260);}finally{body.st.aim=null;}
     if(res&&res.strokes){strokes=res.strokes.map(st=>st.map(p=>[ar.u0+p[0]/100*(ar.u1-ar.u0),ar.v0+p[1]/100*(ar.v1-ar.v0)]));title=res.title||subject;}
     else if(!strokes)return 'You hold the chalk to the surface for a long time, but the picture will not come. Nothing goes on the wall.';}
    else strokes=strokes.map(st=>Array.isArray(st)?st.map(p=>Array.isArray(p)?[ar.u0+p[0]/100*(ar.u1-ar.u0),ar.v0+p[1]/100*(ar.v1-ar.v0)]:p):st);
    const m=world.chalkDraw(sid,strokes,title,a.width);if(!m)return 'The lines make no sense; nothing goes on the wall.';
    await chalkWork(m,info,Math.max(2,Math.min(150,m.total/.32+m.strokes.length*.12)));
    return `You draw ${title||'something'} on ${info.name} in chalk (${m.strokes.length} strokes).`;}
   text=String(text||'').slice(0,140);if(!text)return 'You hold the chalk up, but write nothing.';
   const m=world.chalkText(sid,text,a.x??(a.area?ar.u0:null),a.y??(a.area?ar.v0:null),a.size,a.rotate);await chalkWork(m,info,Math.max(1,Math.min(25,text.length*.16)));
   return `You write on ${info.name} in chalk: "${text}"`;},
  computer:async(how,text,a={})=>{if(/slop|browser/.test(how+' '+(a.app||'')))return browserAction({op:'open'});if(/code|program|build|make|develop|improve/.test(how)||a.idea)return codeApp(a);if(/note|journal|diary/.test(how))return writeNote(a);const pc=cb.computer;await atDesk();
   const m=/open|run|play|launch|use|try/.test(how)?pc.apps().find(x=>how.includes(x.name.toLowerCase()))||pc.app(a.app||a.name||text):null;
   if(m){const v=m.versions[m.versions.length-1];world.crt.set('app',{title:m.name,sub:v.summary});body.gesture('type',2);await sleep(2);body.lookAt(new T.Vector3(1.8,.97,-1.37),8);await sleep(7);return `You run "${m.name}" (v${m.versions.length}) and watch it on the CRT: ${v.summary}`;}
   world.crt.set('desktop',{list:pc.files()});body.gesture('type',2.5);await sleep(3);return 'You look over your files. Your computer holds '+pc.summary();},
  cards:async(how)=>{const e=await ensureHolding('cards');if(e)return e;body.gesture('shuffle',3);cb.sfx('cards');await sleep(1.5);cb.sfx('cards');await sleep(1.5);
   if(/tower|build|house/.test(how)){await goTo(resolve('table'),speed());body.gesture('touch',5);await sleep(5);const lv=1+Math.floor(Math.random()*5);return lv>3?`You build a card tower ${lv} levels high. It stands. You do not breathe on it.`:`The card tower reaches level ${lv} and collapses. Cards slide across the table.`;}
   if(/solitaire|play|deal/.test(how)){await sleep(3);return rnd(['You deal a game of solitaire against yourself. You lose. You also win.','Solitaire: you get stuck with three kings buried. Game over.','Solitaire: it comes out. Every card home. Nobody saw it but the camera.']);}
   return 'You shuffle the deck. The riffle sound fills the cell for a second.';},
  radio:async(how)=>{const r=items.radio;const reach=r.held?null:await goTo(resolve('radio'),speed());body.gesture('touch',1.2);await sleep(.8);cb.sfx('click');
   if(/off/.test(how)||(r.state.on&&!/tune|change|station|next/.test(how))){r.state.on=false;cb.radio(false);return 'You switch the radio off. The cell goes quiet again.';}
   if(r.state.on)r.state.station=(r.state.station+1)%STATIONS.length;r.state.on=true;cb.radio(true,r.state.station);cb.mood({despair:-3});const s=STATIONS[r.state.station];
   return `The radio comes on: ${s.name}${s.news?'. A voice cuts through: '+rnd(s.news):''}.`;},
  lamp:async()=>{const l=items.lamp;if(!l.held)await goTo(resolve('lamp'),speed());body.gesture('touch',1);await sleep(.7);cb.sfx('click');l.state.on=!l.state.on;l.state.light.intensity=l.state.on?1.6:0;return l.state.on?'You switch Gerald on. A small warm circle of light.':'You switch Gerald off.';},
  cup:async(how)=>{const c=items.cup;if(/fill/.test(how)||(!c.state.full&&!/drink|pour/.test(how))){const e=await ensureHolding('cup');if(e)return e;await goTo(resolve('sink'),speed());body.gesture('pour',2.4);cb.sfx('water');world.splash=1.6;await sleep(2.2);c.state.full=true;c.state.water.visible=true;return 'You fill the tin cup at the sink. Cold water.';}
   const e=await ensureHolding('cup');if(e)return e;if(!c.state.full)return 'The cup is empty.';
   if(/plant|pour|water/.test(how)){await goTo(resolve('plant'),speed());body.setPosture('half');body.gesture('pour',2.2);await sleep(2);c.state.full=false;c.state.water.visible=false;world.plant.water();body.setPosture('stand');cb.mood({despair:-3});return world.plant.health>.8?'You water the plant. Its leaves have lifted; it looks properly alive now.':'You water the plant. The soil darkens. The leaves look a little less tired.';}
   body.gesture('drink',2);await sleep(2);c.state.full=false;c.state.water.visible=false;return 'You tip the cup against your jaw. The water runs down your chassis and drips onto the floor. You do not need it. You did it anyway.';},
  sink:async()=>{await goTo(resolve('sink'),speed());body.gesture('touch',2);cb.sfx('water');world.splash=1.8;await sleep(2);return 'You press the tap. Water runs for a few seconds and stops on its own.';},
  plant:async(how)=>{if(/water/.test(how))return USE.cup('pour');await goTo(resolve('plant'),speed());body.setPosture('half');body.gesture('touch',2.5);world.plant.touch();await sleep(2.5);body.setPosture('stand');cb.mood({despair:-1});return world.plant.health>.7?'You touch a leaf. It is cool and firm.':'You touch a leaf. It is soft and droops; the soil is dry.';},
  window:async(how)=>{await goTo(resolve('window'),speed());const g=/grip|bars|hold/.test(how)?'grip_bars':/touch|glass|hand/.test(how)?'hand_on_glass':'lean_sill';body.gesture(g,6.5);body.lookAt(new T.Vector3(.3+(Math.random()-.5)*6,2+Math.random()*4,-14),7);await sleep(6.5);cb.mood({fear:-2,despair:-1});return 'You look out: '+cb.outside()+'.';},
  door:async(how)=>{await goTo(resolve('door'),speed());
   if(/knock|bang|pound/.test(how)){body.gesture('knock',2.2);cb.sfx('knock');await sleep(1.1);cb.sfx('knock');await sleep(1.2);return Math.random()<.15?'You knock. After a long moment, footsteps outside stop... then walk away.':'You knock. Nobody answers.';}
   if(/peek|look|viewport|through/.test(how)){body.lookAt(new T.Vector3(2.6,1.62,.6),4);await sleep(3.5);return 'Through the little barred viewport: a dim corridor, a red EXIT sign far away, a mop bucket. Nobody.';}
   body.gesture('reach',2);cb.sfx('door');await sleep(1.8);return 'You pull the handle. Locked. The door does not even rattle.';},
  mirror:async()=>{await goTo(resolve('mirror'),speed());body.lookAt(new T.Vector3(.4,1.72,2.4),5);await sleep(4.5);const m=cb.damage();return m?`In the steel mirror: your own skull and red eyes looking back. You can see ${m}.`:'In the steel mirror: your own skull, the red eyes, the teeth. Unmarked, for now.';},
  bed:async(how)=>{return /lie|sleep|rest/.test(how)?lie('bed'):sit('bed');},
  stool:async()=>sit('stool'),
  camera:async(how)=>{await goTo({look:v(F.camera.look),stand:null});body.lookAt(v(F.camera.look),5);if(/wave/.test(how))body.gesture('wave',3);await sleep(3);return 'You look straight into the camera lens. The red light blinks back.';},
  hatch:async()=>{body.lookAt(v(F.hatch.look),4);await sleep(3);return 'The hatch is shut. Seams, rivets, a faint yellow warning stripe around the edge.';},
 };
 const rnd=a=>a[Math.floor(Math.random()*a.length)];
 const tallies={};
 async function atDesk(){if(body.st.posture==='sit'&&body.st.seat===SEATS.stool)return;await sit('stool');}
 async function browserAction(a){await atDesk();body.gesture('type',999,true);try{const r=await cb.browser(a);return r.error?'Browser: '+r.error:`Slopcannon ${r.needsSignIn?'needs operator sign-in':r.title||'opened'}. ${String(r.ui||'').slice(0,1600)}`;}finally{body.clearGesture();}}
 async function codeApp(a){const pc=cb.computer;let name=String(a.app||a.name||a.title||'').trim().slice(0,40);const idea=String(a.idea||a.what||a.change||a.description||a.text||a.how||'').trim();
  if(!idea&&!name)return 'You sit in front of the computer, but you do not know what to build.';
  await atDesk();const prev=name?pc.app(name):null;if(prev)name=prev.name;
  world.crt.set('typing',{title:name||'new program'});body.gesture('type',999,true);cb.planning(`${prev?'improving':'writing'} ${name||'a new app'}: ${idea}`,'code');
  let res,done=false;const t0=now;cb.coder({name,idea,current:prev?prev.versions[prev.versions.length-1].html:null}).then(r=>{res=r;done=true;},()=>{done=true;});
  try{await until(()=>done&&now-t0>8,320);
   if(!res){world.crt.set('desktop',{list:pc.files()});return 'The program will not come together. You delete it and sit back.';}
   world.crt.feed(res.html);await sleep(Math.min(7,2+res.html.length/9000));
   const title=prev?prev.name:(res.title||name||'Untitled'),ver=pc.saveApp(title,res.html,res.summary);
   world.crt.set('app',{title,sub:res.summary});await sleep(3);
   return `You ${ver>1?'update':'finish'} "${title}" (version ${ver}, ${Math.round(res.html.length/1000)} KB) on the computer and run it: ${res.summary}`;}
  finally{body.clearGesture();}}
 async function writeNote(a){const pc=cb.computer;const title=String(a.title||a.name||'Note').slice(0,40),text=String(a.text||a.content||a.body||'').slice(0,4000);if(!text)return 'You open a blank note and close it again.';
  await atDesk();world.crt.set('note',{title,text});body.gesture('type',999,true);try{await sleep(Math.min(14,2+text.length*.035));}finally{body.clearGesture();}pc.saveNote(title,text);return `You type a note on the computer: "${title}".`;}
 const SURF_ALIAS={north:'north_wall',north_wall:'north_wall',window_wall:'north_wall',window:'north_wall',south:'south_wall',south_wall:'south_wall',chalk_wall:'south_wall',mirror_wall:'south_wall',sink_wall:'south_wall',
  east:'east_wall',east_wall:'east_wall',door_wall:'east_wall',west:'west_wall',west_wall:'west_wall',bed_wall:'west_wall',floor:'floor',ground:'floor',ceiling:'ceiling',roof:'ceiling',overhead:'ceiling',door:'door',steel_door:'door'};
 function surfaceFor(name){const k=norm(name);if(SURF_ALIAS[k])return SURF_ALIAS[k];
  // "wall" / nothing: the wall he is facing, else the nearest one
  const st=body.st,fx=Math.sin(st.heading),fz=Math.cos(st.heading);const d={north_wall:(st.z+2)/Math.max(.05,-fz),south_wall:(2-st.z)/Math.max(.05,fz),east_wall:(2.5-st.x)/Math.max(.05,fx),west_wall:(st.x+2.5)/Math.max(.05,-fx)};
  return Object.entries(d).filter(([,v])=>v>0).sort((x,y)=>x[1]-y[1])[0]?.[0]||'south_wall';}
 function area(info,a){ // the drawing box on the surface (0..100 coords): given by the mind, or a reachable patch in front of him
  let b=Array.isArray(a.area)&&a.area.length===4?a.area.map(Number):null;
  if(!b){const st=body.st,p=new T.Vector3(st.x,0,st.z),o=info.point(0,0),u=info.point(100,0).sub(o),v=info.point(0,100).sub(o);
   const pu=p.clone().sub(o).dot(u)/u.lengthSq()*100,pv=Math.abs(info.normal.y)>.5?p.clone().sub(o).dot(v)/v.lengthSq()*100:50;
   b=Math.abs(info.normal.y)>.5?[pu-14,pv-18,pu+14,pv+18]:info.id==='door'?[8,22,92,78]:[pu-18,28,pu+18,72];}
  const cl=x=>Math.max(0,Math.min(100,x));let [u0,v0,u1,v1]=b.map(cl);if(u1<u0)[u0,u1]=[u1,u0];if(v1<v0)[v0,v1]=[v1,v0];if(u1-u0<4){u0=Math.min(u0,96);u1=u0+4;}if(v1-v0<4){v0=Math.min(v0,96);v1=v0+4;}
  return {u0,v0,u1,v1,c:[(u0+u1)/2,(v0+v1)/2],cp:info.point((u0+u1)/2,(v0+v1)/2)};}
 function standAt(info,uv){const p=Array.isArray(uv)?info.point(uv[0],uv[1]):uv;const n=info.normal;
  if(Math.abs(n.y)>.5){const st=body.st;let dx=st.x-p.x,dz=st.z-p.z,d=Math.hypot(dx,dz);if(d<.05){dx=-p.x;dz=.2-p.z;d=Math.hypot(dx,dz)||1;}const s=body.freeSpotNear(p.x+dx/d*.45,p.z+dz/d*.45);return {look:p,stand:s,horizontal:true,floor:info.id==='floor'};}
  return {look:p,stand:body.freeSpotNear(p.x+n.x*.5,p.z+n.z*.5),face:Math.atan2(-n.x,-n.z)};}
 async function chalkWork(m,info,dur){ // the chalk tip leads, the arm follows; he side-steps along walls, crouches for low marks and the floor
  const st=body.st,t0=now;let lastS=0;
  try{while(true){const k=Math.min(1,(now-t0)/dur);world.chalkSet(m,k);const pen=world.chalkPen(m);st.aim=pen;body.lookAt(pen,1);
    const sp=standAt(info,pen);const off=Math.hypot(sp.stand[0]-st.x,sp.stand[1]-st.z);
    if(off>(sp.floor?.35:.42)&&body.arrived)body.walkTo(sp.stand[0],sp.stand[1],.7);
    else if(body.arrived&&body.turned){const want=sp.horizontal?Math.atan2(pen.x-st.x,pen.z-st.z):sp.face;if(Math.abs(Math.atan2(Math.sin(want-st.heading),Math.cos(want-st.heading)))>.25)body.face(want);}
    const post=sp.floor||pen.y<.45?'crouch':pen.y<.85?'half':'stand';if(body.arrived&&st.posture!==post)body.setPosture(post);
    if(now-lastS>.42){lastS=now;cb.sfx('chalk');}
    if(k>=1)break;await until(()=>true,1);}}
  finally{st.aim=null;if(st.posture==='half'||st.posture==='crouch')body.setPosture('stand');}
 }
 async function kick(id){const r=resolve(id);if(!r||r.kind!=='item')return 'There is nothing like that to kick.';const it=r.item;if(it.held)body.placeAt(body.st.x+Math.sin(body.st.heading)*.3,0,body.st.z+Math.cos(body.st.heading)*.3);
  await goTo({...r,stand:r.stand},speed()*1.1);body.gesture('kick',.8);await sleep(.35);const h=body.st.heading;if(it.obj.position.distanceTo(new T.Vector3(body.st.x,it.obj.position.y,body.st.z))<.75){it.vel.set(Math.sin(h)*4.5,1.6,Math.cos(h)*4.5);it.moving=true;cb.sfx('bounce');}
  await sleep(1);return `You kick ${it.name}. It ${it.id==='ball'?'flies off the wall and bounces around the cell':'skids across the floor'}.`;}
 async function sit(on){on=ALIAS[norm(on)]||norm(on)||'floor';
  if(on==='floor'||!SEATS[on]){await getUp();body.setPosture('floor',null);await sleep(1.4);return 'You sit down on the cold floor and pull your knees up.';}
  const s=SEATS[on];await goTo({look:new T.Vector3(s.pos[0],.5,s.pos[1]),stand:s.exit},speed());body.st.seatH=s.h;body.setPosture('sit',s);await sleep(1.2);return `You sit down on ${s.name}.`;}
 async function lie(on){on=ALIAS[norm(on)]||norm(on)||'bed';const st=body.st;
  if(on!=='bed'){await getUp();body.setPosture('floor');await sleep(.9);st.lieOn='floor';st.lieHeading=st.heading;body.setPosture('lie',{pos:[st.x,st.z],exit:[st.x,st.z]});await sleep(1.5);return 'You lie down flat on the floor and look at the ceiling.';}
  if(st.posture!=='sit'||st.seat!==SEATS.bed)await sit('bed');st.lieOn='bed';st.lieHeading=0;body.setPosture('lie',{pos:[-2.06,-.3],exit:[-1.3,-.75]});await sleep(1.6);return 'You lie down on the bed. The springs creak. The ceiling light is directly above you.';}

 // A view is acquired while the target remains held, after the animated head
 // settles. Static descriptions are legacy fixtures, never fresh optical evidence.
 async function observeTarget(r,token,{approach=false,inspect=false}={}){
  if(token?.cancelled||token?.signal?.aborted)throw INTERRUPT;
  if(r){
   if(r.stand&&(approach||r.kind==='surface'||['bed','table'].includes(r.id)))await goTo(r,speed());
   body.facePoint(r.look);body.lookAt(r.look,30);
   const turned=await until(()=>body.turned,4);if(!turned)throw new NavigationError('could not finish turning toward the target');
   if(inspect)body.setPosture(r.look.y<.6?'half':'stand');
  }
  await sleep(.65);
  if(token?.cancelled||token?.signal?.aborted)throw INTERRUPT;
  if(!cb.observe)return null;
  let observed;try{observed=await cb.observe({target:r?.id||null,name:r?.name||'the current view',token});}catch(error){if(token?.cancelled||token?.signal?.aborted)throw INTERRUPT;throw error;}
  if(token?.cancelled||token?.signal?.aborted)throw INTERRUPT;
  return observed&&typeof observed.text==='string'&&observed.text.trim()?observed:{text:'Fresh optical observation unavailable.'};
 }
 // ---------- the dispatcher ----------
 async function run(a,token){try{return await dispatch(a,token);}catch(e){if(!(e instanceof NavigationError))throw e;body.stop();return `You could not reach ${String(a.target||a.object||a.on||'that target')}: ${e.message}. You remain at (${body.st.x.toFixed(2)}, ${body.st.z.toFixed(2)}); the target was not reached.`;}}
 async function dispatch(a,token){
  tok=token;let doRaw=norm(a.do||a.action||a.type||'');let obj=a.object??a.target??a.item??a.on??a.at;const how=String(a.how||a.mode||a.manner||doRaw).toLowerCase();
  const map={go_to:'walk_to',move_to:'walk_to',walk:'walk_to',go:'walk_to',approach:'walk_to',run_to:'walk_to',look:'look_at',watch:'look_at',stare_at:'look_at',examine:'inspect',study:'inspect',grab:'pick_up',take:'pick_up',pickup:'pick_up',drop:'put_down',place:'put_down',set_down:'put_down',
   toss:'throw',play:'use',play_with:'use',interact:'use',read:'read',write:'write',draw:'draw',scribble:'draw',sketch:'draw',doodle:'draw',paint:'draw',sleep:'lie_down',lie:'lie_down',rest:'wait',idle:'wait',pause:'wait',listen:'wait',think:'wait',stand:'stand_up',get_up:'stand_up',kneel:'crouch',squat:'crouch',
   knock:'use',try_door:'use',open:'use',look_out:'use',look_out_window:'use',water:'use',fill:'use',turn_on:'use',turn_off:'use',switch:'use',bounce:'use',twist:'use',shuffle:'use',solve:'use',tally:'write',
   wave:'gesture',shrug:'gesture',nod:'gesture',shake_head:'gesture',cover_face:'gesture',stretch:'gesture',point:'gesture',clap:'gesture',salute:'gesture',dance:'gesture',punch_wall:'gesture',hug_knees:'sit',look_around:'gesture',rub_head:'gesture',fists:'gesture'};
  const lk=/^look_(up|down|left|right|around)$/.exec(doRaw);if(lk&&lk[1]!=='around'){obj=lk[1];}
  const d=lk?(lk[1]==='around'?'gesture':'look_at'):map[doRaw]||doRaw;
  switch(d){
   case 'walk_to':{const r=resolve(obj);if(!r)return `You don't know where "${obj}" is.`;await goTo(r,a.speed==='fast'||a.run?speed()*1.6:speed());return `You walk to ${r.name}, arriving at (${body.st.x.toFixed(2)}, ${body.st.z.toFixed(2)}).${body.navigation?.goal&&r.stand&&Math.hypot(body.navigation.goal[0]-r.stand[0],body.navigation.goal[1]-r.stand[1])>.08?' The requested point was obstructed; this is the nearest free standing position.':''}`;}
   case 'pace':{const sec=clampN(a.seconds,4,40,12),t0=now;let i=0;const pts=[[-.9,.7],[1.4,.7]];while(now-t0<sec){const p=pts[i++%2];await goTo(resolve(p),speed());}return `You pace back and forth for ${Math.round(sec)} seconds.`;}
   case 'look_at':{const r=resolve(obj);if(!r)return `You cannot aim at "${obj}": that target is not known.`;
    const observed=await observeTarget(r,token);
    if(observed)return `You face ${r.name}. Fresh optical observation: ${observed.text}`;
    await sleep(clampN(a.seconds,1,20,3));return `You look at ${r.name}.`;}
   case 'inspect':{const r=resolve(obj);if(!r)return `There is no known target "${obj}" to inspect.`;
    const observed=await observeTarget(r,token,{approach:true,inspect:true});body.setPosture('stand');
    if(observed)return `You inspect ${r.name}. Fresh optical observation: ${observed.text}`;
    if(r.kind==='item')return `You look closely at ${r.name}: ${r.item.desc}${r.item.state.broken?', broken with scattered pieces ready to collect and repair':''}${r.item.id==='cube'?(r.item.state.solved?', solved':', scrambled'):''}${r.item.id==='radio'?(r.item.state.on?', playing':', switched off'):''}.`;
    if(r.kind==='surface')return `You have a clear view of ${r.name}. ${world.surfaceInfo(r.id)?.marks||'This surface has no marks yet.'}`;
    if(r.id==='chalk_wall'){const tx=world.chalkDescription;return tx?`The chalk wall reads: ${tx}`:'The wall is bare grey paint. Nothing written yet.';}
    if(r.id==='plant')return `The plant: ${world.plant.health>.7?'green and upright':world.plant.health>.5?'recovering a little':'wilted, dry soil'}.`;
    return `You look closely at ${r.name}: ${F[r.id]?.desc||'nothing special'}.`;}
   case 'snapshot':case 'capture':case 'observe':{
    const r=obj?resolve(obj):null;if(obj&&!r)return `You cannot aim the optical frame at "${obj}": that target is not known.`;
    const observed=await observeTarget(r,token);
    if(!observed)return 'Optical capture is unavailable; no new observation was acquired.';
    return `Current optical frame${r?' facing '+r.name:''}: ${observed.text}`;}
   case 'turn':case 'turn_around':{const deg=Number(a.degrees??180);body.face(body.st.heading+deg*Math.PI/180);const turned=await until(()=>body.turned,4);if(!turned)throw new NavigationError('the turn did not complete');return `You turn ${deg} degrees; you are now facing ${body.describe?.().facing||'the new direction'}.`;}
   case 'pick_up':return pickUp(obj);
   case 'put_down':{const isItem=x=>!!items[ALIAS[norm(x)]||norm(x)];return putDown(a.on||a.at||a.target||(a.object&&!isItem(a.object)?a.object:null));}
   case 'throw':return throwAt(a.target||a.at||(a.object&&held()&&norm(a.object)!==held().id?a.object:'far wall'),a.object&&a.target?a.object:null);
   case 'kick':return kick(obj||'ball');
   case 'tidy':case 'clean_up':case 'reorganize':case 'repair':return tidy(a);
   case 'read':return USE.book();
   case 'code':case 'program':case 'build_app':case 'make_app':return codeApp(a);
   case 'create_3d':case 'build_3d':{await atDesk();body.gesture('type',999,true);cb.planning('building a physical 3D object: '+String(a.idea||a.name||''),'code');try{const it=await cb.creator({...a,token});if(token?.cancelled)throw INTERRUPT;return `You create ${it.name}: ${it.desc}. It now exists in your cell at (${it.obj.position.x.toFixed(1)}, ${it.obj.position.z.toFixed(1)}). You can inspect it, pick it up, kick it or throw it.`;}catch(e){if(e===INTERRUPT)throw e;return 'The 3D object could not be built: '+e.message;}finally{body.clearGesture();}}
   case 'browser':case 'slopcannon':return browserAction(a);
   case 'note':case 'write_note':case 'journal':case 'type':return writeNote(a);
   case 'write':return USE.chalk(doRaw==='tally'?'tally':String(a.how||''),a.text||a.words||a.message,a);
   case 'draw':return USE.chalk('draw '+String(a.how||''),a.text,a);
   case 'sit':case 'sit_down':return doRaw==='hug_knees'?sit('floor'):sit(a.on||a.target||a.object||'floor');
   case 'lie_down':return lie(a.on||a.target||a.object||'bed');
   case 'stand_up':await getUp();return 'You stand up.';
   case 'crouch':await getUp();body.setPosture('crouch');await sleep(clampN(a.seconds,1,20,3));body.setPosture('stand');return 'You crouch down for a moment, then stand again.';
   case 'wait':{const sec=clampN(a.seconds,1,60,6);body.lookAt(null);await sleep(sec);return `${Math.round(sec)} seconds pass.`;}
   case 'gesture':{const k=norm(a.kind||a.gesture||doRaw).replace('punch_wall','punch');const dur=clampN(a.seconds,1,10,k==='dance'?6:2);
    if(k==='punch'){const r=resolve(obj||'chalk_wall');await goTo(r,speed());body.gesture('punch',.7);await sleep(.3);cb.sfx('thud');cb.punch();await sleep(.6);return 'You punch the wall. The concrete wins. A dull ache in your knuckle servos.';}
    body.gesture(k,dur,false);if(k==='knock')cb.sfx('knock');if(k==='clap')cb.sfx('click');await sleep(dur);return '';}
   case 'use':{let id=ALIAS[norm(obj)]||norm(obj);const verb=doRaw==='use'?how:doRaw.replace(/_/g,' ')+' '+how;
    if(!id||!USE[id]){const g={knock:'door',try_door:'door',open:'door',look_out:'window',look_out_window:'window',water:'plant',fill:'cup',bounce:'ball',twist:'cube',solve:'cube',shuffle:'cards',turn_on:'radio',turn_off:'radio',switch:'lamp'}[doRaw];if(g)id=g;}
    if(!USE[id]){if(held()&&!obj)id=held().id;}
    if(!USE[id])return `You aren't sure how to use "${obj}".`;return USE[id](verb,a.text,a);}
   default:{if(obj&&USE[ALIAS[norm(obj)]||norm(obj)])return USE[ALIAS[norm(obj)]||norm(obj)](doRaw.replace(/_/g,' '),a.text,a);
    const g=norm(a.do);if(g&&g in GEST_OK){body.gesture(g,2);await sleep(2);return '';}
    body.gesture('look_around',2.5);await sleep(2.5);return a.describe?`You ${String(a.describe).slice(0,120)}.`:`You try to ${String(a.do||'act').replace(/_/g,' ')}.`;}
  }
 }
 const GEST_OK={wave:1,shrug:1,nod:1,shake_head:1,cover_face:1,stretch:1,point:1,fists:1,knock:1,hug_knees:1,rub_head:1,clap:1,salute:1,dance:1,look_around:1};
 const clampN=(x,a,b,d)=>{x=Number(x);return Number.isFinite(x)?Math.max(a,Math.min(b,x)):d;};
 function cancelAll(){if(tok){tok.cancelled=true;tok.abort?.();}body.stop();body.clearGesture();for(const w of waiters.splice(0))w.rej(INTERRUPT);}
 return {run,tick,resolve,until,sleep,cancelAll,SEATS};
}
