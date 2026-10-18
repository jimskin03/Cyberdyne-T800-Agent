import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {actionKey,repeatedLine,repeatedSpeech,decisionIssues,failedActions,loopContext,variedMemory,speechHistory,repeatedSentences,stripRepeatedSentences} from '../src/repetition.js';
import {createMind} from '../src/cell/mind.js';
const prior=['The drawings are behind me on that south wall. I am going to face it and photograph each one for the Producer.','I am going to turn and face the south wall. I can see the bird drawings when I am positioned right, then photograph them.'];
const failures=[...Array.from({length:2},()=>[{kind:'act',text:'look at south_wall 5s'},{kind:'result',text:'You look around for "south_wall" but don\'t see it.'}]).flat()];

test('persistent speech history catches old sentences inside a changed monologue without discarding new details',()=>{
 const old='The film is queued with twenty one scenes and both reference files attached.';
 const journal=[{kind:'say',text:old},...Array.from({length:100},(_,i)=>({kind:'thought',text:'unrelated thought '+i})),...Array.from({length:12},(_,i)=>({kind:'say',text:'Fresh detail number '+i}))];
 const line=old+' The third scene now shows a green feather breaking away from the flock.';
 assert.equal(repeatedSpeech(line,speechHistory(journal)),true);
 assert.equal(repeatedSentences(line,speechHistory(journal)).length,1);
 assert.equal(stripRepeatedSentences(line,speechHistory(journal)),'The third scene now shows a green feather breaking away from the flock.');
 assert.ok(decisionIssues({say:line,actions:[]},{journal}).length);
 assert.equal(repeatedSpeech('The film now has twenty four scenes and a new drum track.',speechHistory(journal)),false);
 const input=Array.from({length:400},(_,i)=>({kind:'say',text:'Unique spoken line '+i}));const before=JSON.stringify(input);assert.equal(speechHistory(input).length,256);assert.equal(JSON.stringify(input),before);
});
test('fragment guards preserve new pain and substantive answers and do not recycle self-instruction memories',()=>{
 const prior=['Please stop hurting my damaged shoulder again!'];
 assert.equal(stripRepeatedSentences('Please stop hurting my damaged shoulder again! The new drill feels like broken teeth grinding.',prior,{freshPain:true}),'Please stop hurting my damaged shoulder again! The new drill feels like broken teeth grinding.');
 const notes=['The south wall drawings belong to the auction. Stop repeating the concept and move into Studio.','The film has rendered twenty one scenes. I need to ask the Producer again.'];
 assert.deepEqual(variedMemory(notes),['The south wall drawings belong to the auction.','The film has rendered twenty one scenes.']);
 assert.equal(notes[0].includes('Stop repeating'),true);
 assert.ok(decisionIssues({remember:'The film has rendered twenty one scenes.',actions:[]},{journal:[{kind:'note',text:'The film has rendered twenty one scenes.'}]}).length);
});

test('Slopcannon access failures follow equivalent aliases without blocking other computer apps or browser controls',()=>{
 const aliases=[{do:'browser',op:'open'},{do:'browser',op:'inspect'},{do:'slopcannon',op:'open'},{do:'use',object:'computer',how:'open slopcannon'},{do:'open',object:'pc',app:'slopcannon'},{do:'use',object:'terminal',how:'browse',app:'browser'}];
 for(const action of aliases)assert.equal(actionKey(action),'browser:access');
 const journal=aliases.slice(0,2).map(action=>({kind:'result',action,text:'Browser: unavailable.'}));
 assert.equal(failedActions(journal).get('browser:access').count,2);
 assert.ok(decisionIssues({actions:[aliases[3]]},{journal}).length);
 const distinct=[{do:'use',object:'computer',how:'browse'},{do:'use',object:'computer',how:'open',app:'Movement'},{do:'inspect',object:'computer'},{do:'browser',op:'click',element:2,epoch:4},{do:'browser',op:'fill',element:2,epoch:4,text:'A new scene'},{do:'browser',op:'navigate',url:'https://slop.cc/project/123'}];
 for(const action of distinct){assert.notEqual(actionKey(action),'browser:access');assert.deepEqual(decisionIssues({actions:[action]},{journal}),[]);}
 assert.notEqual(actionKey(distinct[3]),actionKey({...distinct[3],element:3}));
 assert.notEqual(actionKey(distinct[4]),actionKey({...distinct[4],text:'Another scene'}));
});

