const STOP=new Set('a an the i me my you your we our it its is are was were be been am to of in on at for and or but this that these those with from as now just'.split(' '));
export function normalizedLine(text){return String(text||'').replace(/\[[^\]]*\]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
export function repeatedLine(text,recent,{threshold=.72}={}){
 const normalized=normalizedLine(text);if(!normalized)return false;
 const words=normalized.split(' ').filter(w=>!STOP.has(w)),A=new Set(words);
 for(const line of recent||[]){const other=normalizedLine(line);if(!other)continue;if(normalized===other)return true;
  const B=new Set(other.split(' ').filter(w=>!STOP.has(w)));if(Math.min(A.size,B.size)<5)continue;
  let same=0;for(const word of A)if(B.has(word))same++;
  if(same/Math.max(A.size,B.size)>=threshold&&same/Math.min(A.size,B.size)>=.82)return true;
 }
 return false;
}
export function repeatedSpeech(text,recent,{freshPain=false}={}){
 const plain=normalizedLine(text),words=plain.split(' ');
 // A new blow can naturally produce the same brief reflexive plea. It is not
 // another iteration of a long project narration, and must not become silence.
 if(freshPain&&words.length<=8&&/\b(stop|please|hurt|hurts|ow|agh|aagh|argh|no|help)\b/.test(plain))return false;
 const goal=spokenGoal(text);
 if(goal&&(recent||[]).filter(line=>spokenGoal(line)===goal).length>=(goal==='begin-film-at-computer'?1:2))return true;
 return repeatedLine(text,recent)||repeatedSentences(text,recent,{freshPain}).length>0;
}
// A rolling, serializable history can be supplied by the caller across reloads.
// Keep the existing journal intact; selection and dedupe are read-only.
export function speechHistory(journal=[],extra=[],limit=256){
 const lines=[...journal.filter(j=>j.kind==='say').map(j=>j.text),...extra.map(j=>typeof j==='string'?j:j?.text)].filter(Boolean),chosen=[],seen=new Set();
 for(let i=lines.length-1;i>=0&&chosen.length<limit;i--){const line=String(lines[i]).slice(0,2000),key=normalizedLine(line);if(key&&!seen.has(key)){seen.add(key);chosen.push(line);}}
 return chosen.reverse();
}
function sentences(text){return String(text||'').match(/[^.!?]+(?:[.!?]+|$)/g)?.map(s=>s.trim()).filter(Boolean)||[];}
export function repeatedSentences(text,recent,{freshPain=false}={}){
 const prior=(recent||[]).slice(-256).flatMap(sentences),repeated=[];
 for(const sentence of sentences(text)){
  const plain=normalizedLine(sentence),words=plain.split(' ');
  if(words.length<6)continue;
  if(freshPain&&words.length<=8&&/\b(stop|please|hurt|hurts|ow|agh|aagh|argh|no|help)\b/.test(plain))continue;
  if(repeatedLine(sentence,prior,{threshold:.8}))repeated.push(sentence);
 }
 return repeated;
}
export function stripRepeatedSentences(text,recent,options={}){
 const duplicates=new Set(repeatedSentences(text,recent,options));
 return sentences(text).filter(s=>!duplicates.has(s)).join(' ').trim();
}
export function spokenGoal(text){
 const line=normalizedLine(text);
 if(/\b(going to|need to|will|must|have to|want to|moving|turning|face the|position)\b/.test(line)&&/\b(drawings?|chalk|south wall|bird story)\b/.test(line)&&/\b(photograph|photos?|pictures?|view|see|look|face)\b/.test(line))return 'reposition-to-see-or-photograph-artwork';
 if(/\b(?:going|go|move|moving)\b.{0,40}\b(?:table|computer)\b|\b(?:sit|sitting) at (?:the )?table\b|\bopen(?:ing)? (?:the )?(?:slopcannon|computer)\b/.test(line)&&/\b(film|video)\b/.test(line)&&!/\b(another film|different film|new film|another video|new video)\b/.test(line))return 'begin-film-at-computer';
 return '';
}
export function actionKey(action){
 const do_=String(action?.do||action?.action||'').toLowerCase().replace(/ /g,'_');
 if(do_==='mcp')return 'mcp:'+JSON.stringify([action.op||'list',action.tool||'',action.uri||'',action.arguments||{}]);
 const target=action?.target??action?.object??action?.on??'';
 const place=Array.isArray(target)?target.map(n=>Math.round(Number(n)*2)/2).join(','):normalizedLine(target).replace(/ /g,'_');
 // These aliases really enter the same Slopcannon handler. Group access failures
 // across them, but keep page controls and unrelated computer apps distinct.
 if(do_==='browser'||do_==='slopcannon'){
  const op=String(action.op||'open').toLowerCase();
  if(op==='open'||op==='inspect')return 'browser:access';
  return 'browser:'+op+':'+JSON.stringify([action.element??null,action.epoch??null,action.url??null,action.text??null,action.value??null,action.key??null,action.amount??null,action.media??null,action.x??null,action.y??null]);
 }
 const computer=/^(computer|crt|pc|monitor|screen|keyboard|terminal)$/.test(place);
 const how=String(action?.how||action?.mode||action?.manner||do_).toLowerCase();
 if(computer&&/^(use|open|play|play_with|interact)$/.test(do_)&&/slop|browser/.test(how+' '+(action.app||'')))return 'browser:access';
 if(/look_at|inspect/.test(do_))return 'view:'+place;
 if(do_==='walk_to')return 'walk:'+place;
 return do_==='turn'?'turn:'+Number(action.degrees??180):do_+':'+place+':'+normalizedLine(action?.how||'');
}
function actionFromEntry(entry){
 if(entry.action)return entry.action;
 const match=String(entry.text).match(/^(look at|walk to|inspect|turn)\s*(.*)$/i);if(!match)return null;
 const do_=match[1].replace(/ /g,'_'),raw=match[2].replace(/\s+\d+s$/,'');
 return {do:do_,target:raw.includes(',')&&raw.split(',').every(v=>Number.isFinite(Number(v)))?raw.split(',').map(Number):raw};
}
export function failedActions(journal=[],{supportedTargets=[]}={}){
 const failures=new Map(),supported=new Set(supportedTargets.map(t=>normalizedLine(t).replace(/ /g,'_')));let action=null,legacy=true;
 for(const entry of journal.slice(-60)){
  if(entry.kind==='act'){action=actionFromEntry(entry);legacy=!entry.action;continue;}
  if(entry.kind!=='result'||!(entry.action||action))continue;const key=actionKey(entry.action||action),text=String(entry.text||'');
  const failed=entry.success===false||/^Browser:|could not|cannot|can't|don't know|do not know|don't see|do not see|not reached|did not work|no route|blocked|not found/i.test(text);
  // Old saves predate wall/title target resolution. A capability upgrade permits
  // one real attempt at that now-supported target; actual blocked routes remain.
  const upgraded=legacy&&!entry.action&&supported.has(key.split(':').slice(1).join(':'))&&/don't know where|do not know where|look around.*(?:don't see|do not see)/i.test(text);
  const noMotion=(entry.action||action).do==='walk_to'&&entry.progress!=null&&entry.progress<.08&&entry.remaining>.25;
  if(upgraded)failures.delete(key);
  else if(failed||noMotion){const prev=failures.get(key);failures.set(key,{key,count:(prev?.count||0)+1,text});}
  else failures.delete(key);action=null;
 }
 return failures;
}
export function stagnantNavigation(journal=[]){
 const repeated=new Map();let action=null;
 for(const entry of journal.slice(-60)){
  if(entry.kind==='act'){action=actionFromEntry(entry);continue;}
  if(entry.kind!=='result'||!(entry.action||action))continue;const done=entry.action||action,key=actionKey(done);
  const failed=entry.success===false||/^Browser:|could not|don't know|don't see|not reached|blocked|failed/i.test(entry.text||'');
  if(entry.progress>.2){repeated.clear();action=null;continue;}
  if((done.do==='walk_to'||done.do==='turn')&&entry.progress!=null&&entry.progress<.08){const prior=repeated.get(key);repeated.set(key,{key,count:(prior?.count||0)+1,text:done.do==='walk_to'?'Repeated walking goal produced no meaningful displacement; you are already there or the route made no progress.':'Repeated turns in place without a successful observation or interaction.'});}
  else if(!failed&&!/^(walk_to|turn|wait|rest|idle|listen|pace)$/.test(done.do||''))repeated.clear();
  action=null;
 }
 return repeated;
}
export function blockedActions(journal=[],options={}){
 const blocked=new Map([...failedActions(journal,options)].filter(([,v])=>v.count>=2));
 for(const [key,value] of stagnantNavigation(journal))if(value.count>=(key.startsWith('turn:')?3:2))blocked.set(key,value);
 return blocked;
}
export function loopContext(journal=[],options={}){
 const failed=[...blockedActions(journal,options).values()];
 return failed.length?'REPEATED ATTEMPTS WITHOUT SUCCESS:\n'+failed.map(v=>`- ${v.key}, ${v.count} failed attempts. Last actual result: ${v.text}`).join('\n')+'\nRepeating a claim about a better view is not progress. A failed target needs a different supported target, vantage point or approach; verify the new result before claiming success. If the requested capability is unavailable, acknowledge it and choose another concrete step.':'';
}
export function decisionIssues(decision,{journal=[],recentSpeech=[],freshPain=false,supportedTargets=[]}={}){
 const issues=[],spoken=speechHistory(journal,recentSpeech);
 if(decision.say&&repeatedSpeech(decision.say,spoken,{freshPain}))issues.push('Your spoken line repeats what you already said. Respond in fresh words to the current event or develop a different concrete detail.');
 const thoughts=journal.filter(j=>j.kind==='thought').slice(-64).map(j=>j.text);
 if(decision.thought&&(repeatedLine(decision.thought,thoughts,{threshold:.83})||(!freshPain&&repeatedSentences(decision.thought,thoughts).length>0)))issues.push('Your thought repeats the same plan without a new observation or result. Reconsider what actually happened rather than restating your intention.');
 const memories=journal.filter(j=>j.kind==='note').slice(-64).map(j=>j.text);
 if(decision.remember&&(repeatedLine(decision.remember,memories,{threshold:.8})||repeatedSentences(decision.remember,memories).length>0))issues.push('Your proposed memory repeats an archived fact or self-instruction. Keep only a genuinely new fact, result or insight; leave remember empty if nothing new happened.');
 const failed=blockedActions(journal,{supportedTargets});
 for(const action of decision.actions||[]){const prior=failed.get(actionKey(action));if(prior?.count>=2)issues.push(`The action ${prior.key} has already failed ${prior.count} times: ${prior.text}. Change the target or approach; do not queue the same failed attempt.`);}
 return [...new Set(issues)];
}
export function variedMemory(notes=[],limit=8){
 const chosen=[];
 for(const note of [...notes].reverse()){
  const clean=sentences(note).filter(s=>!(/stop (?:the )?(?:turning|repositioning|talking|loop|repeating|explaining)|stop .*loop|operator.*(?:repeat|repetition)|\b\d+\s*(strikes?|hits?)\b/i.test(s))&&!/\b(?:i need to|time to|let me|i should|i must|i will|i am going to)\b/i.test(s)).join(' ').trim();
  if(clean&&!repeatedLine(clean,chosen,{threshold:.58}))chosen.push(clean);
  if(chosen.length===limit)break;
 }
 return chosen.reverse();
}
