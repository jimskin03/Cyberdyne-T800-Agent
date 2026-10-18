import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLifeMemory} from '../src/cell/life-memory.js';
import {networkLayout} from '../src/cell/memory-network.js';
try{
 const [filename='src/cell/default-brain.json',query='repair radio']=process.argv.slice(2);
 const graph=JSON.parse(await readFile(resolve(filename),'utf8'));
 const memory=createLifeMemory(graph),layout=networkLayout(graph),recall=memory.recall(query,{rehearse:false});
 if(layout.items.some(item=>!item.json||item.position.some(n=>!Number.isFinite(n))))throw Error('Invalid graph layout.');
 console.log(JSON.stringify({valid:true,graphId:graph.id,nodes:graph.nodes.length,pathways:graph.pathways.length,activatedIds:recall.activated.map(n=>n.id),recalledPathways:recall.pathways.map(p=>p.id)},null,2));
}catch{console.error('Brain validation failed. Check JSON syntax and the schema in docs/JSON-BRAIN.md. No private graph values were printed.');process.exitCode=1;}
