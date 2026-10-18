// Visibility graph with exact swept-circle clearance against fixed cell furniture.
export function createNavigation(room,rectangles=[],circles=[],radius=.27){
 const pad=radius;
 const rects=rectangles.map(r=>({...r,x0:r.x0-pad,x1:r.x1+pad,z0:r.z0-pad,z1:r.z1+pad}));
 const disks=circles.map(c=>({...c,r:c.r+pad}));
 const inside=(x,z)=>Number.isFinite(x)&&Number.isFinite(z)&&x>=room.x0+pad&&x<=room.x1-pad&&z>=room.z0+pad&&z<=room.z1-pad;
 const blocked=(x,z)=>!inside(x,z)||rects.some(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1)||disks.some(c=>(x-c.x)**2+(z-c.z)**2<c.r*c.r);
 function segmentClear(a,b){if(blocked(...a)||blocked(...b))return false;const dx=b[0]-a[0],dz=b[1]-a[1];
  for(const r of rects){let lo=0,hi=1;for(const[p,d,min,max]of [[a[0],dx,r.x0,r.x1],[a[1],dz,r.z0,r.z1]]){if(Math.abs(d)<1e-10){if(p<=min||p>=max){hi=-1;break;}}else{const t0=(min-p)/d,t1=(max-p)/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));}}if(hi>lo+1e-9&&hi>0&&lo<1)return false;}
  const length=dx*dx+dz*dz;for(const c of disks){const t=length?Math.max(0,Math.min(1,((c.x-a[0])*dx+(c.z-a[1])*dz)/length)):0;if((a[0]+dx*t-c.x)**2+(a[1]+dz*t-c.z)**2<c.r*c.r-1e-10)return false;}return true;
 }
 const vertices=[];for(const r of rects)for(const x of [r.x0-.008,r.x1+.008])for(const z of [r.z0-.008,r.z1+.008])if(!blocked(x,z))vertices.push([x,z]);
 for(const c of disks){const n=24,rr=(c.r+.01)/Math.cos(Math.PI/n);for(let i=0;i<n;i++){const p=[c.x+Math.cos(i*2*Math.PI/n)*rr,c.z+Math.sin(i*2*Math.PI/n)*rr];if(!blocked(...p))vertices.push(p);}}
 function closestFree(x,z){if(!Number.isFinite(x)||!Number.isFinite(z))return null;x=Math.max(room.x0+pad,Math.min(room.x1-pad,x));z=Math.max(room.z0+pad,Math.min(room.z1-pad,z));if(!blocked(x,z))return[x,z];for(let r=.025;r<6;r+=.025)for(let i=0;i<48;i++){const p=[x+Math.cos(i*Math.PI/24)*r,z+Math.sin(i*Math.PI/24)*r];if(!blocked(...p))return p;}return null;}
 function route(start,requested){const goal=closestFree(...requested);if(!goal)return {status:'failed',reason:'no free standing space exists',goal:null,path:[]};if(blocked(...start))return {status:'failed',reason:'your current position is inside a fixed obstacle; stand up or recover onto open floor first',goal,path:[]};if(segmentClear(start,goal))return {status:'moving',goal,path:[goal],length:Math.hypot(goal[0]-start[0],goal[1]-start[1])};
  const points=[start,goal,...vertices],dist=points.map(()=>Infinity),prev=points.map(()=>-1),visited=new Set();dist[0]=0;
  while(visited.size<points.length){let at=-1;for(let i=0;i<points.length;i++)if(!visited.has(i)&&(at<0||dist[i]<dist[at]))at=i;if(at<0||!Number.isFinite(dist[at]))break;if(at===1)break;visited.add(at);for(let to=0;to<points.length;to++)if(!visited.has(to)&&to!==at&&segmentClear(points[at],points[to])){const cost=dist[at]+Math.hypot(points[to][0]-points[at][0],points[to][1]-points[at][1]);if(cost<dist[to]){dist[to]=cost;prev[to]=at;}}}
  if(!Number.isFinite(dist[1]))return {status:'failed',reason:'fixed furniture blocks every collision-free route to that standing point',goal,path:[]};const path=[];for(let at=1;at!==0;at=prev[at]){if(at<0)return {status:'failed',reason:'route reconstruction failed',goal,path:[]};path.unshift(points[at]);}return {status:'moving',goal,path,length:dist[1]};
 }
 return {blocked,segmentClear,closestFree,route,radius:pad};
}
