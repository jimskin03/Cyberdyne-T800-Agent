export function clampPanelPosition(x,y,width,height,viewportWidth,viewportHeight){
 const margin=12;
 return {
  x:Math.max(margin,Math.min(x,viewportWidth-width-margin)),
  y:Math.max(margin,Math.min(y,viewportHeight-height-margin)),
 };
}

export function setupPanelDrag(panel){
 const heading=panel.querySelector('.jb-heading');
 const compact=matchMedia('(max-width:760px), (max-height:500px)');
 let gesture=null,position=null;
 heading.classList.add('panel-drag-handle');
 heading.setAttribute('role','group');
 heading.title='Hold and drag to move. Arrow keys move; Home resets the position.';

 function place(x,y){
  const rect=panel.getBoundingClientRect();
  position=clampPanelPosition(x,y,rect.width,rect.height,innerWidth,innerHeight);
  panel.style.setProperty('--panel-x',position.x+'px');
  panel.style.setProperty('--panel-y',position.y+'px');
  panel.classList.add('panel-positioned');
 }
 function finish(){
  if(!gesture)return;
  clearTimeout(gesture.timer);
  const id=gesture.id;gesture=null;
  panel.classList.remove('panel-dragging');
  if(heading.hasPointerCapture(id))heading.releasePointerCapture(id);
 }
 function reset(){
  finish();position=null;
  panel.classList.remove('panel-positioned');
  panel.style.removeProperty('--panel-x');panel.style.removeProperty('--panel-y');
 }
 const pointerDown=event=>{
  if(compact.matches||gesture||!event.isPrimary||event.button!==0||event.target.closest('button,select,input,a'))return;
  const rect=panel.getBoundingClientRect();
  const current={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,active:false};
  gesture=current;
  heading.setPointerCapture(event.pointerId);
  current.timer=setTimeout(()=>{
   if(gesture!==current)return;
   current.active=true;place(current.left,current.top);panel.classList.add('panel-dragging');
  },350);
 };
 const pointerMove=event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(!gesture.active){if(Math.hypot(dx,dy)>6)finish();return;}
  event.preventDefault();place(gesture.left+dx,gesture.top+dy);
 };
 const keyDown=event=>{
  if(compact.matches||event.target!==heading)return;
  if(event.key==='Home'){event.preventDefault();reset();return;}
  const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
  if(!direction)return;
  event.preventDefault();const rect=panel.getBoundingClientRect(),step=event.shiftKey?5:20;
  place(rect.left+direction[0]*step,rect.top+direction[1]*step);
 };
 const escapeKey=event=>{if(event.key==='Escape')finish();};
 const resize=()=>{finish();if(position&&!compact.matches)place(position.x,position.y);};
 const observedResize=()=>{if(position&&!compact.matches)place(position.x,position.y);};
 function syncLayout(){reset();heading.tabIndex=compact.matches?-1:0;}

 heading.addEventListener('pointerdown',pointerDown);
 heading.addEventListener('pointermove',pointerMove);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])heading.addEventListener(name,finish);
 heading.addEventListener('keydown',keyDown);
 addEventListener('keydown',escapeKey);
 addEventListener('blur',finish);
 addEventListener('resize',resize);
 const resizeObserver=new ResizeObserver(observedResize);resizeObserver.observe(panel);
 compact.addEventListener('change',syncLayout);syncLayout();

 return {destroy(){
  finish();resizeObserver.disconnect();compact.removeEventListener('change',syncLayout);
  heading.removeEventListener('pointerdown',pointerDown);heading.removeEventListener('pointermove',pointerMove);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])heading.removeEventListener(name,finish);
  heading.removeEventListener('keydown',keyDown);removeEventListener('keydown',escapeKey);removeEventListener('blur',finish);removeEventListener('resize',resize);
 }};
}
