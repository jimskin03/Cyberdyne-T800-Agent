// Calendar-first, bounded retrieval. Reconstruction is a response-time operation;
// it never writes invented details back into the canonical graph.
const ignored=new Set('a an the is are was were i my me you your he his it of to in at on and or with for from about remember memory memories tell what when how life day years old where did do can could would more then that there those exactly please really have had like period'.split(' '));
const tokens=text=>[...new Set(String(text).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').match(/[a-z0-9]+/g)||[])].filter(w=>w.length>2&&!ignored.has(w)&&!/^\d+$/.test(w)).map(w=>w.length>4&&w.endsWith('s')?w.slice(0,-1):w);
const overlaps=(p,year)=>year==null||!p.years||p.years[0]<=year&&p.years[1]>=year;
const followPattern=/\b(more|deeper|detail|then|that year|back then|that house|that school|what else|go on|tell me about it|which games|what games)\b/i;
export function validateHierarchy(graph){
 if(graph.recallModel!=='hierarchical-v2')return;
 const b=graph.biography,birth=Date.parse(b?.dateOfBirth),end=Date.parse(b?.asOf);
 if(!Number.isFinite(birth)||!Number.isFinite(end)||birth>end)throw Error('Invalid biography dates');
 const birthYear=Number(b.dateOfBirth.slice(0,4)),endYear=Number(b.asOf.slice(0,4));
 if(!Array.isArray(graph.eras)||graph.eras.some(e=>!e||typeof e.id!=='string'||!e.id||!Array.isArray(e.years)||e.years.length!==2||e.years.some(y=>!Number.isInteger(y))||e.years[0]<birthYear||e.years[1]>endYear||e.years[0]>e.years[1])||new Set(graph.eras.map(e=>e.id)).size!==graph.eras.length)throw Error('Invalid biography eras');
 const age=endYear-birthYear-(b.asOf.slice(5)<b.dateOfBirth.slice(5)?1:0);
 if(age!==graph.age)throw Error('Biography age does not match dates');
 for(const item of [...graph.nodes,...graph.pathways]){
  if(!Array.isArray(item.years)||item.years.length!==2||item.years.some(y=>!Number.isInteger(y))||item.years[0]<birthYear||item.years[1]>endYear||item.years[0]>item.years[1])throw Error('Invalid calendar range '+item.id);
 }
 for(const n of graph.nodes)if(!Number.isInteger(n.depth)||n.depth<0||n.depth>3)throw Error('Invalid recall depth '+n.id);
 const years=new Set(graph.pathways.filter(p=>p.id==='year-'+p.years[0]&&p.years[0]===p.years[1]).map(p=>p.years[0]));
 for(let year=birthYear;year<=endYear;year++)if(!years.has(year))throw Error('Missing calendar anchor '+year);
}

export function createHierarchicalRecall(graph){
 const nodes=new Map(graph.nodes.map(n=>[n.id,n])),paths=new Map(graph.pathways.map(p=>[p.id,p]));
 const documents=graph.pathways.map(p=>({p,cues:new Set(tokens(p.cues.join(' '))),words:new Set(tokens(p.route.map(id=>nodes.get(id).fact).join(' ')))}));
 let focus=null;
 function reset(){focus=null;}
 function recall(query,{depth,conversation=true,maxNodes=24,maxChars=8500,_range=false}={}){
  query=String(query).slice(0,4000);const terms=tokens(query),lower=query.toLowerCase();
  const range=!_range&&query.match(/\b((?:19|20)\d{2})\s*(?:through|to|until|and|[-\u2013])\s*((?:19|20)\d{2})\b/i);
  if(range&&Number(range[1])<Number(range[2])){
   const start=Number(range[1]),end=Number(range[2]),years=[...new Set([start,...graph.eras.map(e=>e.years[0]).filter(y=>y>start&&y<end),end])].slice(0,10);
   const parts=years.map(year=>recall(query.replace(range[0],String(year)),{depth,conversation:false,maxNodes:12,maxChars:4000,_range:true}));
   const activated=[...new Map(parts.flatMap(r=>r.activated).map(n=>[n.id,n])).values()].slice(0,40),allowed=new Set(activated.map(n=>n.id));
   const pathways=[...new Map(parts.flatMap(r=>r.pathways).map(p=>[p.id,{...p,route:p.route.filter(n=>allowed.has(n.id))}])).values()].filter(p=>p.route.length);
   const nextFocus={year:end,years:[start,end],depth:depth??2,domain:parts.at(-1)?.focus.domain};if(conversation)focus=nextFocus;
   return {query,activated,pathways,focus:nextFocus,reconstruction:{status:'multiple-periods',allowed:true,basis:[...allowed]},prompt:`SIMULATED AUTOBIOGRAPHY: ${graph.person}, born ${graph.biography.dateOfBirth}. Comparing ${start} through ${end}.\n`+activated.map(n=>`[${n.id}; ${n.years.join('-')}; ${n.certainty}] ${n.fact}`).join('\n')+'\nRECONSTRUCTION: '+(parts[0].prompt.split('RECONSTRUCTION: ')[1]||'Use the dated anchors. Do not invent missing events or exact details. Mark guesses as guesses.')};
  }
  const explicitYear=query.match(/\b(?:18|19|20)\d{2}\b/),ageMatch=query.match(/\b(?:age[d]?|at|turned|turning|you were|I was)\s+(\d{1,2})\b/i);
  const decade=query.match(/\b(?:the\s+)?(90s|1990s|2000s|2010s|2020s)\b/i);
  let year=explicitYear?Number(explicitYear[0]):ageMatch?Number(graph.biography.dateOfBirth.slice(0,4))+Number(ageMatch[1]):decade?({'90s':1997,'1990s':1997,'2000s':2005,'2010s':2015,'2020s':2023}[decade[1].toLowerCase()]):null;
  if(/9\/11|\b911\b|september (?:11|eleven)/i.test(query)&&!explicitYear)year=2001;
  if(year==null){const born=Number(graph.biography.dateOfBirth.slice(0,4));
   if(/\b(childhood|growing up|grew up|as a kid)\b/i.test(query))year=born+8;
   else if(/\bmiddle school\b/i.test(query))year=born+12;
   else if(/\b(high school|teenager|teenage)\b/i.test(query))year=born+16;
   else if(/\bcollege\b/i.test(query))year=born+19;
   else if(/\b(now|today|currently|these days)\b/i.test(query))year=Number(graph.biography.asOf.slice(0,4));
  }
  const namedEvent=documents.find(({p})=>p.id.startsWith('news-')&&terms.includes(p.id.slice(5)));
  if(year==null&&namedEvent)year=namedEvent.p.years[0];
  const newPeriod=/\b(now|today|currently|these days|childhood|teenage|adult|college|pandemic|9\/11|september)\b/i.test(query);
  const globalTopic=documents.filter(({p})=>p.tier===1&&p.domain).map(({p,cues})=>({domain:p.domain,score:terms.filter(t=>cues.has(t)).length})).sort((a,b)=>b.score-a.score)[0];
  const explicitFollow=followPattern.test(query),topicShift=!explicitFollow&&(/\bwhen\b|\bwhat happened\b|\bfirst smartphone\b/i.test(query)||globalTopic?.score>=2&&focus?.domain&&globalTopic.domain!==focus.domain);
  const follow=conversation&&!!focus&&!topicShift&&(!namedEvent||year===focus.year)&&(explicitFollow||!explicitYear&&!ageMatch&&!decade&&!newPeriod&&focus.year!=null),prior=focus;
  if(year==null&&follow)year=prior.year;
  const minimum=Number(graph.biography.dateOfBirth.slice(0,4)),maximum=Number(graph.biography.asOf.slice(0,4));
  if(year!=null&&(year<minimum||year>maximum))return {query,pathways:[],activated:[],focus:{year,depth:0},reconstruction:{status:'outside-biography'},prompt:`SIMULATED AUTOBIOGRAPHY: born ${graph.biography.dateOfBirth}; biography ends ${graph.biography.asOf}. ${year} is outside the recorded life. Do not claim a personal memory from that year. General historical knowledge may be discussed as knowledge.`};
  let scored=documents.filter(({p})=>p.tier!==0&&overlaps(p,year)).map(({p,cues,words})=>({p,score:terms.reduce((sum,t)=>sum+(cues.has(t)?6:words.has(t)?1:0),0)+(p.id.startsWith('news-')&&(/9\/11|\b911\b/.test(lower))&&p.id.includes('september11')?30:0)})).filter(n=>n.score>0).sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id));
  // Directly cued historical events supply their time anchor when the question did not.
  if(year==null&&scored[0]?.p.id.startsWith('news-'))year=scored[0].p.years[0];
  if(year!=null)scored=scored.filter(({p})=>overlaps(p,year));
  const broad=/\b(where|living|lived|how old|background|overview)\b/i.test(query)||terms.length===0;
  const eventQuestion=scored[0]?.p.id.startsWith('news-');
  const explicitDepth=Number.isInteger(depth)?Math.max(0,Math.min(3,depth)):null;
  const targetDepth=explicitDepth??(eventQuestion?2:follow&&(!explicitYear||year===prior.year)?Math.min(3,Math.max(terms.length?2:0,prior.depth+1)):broad?0:2);
  let domain=scored.find(n=>n.p.domain)?.p.domain||(follow?prior.domain:null)||(broad?'home':null);
  const selected=[];function add(p){if(p&&!selected.some(n=>n.id===p.id))selected.push(p);}
  const identity=paths.get('identity');
  if(/born|birth|\bdob\b|how old|background|who are/i.test(query))add(identity);
  if(year!=null)add(paths.get('year-'+year));
  if(targetDepth>0){
   if(follow&&domain&&!scored.some(n=>n.p.domain===domain)){
    const era=graph.eras.find(e=>overlaps(e,year));add(paths.get(era?.id+'-'+domain));
   }
   for(const {p} of scored.filter(n=>n.p.tier!==2).slice(0,3))add(p);
   // A recently established habit can inform a later approximation. Its original
   // dates remain attached so the model cannot turn it into a new dated event.
   if(targetDepth>=2&&year!=null&&['technology','culture','friends'].includes(domain)){
    const earlier=documents.filter(({p})=>p.domain===domain&&p.years[1]<year&&p.years[1]>=year-6)
     .map(({p,cues,words})=>({p,score:terms.reduce((sum,t)=>sum+(cues.has(t)?6:words.has(t)?1:0),0)}))
     .filter(n=>n.score>0).sort((a,b)=>b.score-a.score||b.p.years[1]-a.p.years[1]);
    add(earlier[0]?.p);
   }
   if(year!=null&&selected.length<3){const era=graph.eras.find(e=>overlaps(e,year));add(paths.get(era?.id+'-'+(domain||'routines')));}
   if(follow&&terms.length===0&&year!=null){const era=graph.eras.find(e=>overlaps(e,year));add(paths.get('era-'+era?.id));}
   if(targetDepth>=2&&year!=null){
    const episodes=graph.pathways.filter(p=>p.tier===2&&overlaps(p,year));
    const month=query.toLowerCase().match(/january|february|march|april|may|june|july|august|september|october|november|december/);
    const monthSeason=month?({january:'winter',february:'winter',march:'spring',april:'spring',may:'spring',june:'summer',july:'summer',august:'summer',september:'autumn',october:'autumn',november:'autumn',december:'winter'}[month[0]]):null;
    const named=episodes.filter(p=>monthSeason?p.cues.includes(monthSeason):terms.some(t=>p.cues.includes(t)));
    for(const p of (named.length?named:episodes).slice(0,targetDepth===3?3:1))add(p);
   }
  }
  if(!selected.length&&scored.length)add(scored[0].p);
  if(!selected.length){add(identity);const p=paths.get('year-'+(year??maximum));add(p);domain=null;}
  const limit=Math.max(4,Math.min(40,Number(maxNodes)||24)),charLimit=Math.max(1500,Math.min(14000,Number(maxChars)||8500));
  const activated=[],traces=[];const seen=new Set();let size=0;
  for(const p of selected){
   const route=[];
   for(const id of p.route){
    const n=nodes.get(id);if(year!=null&&n.years[0]>year||p.tier!==0&&n.depth>targetDepth)continue;
    if(!seen.has(id)&&(activated.length>=limit||size+n.fact.length+180>charLimit))continue;
    const patch={...n,signal:Math.round((1-traces.length*.09)*1000)/1000,fragments:n.strength>=.5?n.fragments||[]:[]};
    route.push(patch);if(!seen.has(id)){seen.add(id);activated.push(patch);size+=n.fact.length+180;}
   }
   if(route.length){const from=traces.find(t=>graph.links.some(([a,b])=>a===t.id&&b===p.id||a===p.id&&b===t.id))?.id||null;traces.push({id:p.id,from,activation:Math.max(.3,1-traces.length*.09),route});}
  }
  const nextFocus={year,depth:targetDepth,domain};if(conversation)focus=nextFocus;
  const unknowns=[...new Set(selected.flatMap(p=>p.unknowns||[]))].slice(0,6);
  const prompt=`SIMULATED AUTOBIOGRAPHY — ${graph.person}; born ${graph.biography.dateOfBirth}, ${graph.biography.birthplace}. Biography as of ${graph.biography.asOf}, age ${graph.age}. Authored past, not current people or sensor evidence.\nRECALL: ${year??'topic search'}; depth ${targetDepth}/3.\n`+
   activated.map(n=>`[${n.id}; ${n.years.join('–')}; ${n.certainty}; ${n.kind}] ${n.fact}${n.fragments.length?' | '+n.fragments.join('; '):''}`).join('\n')+
   '\nRECONSTRUCTION: Answer the question using these anchors, then combine compatible routines and fragments when a scene is incomplete. You may offer a plausible mundane approximation with language such as "probably", "I think", or "that would usually mean". Separate firm facts, remembered impressions, and what you are piecing together. A composite is a recurring pattern, not a documented single event. Never contradict dates, residences or relationships; do not invent exact dialogue, named people, major events or device ownership. Historical knowledge can explain the period without becoming personal eyewitness memory. Before age four, use family stories. Do not claim that inferred details have been retrieved or saved.'+
   '\nSpeak naturally and answer directly. Use proportionate uncertainty such as "I think" for an approximation; do not begin with labels like "Firmly" or recite memory metadata. Avoid repeating a disclaimer in every sentence.'+
   (unknowns.length?'\nKNOWN GAPS: '+unknowns.join('; '):'')+
   (targetDepth<3?'\nFurther questions can retrieve additional fragments within this same period.':'');
  return {query,pathways:traces,activated,prompt,focus:nextFocus,reconstruction:{status:scored.length?'grounded':'broad-context',basis:activated.map(n=>n.id),unknowns,allowed:true}};
 }
 return {recall,reset,get focus(){return focus;}};
}
