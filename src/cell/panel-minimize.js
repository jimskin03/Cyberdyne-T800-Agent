import './panel-minimize.css';

export function setupPanelMinimize(memory){
 const cleanups=[];
 const mind=document.getElementById('mindpanel');
 const thoughts=document.getElementById('thought-row');
 const dialogue=document.getElementById('dialogue');
 const panels=[
  [memory,'JSON Brain',memory.querySelector('.jb-heading')],
  [mind,'Mind Stream',mind.querySelector('.panel-title')],
  [thoughts,'Thoughts',thoughts],
  [dialogue,'Dialogue',dialogue.querySelector(':scope > span')],
 ];
 for(const [panel,label,heading] of panels){
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
  button.addEventListener('click',click);
  cleanups.push(()=>{
   button.removeEventListener('click',click);button.remove();
   heading.classList.remove('minimize-heading');
   panel.classList.remove('minimizable-panel','panel-minimized');
  });
  heading.append(button);update(false);
 }
 return {destroy(){for(const cleanup of cleanups)cleanup();}};
}
