import './responsive-ui.css';

export function setupResponsiveUI(memory){
 const $=id=>document.getElementById(id);
 const compact=matchMedia('(max-width: 760px), (max-height: 500px)');
 const controls=$('lab'),start=$('start');
 const panels=[{name:'controls',panel:controls,button:$('controls-toggle')},{name:'memory',panel:memory,button:$('memory-toggle')}];
 memory.id='cell-memory';
 let opened=null;

 function showPanel(name,restoreFocus=false){
  const previous=panels.find(p=>p.name===opened);
  opened=name;
  for(const entry of panels){
   const open=entry.name===name;
   document.body.classList.toggle(entry.name+'-open',open);
   entry.button.setAttribute('aria-expanded',String(open));
  }
  if(name)panels.find(p=>p.name===name).panel.querySelector('.mobile-panel-close').focus();
  else if(restoreFocus)previous?.button.focus();
 }
 for(const entry of panels){
  const heading=document.createElement('div');heading.className='mobile-panel-heading';
  const title=document.createElement('b');title.textContent=entry.name==='controls'?'Operator controls':'Memory';
  const close=document.createElement('button');close.className='mobile-panel-close';close.textContent='Close';close.setAttribute('aria-label','Close '+entry.name);
  close.onclick=()=>showPanel(null,true);entry.close=close;entry.heading=heading;heading.append(title,close);entry.panel.prepend(heading);
  entry.button.onclick=()=>showPanel(opened===entry.name?null:entry.name);
 }
 const controlsClick=event=>{
  if(compact.matches&&event.target.closest('.tool, #grapple'))showPanel(null,true);
 };
 const escapeKey=event=>{if(event.key==='Escape'&&opened){event.preventDefault();showPanel(null,true);}};
 const compactChange=()=>showPanel(null);
 controls.addEventListener('click',controlsClick);
 addEventListener('keydown',escapeKey);
 compact.addEventListener('change',compactChange);

 // Keep the scene out of the welcome dialog's tab order as well as its visual layer.
 const background=[...document.body.children].filter(el=>el!==start&&el.id!=='fatal'&&el.tagName!=='SCRIPT');
 function syncStart(){
  const active=!start.classList.contains('gone');
  document.body.classList.toggle('feed-started',!active);
  for(const el of background)el.inert=active;
 }
 const startObserver=new MutationObserver(syncStart);startObserver.observe(start,{attributes:true,attributeFilter:['class']});
 syncStart();
 if(!start.classList.contains('gone'))$('go').focus({preventScroll:true});
 const bodyObserver=new MutationObserver(()=>{
  if(opened&&['clean','pc-open','berserker-mode'].some(name=>document.body.classList.contains(name)))showPanel(null);
 });bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

 // Wrapped status text and the phone keyboard can both change the space available.
 const root=document.documentElement;
 const updateTop=()=>root.style.setProperty('--compact-top',Math.ceil(document.querySelector('.topline').getBoundingClientRect().bottom+8)+'px');
 const topObserver=new ResizeObserver(updateTop);topObserver.observe(document.querySelector('.topline'));
 const updateViewport=()=>{
  const viewport=window.visualViewport;
  root.style.setProperty('--ui-bottom',Math.max(0,innerHeight-(viewport?viewport.height+viewport.offsetTop:innerHeight))+'px');
 };
 window.visualViewport?.addEventListener('resize',updateViewport);
 window.visualViewport?.addEventListener('scroll',updateViewport);
 addEventListener('resize',updateViewport);updateTop();updateViewport();
 return {destroy(){
  startObserver.disconnect();bodyObserver.disconnect();topObserver.disconnect();controls.removeEventListener('click',controlsClick);removeEventListener('keydown',escapeKey);compact.removeEventListener('change',compactChange);window.visualViewport?.removeEventListener('resize',updateViewport);window.visualViewport?.removeEventListener('scroll',updateViewport);removeEventListener('resize',updateViewport);
  for(const entry of panels){entry.button.onclick=null;entry.close.onclick=null;entry.heading.remove();}
 }};
}
