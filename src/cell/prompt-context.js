// Bounded prompt selection. Authored biography and observations stay in named
// sections; deduplication removes repeated text, never infers or merges facts.
export const INTERCOM_CONTEXT_CHARS=12000;
export const BACKGROUND_CONTEXT_CHARS=18000;
const budget=(value,fallback)=>Number.isFinite(value)?Math.max(0,Math.floor(value)):fallback;
const key=text=>text.replace(/\s+/g,' ').trim().toLowerCase();
const clip=(text,size)=>text.length<=size?text:size>1?text.slice(0,size-1)+'…':size?'…':'';
const label=value=>String(value||'Context').replace(/\s+/g,' ').trim().slice(0,80);
const defaultPriority=name=>/intercom|latest question|current question/i.test(name)?100:/current|observation|sensor/i.test(name)?80:0;

/** Highest priority sections enter first, with stable order for equal priority.
 * Pass the latest operator question as its own section, rather than embedding it
 * in an old transcript. maxChars includes all labels and separators.
 */
export function buildPromptContext(sections=[],{maxChars=BACKGROUND_CONTEXT_CHARS,sectionMaxChars=6000}={}){
 const total=budget(maxChars,BACKGROUND_CONTEXT_CHARS),perSection=budget(sectionMaxChars,6000),seen=new Set(),output=[];
 let used=0;
 const ordered=(Array.isArray(sections)?sections:[]).filter(s=>s&&typeof s.text==='string'&&s.text.trim()).map((s,index)=>({...s,index,name:label(s.name),priority:Number.isFinite(s.priority)?s.priority:defaultPriority(String(s.name||''))})).sort((a,b)=>b.priority-a.priority||a.index-b.index);
 for(const section of ordered){
  const heading='['+section.name+']\n',separator=output.length?'\n\n':'',available=total-used-heading.length-separator.length;
  if(available<=0)continue;
  const cap=Math.min(available,budget(section.maxChars,perSection));
  if(!cap)continue;
  const lines=[],accepted=[];let length=0;
  for(const raw of section.text.split(/\r?\n/)){
   const line=raw.trim(),identity=key(line);
   if(!identity||seen.has(identity)||accepted.includes(identity))continue;
   const remaining=cap-length-(lines.length?1:0);
   if(remaining<=0)break;
   const selected=clip(line,remaining);lines.push(selected);accepted.push(identity);length+=selected.length+(lines.length>1?1:0);
   if(selected.length<line.length)break;
  }
  if(!lines.length)continue;
  for(const identity of accepted)seen.add(identity);
  const block=separator+heading+lines.join('\n');output.push(block);used+=block.length;
 }
 return output.join('');
}

/** Select newest unique non-heartbeat journal records, then format oldest first.
 * Only kind and bounded text enter the prompt, without saved metadata payloads.
 */
export function recentContext(records=[],{limit=8,maxChars=4000,textMaxChars=600}={}){
 const count=budget(limit,8),total=budget(maxChars,4000),perText=budget(textMaxChars,600),seen=new Set(),selected=[];
 let used=0;
 if(!count||!total||!perText)return '';
 for(let i=(Array.isArray(records)?records.length:0)-1;i>=0&&selected.length<count;i--){
  const row=records[i];
  if(!row||row.kind==='heartbeat'||typeof row.text!=='string'||!row.text.trim())continue;
  const text=row.text.replace(/\s+/g,' ').trim(),identity=key(text);
  if(seen.has(identity))continue;
  const prefix='['+label(row.kind||'event')+'] ',remaining=total-used-prefix.length-(selected.length?1:0);
  if(remaining<=0)break;
  const line=prefix+clip(text,Math.min(perText,remaining));
  selected.unshift(line);seen.add(identity);used+=line.length+(selected.length>1?1:0);
 }
 return selected.join('\n');
}
