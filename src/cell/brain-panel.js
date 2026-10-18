import {createJsonBrain} from './json-brain.js';
import {setupResponsiveUI} from './responsive-ui.js';
import {setupPanelMinimize} from './panel-minimize.js';
import {setupPanelDrag} from './panel-drag.js';
import './panel-drag.css';

function mount(){
 if(!window.__CELL?.lifeMemory)return;
 const brain=createJsonBrain({context:'cell'});
 brain.setMemory(window.__CELL.lifeMemory);
 window.__CELL.jsonBrain=brain;
 const owned=[setupResponsiveUI(brain.panel),setupPanelMinimize(brain.panel),setupPanelDrag(brain.panel)];
 let active=true,raf=null;
 function frame(time){if(!active)return;brain.update(time/1000);raf=requestAnimationFrame(frame);}
 function destroy(){
  if(!active)return;active=false;
  if(raf!=null)cancelAnimationFrame(raf);
  for(const owner of owned)owner?.destroy?.();
  removeEventListener('cell:destroy',destroy);
 }
 addEventListener('cell:destroy',destroy,{once:true});
 raf=requestAnimationFrame(frame);
}
if(window.__CELL)mount();else addEventListener('cell:ready',mount,{once:true});
