// Bounded, sub-stepped body flight. Impacts report speed before restitution.
export function stepFlight(state,dt,room,furniture=[]){
 const hits=[];let remaining=Math.min(.1,Math.max(0,dt));
 while(remaining>0){const h=Math.min(.012,remaining);remaining-=h;const previous={x:state.x,y:state.y,z:state.z};state.vy-=9.8*h;state.x+=state.vx*h;state.y+=state.vy*h;state.z+=state.vz*h;
  const impact=(axis,edge,sign)=>{const speed=Math.abs(state['v'+axis]);state[axis]=edge;state['v'+axis]=sign*speed*.38;if(speed>1)hits.push({kind:axis==='y'?'floor':'wall',speed});};
  if(state.x<room.x0+.3)impact('x',room.x0+.3,1);if(state.x>room.x1-.3)impact('x',room.x1-.3,-1);
  if(state.z<room.z0+.3)impact('z',room.z0+.3,1);if(state.z>room.z1-.3)impact('z',room.z1-.3,-1);
  if(state.y>room.h-.9){const before=hits.length;impact('y',room.h-.9,-1);if(hits.length>before)hits[hits.length-1].kind='ceiling';}
  let floor=.9;for(const f of furniture)if(state.x>f.x0-.15&&state.x<f.x1+.15&&state.z>f.z0-.15&&state.z<f.z1+.15){
   if(previous.y>=f.h+.85)floor=Math.max(floor,f.h+.9);
   else {const before=hits.length;if(previous.x<=f.x0-.15)impact('x',f.x0-.15,-1);else if(previous.x>=f.x1+.15)impact('x',f.x1+.15,1);else if(previous.z<=f.z0-.15)impact('z',f.z0-.15,-1);else if(previous.z>=f.z1+.15)impact('z',f.z1+.15,1);else floor=Math.max(floor,f.h+.9);for(let i=before;i<hits.length;i++)hits[i].kind=f.id||'furniture';}
  }
  if(state.y<floor){impact('y',floor,1);state.vx*=.82;state.vz*=.82;if(state.vy<.8)state.vy=0;}
  const drag=Math.exp(-h*(state.y<=floor+.01?4:.12));state.vx*=drag;state.vz*=drag;
  if(state.y<=floor+.01&&Math.hypot(state.vx,state.vy,state.vz)<.3){state.vx=state.vy=state.vz=0;state.settled=true;}
 }return hits;
}
