import './panel-minimize.css';

export function setupPanelMinimize(memory){
 const cleanups=[];
 const panels=[
  [memory,'JSON Brain','.jb-heading'],
  [document.getElementById('mindpanel'),'Mind Stream','.panel-title'],
  [document.getElementById('bottom'),'Conversation',null],
 ];
 for(const [panel,label,selector] of panels){
  let heading=selector?panel.querySelector(selector):null;
  if(!heading){
   heading=document.createElement('div');heading.className='panel-title conversation-heading';
   const title=document.createElement('span');title.textContent=label.toUpperCase();
   heading.append(title);panel.prepend(heading);
  }
  heading.classList.add('minimize-heading');
  panel.classList.add('minimizable-panel');
  const button=document.createElement('button');button.type='button';button.className='panel-minimize';
  button.setAttribute('aria-controls',panel.id);
  function update(minimized){
   panel.classList.toggle('panel-minimized',minimized);
   button.textContent=minimized?'+':'−';
   button.setAttribute('aria-expanded',String(!minimized));
   button.setAttribute('aria-label',(minimized?'Restore ':'Minimize ')+label);
   button.title=(minimized?'Restore ':'Minimize ')+label;
  }
  const click=()=>update(!panel.classList.contains('panel-minimized'));
  button.addEventListener('click',click);cleanups.push(()=>button.removeEventListener('click',click));
  heading.append(button);update(false);
 }
 return {destroy(){for(const cleanup of cleanups)cleanup();}};
}