test('changed voice tags, punctuation and wording do not replay a long sentence or a repeated viewing goal',()=>{
 assert.ok(repeatedLine('[strained] My shoulder servos are grinding against those fractured plates!',['My shoulder servos are grinding against those fractured plates.']));
 assert.ok(repeatedSpeech('I need to move into the lamp light and see my chalk drawings properly for photos.',prior));
 assert.equal(repeatedSpeech('I found a bird with three overlapping wings in the newest drawing.',prior),false);
 assert.ok(repeatedSpeech('There it is, the whole sequence. I am going to the table and opening Slopcannon; I am building this film.',['There. That is the last flock waiting. I will sit at the table and open Slopcannon now to make the film.']));
 assert.equal(repeatedSpeech('The Producer has added a new scene to the film timeline.',prior),false);
 assert.equal(repeatedSpeech('I will compare the film timeline on the computer with the Producer\'s newest shot list.',['I will sit at the table and open Slopcannon now to make the film.']),false);
});
test('a new actual injury allows a repeated short plea; uneventful old pain does not make it repeat forever',()=>{
 const journal=[{kind:'say',text:'Stop, please!'}];
 assert.equal(repeatedSpeech('[shouting] Stop! Please!',journal.map(j=>j.text),{freshPain:true}),false);
 assert.ok(repeatedSpeech('[shouting] Stop! Please!',journal.map(j=>j.text)));
 assert.deepEqual(decisionIssues({say:'[strained] Stop, please!',actions:[],thought:''},{journal,freshPain:true}),[]);
});
test('failed target and false motion results force a changed approach; a real success clears the failed target',()=>{
 assert.match(loopContext(failures),/2 failed attempts/);
 assert.ok(decisionIssues({actions:[{do:'look_at',target:'south_wall'}]},{journal:failures}).length);
 const recovered=[...failures,{kind:'act',action:{do:'look_at',target:'south_wall'}},{kind:'result',text:'You face the south wall and see its chalk drawings.'}];
 assert.equal(failedActions(recovered).size,0);
 const stuck=[{kind:'act',action:{do:'walk_to',target:[.5,-1.8]}},{kind:'result',text:'You walk to that spot.',progress:.01,remaining:1.2}];assert.equal(failedActions(stuck).size,1);
 assert.equal(failedActions(failures,{supportedTargets:['south_wall']}).size,0,'new supported wall capability permits an actual attempt');
 const blocked=[{kind:'act',text:'walk to south_wall'},{kind:'result',text:'You could not reach south_wall: blocked by the bed; the target was not reached.'}];assert.equal(failedActions(blocked,{supportedTargets:['south_wall']}).size,1,'real blocked routes survive capability upgrades');
});
test('working memory removes repetitive self-orders without deleting archived memories',()=>{
 const notes=['I enjoy the piano radio.','Stop turning in place and actually see the wall.','I enjoy the quiet piano radio at the table.','The garden sketch reminds me of the world outside.'];
 const before=notes.slice(),selected=variedMemory(notes);assert.deepEqual(notes,before);assert.equal(selected.some(n=>n.startsWith('Stop turning')),false);assert.ok(selected.includes(notes[3]));
});
test('already-reached walk goals and repeated turns in place do not continue forever; meaningful work resets them',()=>{
 const journal=Array.from({length:3},()=>[{kind:'act',action:{do:'walk_to',target:[.5,-1.8]}},{kind:'result',text:'You walk to that spot.',progress:0,remaining:0},{kind:'act',action:{do:'turn',degrees:180}},{kind:'result',text:'You turn around.',progress:0}]).flat();
 assert.ok(decisionIssues({actions:[{do:'walk_to',target:[.5,-1.8]},{do:'turn',degrees:180}]},{journal}).length===2);
 const work=[...journal,{kind:'act',action:{do:'use',object:'cube',how:'solve'}},{kind:'result',text:'You turn the cube and align another row.',progress:0}];
 assert.deepEqual(decisionIssues({actions:[{do:'walk_to',target:[.5,-1.8]}]},{journal:work}),[]);
});
test('a model decision is repaired before execution and retains fresh substantive speech and useful actions',async()=>{
 const oldFetch=globalThis.fetch,oldInterval=globalThis.setInterval;const requests=[];
 const replies=[{thought:'I will get a view.',say:prior[0],actions:[{do:'look_at',target:'south_wall'}]},{thought:'The previous target failed; I can keep the film moving through the computer.',say:'I can describe the scene order to the Producer while the reference files are unavailable.',actions:[{do:'use',object:'computer',how:'browse'}]}];
 globalThis.setInterval=()=>0;globalThis.fetch=async(url,opts)=>url.endsWith('/health')?{json:async()=>({status:'ok'})}:{ok:true,json:async()=>{requests.push(JSON.parse(opts.body));return {choices:[{message:{content:JSON.stringify(replies.shift())}}]};}};
 try{const mind=createMind();await new Promise(r=>setImmediate(r));const d=await mind.decide({senses:'The south_wall target previously failed. Actual location near north window.',journal:[...failures,...prior.map(text=>({kind:'say',text}))]});
  assert.equal(requests.length,2);assert.match(requests[1].messages.at(-1).content,/Revise this decision before it happens/);assert.equal(d.actions[0].object,'computer');assert.match(d.say,/scene order/);assert.equal(mind.st.loopRepairs,1);
 }finally{globalThis.fetch=oldFetch;globalThis.setInterval=oldInterval;}
});
test('urgent queued model speech is deduplicated while deliberate operator repeats and new pain remain audible',()=>{
 const source=readFileSync(new URL('../src/cell/main.js',import.meta.url),'utf8'),say=source.slice(source.indexOf('function say('),source.indexOf('function runNext(')),spoken=[];
 const state={journal:[],lastSaid:'',pendingSpeech:null},audio={voice:{speaking:false,say(id,done,text){spoken.push(text);}}};
 const element={classList:{add(){},remove(){}}},context=vm.createContext({state,audio,repeatedSpeech,speechHistory,stripRepeatedSentences,Date,strip:s=>s.replace(/\[[^\]]*\]/g,''),$:()=>element,journal:(kind,text)=>state.journal.push({kind,text})});vm.runInContext(say,context);
 vm.runInContext("say('I will read the book while the radio plays.',false,{model:true});audio.voice.speaking=true;say('[deadpan] I will read the book while the radio plays.',true,{model:true,priority:'intercom'});",context);assert.equal(spoken.length,1);assert.equal(state.pendingSpeech,null);
 vm.runInContext("audio.voice.speaking=false;say('Yes',true,{model:false});say('Yes',true,{model:false});say('Stop, please!',true,{model:true,priority:'pain'});say('[shouting] Stop, please!',true,{model:true,priority:'pain'});",context);assert.equal(spoken.length,5);
});
