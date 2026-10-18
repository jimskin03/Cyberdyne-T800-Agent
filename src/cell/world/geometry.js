export function supportAt(position,rects=[],circles=[]){
 const {x,y,z}=position;
 const surface=rects.find(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1)||circles.find(c=>Math.hypot(x-c.x,z-c.z)<c.r);
 if(surface&&y>=surface.h-.05&&y<=surface.h+.3)return surface.id||'raised surface';
 return y>=-.05&&y<=.25?'floor':null;
}
