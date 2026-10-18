// Geometry mirrors stored routes and associations; no inferred semantic edges.
export function networkLayout(graph){
 const items=[],edges=[],positions=new Map(),golden=Math.PI*(3-Math.sqrt(5));
 graph.pathways.forEach((p,i)=>{
  const y=1-2*(i+.5)/graph.pathways.length,r=Math.sqrt(1-y*y),angle=i*golden;
  const center=[3*r*Math.cos(angle),2.6*y,3*r*Math.sin(angle)];
  items.push({id:p.id,type:'pathway',json:p,position:center});positions.set(p.id,center);
  p.route.forEach((id,j)=>{
   if(positions.has(id))return;
   const a=j*2.4+i,position=[center[0]+Math.cos(a)*(.55+j*.055),center[1]+(j-(p.route.length-1)/2)*.25,center[2]+Math.sin(a)*(.55+j*.055)];
   positions.set(id,position);items.push({id,type:'memory',json:graph.nodes.find(n=>n.id===id),position});
  });
  p.route.forEach((id,j)=>edges.push({id:p.id+':'+j,path:p.id,a:j?p.route[j-1]:p.id,b:id,type:'route'}));
 });
 graph.nodes.filter(n=>!positions.has(n.id)).forEach((n,i)=>{const position=[Math.cos(i*golden)*4,0,Math.sin(i*golden)*4];items.push({id:n.id,type:'memory',json:n,position});positions.set(n.id,position);});
 graph.links.forEach((json,i)=>edges.push({id:'link:'+i,a:json[0],b:json[1],type:'association',json}));
 const hash=text=>{let h=[...text].reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);h=Math.imul(h^(h>>>16),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);return (h^(h>>>16))>>>0;};
 const random=(id,salt)=>(hash(id+salt)%100000)/100000;
 // This is a brain-shaped spatial arrangement of the JSON graph, not a claim
 // that biographical domains occupy these regions of a biological brain.
 for(const item of items){
  const n=item.json,domain=n.domain||item.id;
  item.region=/year-|anchor-year-|identity|era-/.test(item.id)?'timeline':
   /technology|school|work|making|world|history-|reception-|news-/.test(domain+' '+item.id)?'knowledge':
   /routine|places|park|culture|music|cinema|episode-/.test(domain+' '+item.id)?'everyday':'personal';
  const u=random(item.id,'u'),v=random(item.id,'v'),w=random(item.id,'w');
  if(item.region==='timeline'&&/year-|identity/.test(item.id)){
   const a=u*Math.PI*2,y=-2-v*1.3,r=.12+.37*(1-v);
   item.position=[.6+r*Math.cos(a),y,.2+r*Math.sin(a)];continue;
  }
  const azimuth=(item.region==='personal'?1.9:item.region==='knowledge'?-.5:item.region==='everyday'?3.8:1.2)+u*2.3;
  const latitude=Math.acos(1-2*v),shell=.77+.23*w;
  const fold=1+.045*Math.sin(latitude*13+azimuth*3)*Math.sin(azimuth*9);
  const x=3.3*Math.sin(latitude)*Math.cos(azimuth)*shell*fold;
  const y=2.25*Math.cos(latitude)*shell*fold+.25;
  const z=1.85*Math.sin(latitude)*Math.sin(azimuth)*shell*fold;
  item.position=[x,y-.22*Math.exp(-x*x/.12),z];
  if(item.region==='everyday'&&u<.28)item.position=[1.5+(u/.28-.5)*2.2,-1.65-.75*v,-.35+1.4*(w-.5)];
 }
 return {items,edges};
}
export function evidenceTrace(graph,evidence=[]){
 const ids=new Set(evidence);
 return {activated:[...ids].filter(id=>graph.nodes.some(n=>n.id===id)).map(id=>({id})),pathways:graph.pathways.filter(p=>p.route.every(id=>ids.has(id))).map(p=>({id:p.id,route:p.route.map(id=>({id}))}))};
}
export function replayRecallAt(record,time){
 if(!record)return null;
 for(let i=0;i<record.lines.length;i++){
  const line=record.lines[i];if(line.speaker!=='agent')continue;
  const question=record.lines[i-1],start=question?.speaker==='interviewer'?question.end:line.start;
  if(time>=start&&time<line.end)return {line,start,trace:line.memoryRecall||null,evidence:line.memoryEvidence||[]};
 }
 return null;
}
