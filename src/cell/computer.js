// The T-800's computer: the apps he writes (every version kept, newest last) and his notes. Lives in localStorage.
const KEY='cell-public-cell.computer.v1';

const clean=n=>String(n||'').replace(/\s+/g,' ').trim().slice(0,40);
export function createComputer(){
 let db={apps:{},notes:[]};
 try{const j=JSON.parse(localStorage.getItem(KEY)||'null');if(j&&j.apps&&Array.isArray(j.notes))db=j;}catch{}
 const subs=new Set();
 function save(){ // Disk snapshots preserve every version even if the browser cache fills.
  try{localStorage.setItem(KEY,JSON.stringify(db));}catch{}
  subs.forEach(f=>f());}
 const find=name=>{const n=clean(name).toLowerCase();if(!n)return null;return Object.values(db.apps).find(a=>a.name.toLowerCase()===n)||null;};
 return {
  apps:()=>Object.values(db.apps).sort((a,b)=>b.updated-a.updated),
  notes:()=>[...db.notes].sort((a,b)=>b.t-a.t),
  app:find,
  saveApp(name,html,summary){name=clean(name)||'Untitled';const a=find(name)||(db.apps[name]={name,created:Date.now(),versions:[]});
   a.versions.push({html,summary:String(summary||'').slice(0,400),t:Date.now()});a.updated=Date.now();save();return a.versions.length;},
  saveNote(title,text){title=clean(title)||'Note';const n=db.notes.find(x=>x.title.toLowerCase()===title.toLowerCase());
   if(n){n.text=String(text||'').slice(0,4000);n.t=Date.now();}else db.notes.push({title,text:String(text||'').slice(0,4000),t:Date.now()});save();},
  summary(){const apps=this.apps().map(a=>`"${a.name}" (v${a.versions.length}: ${a.versions[a.versions.length-1].summary})`).join('; ');
   const notes=this.notes().slice(0,12).map(n=>`"${n.title}"`).join(', ');return `Local computer. apps: ${apps||'none yet'}. notes: ${notes||'none yet'}.`;},
  files(){return [...this.apps().map(a=>({kind:'app',name:a.name})),...this.notes().map(n=>({kind:'note',name:n.title}))];},
  onChange(f){subs.add(f);},
  export(){return JSON.parse(JSON.stringify(db));},
  restore(data){if(data?.apps&&Array.isArray(data.notes)){db=data;subs.forEach(f=>f());}},
 };
}
