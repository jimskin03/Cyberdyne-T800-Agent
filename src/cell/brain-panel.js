import {createJsonBrain} from './json-brain.js';
import {setupResponsiveUI} from './responsive-ui.js';
function mount(){if(!window.__CELL?.lifeMemory)return;const brain=createJsonBrain({context:'cell'});brain.setMemory(window.__CELL.lifeMemory);window.__CELL.jsonBrain=brain;setupResponsiveUI(brain.panel);function frame(time){brain.update(time/1000);requestAnimationFrame(frame);}requestAnimationFrame(frame);}
if(window.__CELL)mount();else addEventListener('cell:ready',mount,{once:true});
