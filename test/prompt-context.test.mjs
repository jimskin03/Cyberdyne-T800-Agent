import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPromptContext,recentContext,INTERCOM_CONTEXT_CHARS,BACKGROUND_CONTEXT_CHARS} from '../src/cell/prompt-context.js';

test('latest intercom survives saturated lower-priority telemetry',()=>{
 const question='What would you like to talk about now?';
 const text=buildPromptContext([
  {name:'Historical telemetry',text:'Old readings. '.repeat(20000)},
  {name:'Current observations',text:'The operator is speaking. The arm is retracted.'},
  {name:'Latest intercom',text:question}
 ],{maxChars:INTERCOM_CONTEXT_CHARS});
 assert(text.length<=INTERCOM_CONTEXT_CHARS);
 assert(text.startsWith('[Latest intercom]\n'+question));
 assert(text.includes('The arm is retracted.'));
 assert.equal(BACKGROUND_CONTEXT_CHARS,18000);
});

test('section selection removes duplicate lines across sources and preserves provenance',()=>{
 const text=buildPromptContext([
  {name:'Current observations',text:'The radio is off.\nThe door is closed.'},
  {name:'Old memory',text:'  THE   RADIO is off.\nAn earlier tune played.\nAn earlier tune played.'}
 ]);
 assert.equal((text.match(/radio/gi)||[]).length,1);
 assert.equal((text.match(/earlier tune/g)||[]).length,1);
 assert(text.includes('[Old memory]\nAn earlier tune played.'));
});

test('explicit section priorities and per-section limits obey total budget',()=>{
 const text=buildPromptContext([{name:'Other',text:'x'.repeat(500)},{name:'Pinned',priority:200,text:'Keep this question.'}],{maxChars:80,sectionMaxChars:50});
 assert(text.startsWith('[Pinned]\nKeep this question.'));
 assert(text.length<=80);
 assert(text.endsWith('…'));
 for(const maxChars of [0,1,8,20])assert(buildPromptContext([{name:'Current',text:'many words '.repeat(10)}],{maxChars}).length<=maxChars);
});

test('journal selection excludes heartbeats and keeps newest unique conversation in chronological order',()=>{
 const rows=[{kind:'intercom',text:'An older question.'},{kind:'say',text:'A repeated reply.'},...Array.from({length:200},()=>({kind:'heartbeat',text:'Pulse and pain telemetry.'})),{kind:'say',text:'A repeated reply.'},{kind:'intercom',text:'The latest question.'}];
 const text=recentContext(rows,{limit:3});
 assert(!text.includes('telemetry'));
 assert.equal((text.match(/repeated reply/g)||[]).length,1);
 assert(text.indexOf('older question')<text.indexOf('repeated reply'));
 assert(text.endsWith('[intercom] The latest question.'));
});

test('journal row and aggregate limits retain newest data without metadata leakage',()=>{
 const rows=[{kind:'note',text:'old '.repeat(2000)},{kind:'intercom',text:'new '.repeat(2000),secretMetadata:'NEVER_RENDER'}];
 const text=recentContext(rows,{maxChars:90,textMaxChars:40});
 assert(text.length<=90);
 assert(!text.includes('NEVER_RENDER'));
 assert(text.split('\n').every(line=>line.length<=51));
 assert.equal(recentContext(rows,{limit:0}),'');
 assert.equal(recentContext(rows,{maxChars:0}),'');
 assert.equal(recentContext(null),'');
});
