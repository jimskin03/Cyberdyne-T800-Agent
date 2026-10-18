// Photograph existing canvas marks. The artwork pixels are copied, never regenerated.
export function artworkBounds(canvas, padding=32){
 const {width,height}=canvas,px=canvas.getContext('2d').getImageData(0,0,width,height).data;
 let x0=width,y0=height,x1=-1,y1=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(px[(y*width+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 if(x1<0)return null;
 x0=Math.max(0,x0-padding);y0=Math.max(0,y0-padding);x1=Math.min(width-1,x1+padding);y1=Math.min(height-1,y1+padding);
 return {x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
}

export function frameWallArtwork(surface,{border=30,mat=88}={}){
 const crop=artworkBounds(surface.canvas);if(!crop)throw new Error('This surface has no visible artwork yet.');
 const source=document.createElement('canvas');source.width=crop.width;source.height=crop.height;
 source.getContext('2d').drawImage(surface.canvas,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
 const framed=document.createElement('canvas');framed.width=crop.width+2*(border+mat);framed.height=crop.height+2*(border+mat);
 const c=framed.getContext('2d');
 c.fillStyle='#17191a';c.fillRect(0,0,framed.width,framed.height);
 c.fillStyle='#ece7dc';c.fillRect(border,border,framed.width-border*2,framed.height-border*2);
 const at=border+mat;c.fillStyle='#394039';c.fillRect(at-2,at-2,crop.width+4,crop.height+4);
 c.fillStyle='#70766b';c.fillRect(at,at,crop.width,crop.height);
 c.drawImage(source,at,at);
 return {source,framed,metadata:{kind:'direct wall canvas capture',surface:surface.id,surfaceName:surface.name,capturedAt:new Date().toISOString(),crop,sourceSize:{width:surface.canvas.width,height:surface.canvas.height},artworkPixelScale:1,borderPixels:border,matPixels:mat,marks:JSON.parse(JSON.stringify(surface.marks))}};
}

export function openArtworkPhotos(surfaces){
 if(!surfaces?.length)throw new Error('No wall drawings have been saved or painted yet.');
 document.getElementById('auction-photo-dialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='auction-photo-dialog';dialog.style.cssText='max-width:92vw;max-height:92vh;background:#17191a;color:#ece7dc;border:1px solid #777;padding:20px;overflow:auto';
 const heading=document.createElement('h2');heading.textContent='His original wall artwork';dialog.append(heading);
 const note=document.createElement('p');note.textContent='Exact painted pixels, with a simple frame. The transparent original and capture record are included below.';dialog.append(note);
 const select=document.createElement('select');select.style.cssText='max-width:78vw;display:block';select.setAttribute('aria-label','Artwork surface');for(const s of surfaces){const o=document.createElement('option');o.value=s.id;o.textContent=`${s.name}${s.marks.some(m=>m.title)?' — '+s.marks.filter(m=>m.title).map(m=>m.title).join('; '):''}`;select.append(o);}dialog.append(select);
 const preview=document.createElement('img');preview.alt='Framed original wall artwork';preview.style.cssText='display:block;max-width:78vw;max-height:65vh;margin:20px auto';dialog.append(preview);
 const links=document.createElement('div');links.style.cssText='display:flex;gap:24px;flex-wrap:wrap';dialog.append(links);
 function show(){const surface=surfaces.find(s=>s.id===select.value),capture=frameWallArtwork(surface),stamp=capture.metadata.capturedAt.replace(/[:.]/g,'-');preview.src=capture.framed.toDataURL('image/png');links.replaceChildren();
  for(const [label,data,ext]of[['Download framed PNG',preview.src,'framed.png'],['Download original pixels',capture.source.toDataURL('image/png'),'original.png'],['Download capture record','data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(capture.metadata,null,2)),'capture.json']]){const a=document.createElement('a');a.textContent=label;a.style.color='#b9dc9d';a.href=data;a.download=`wall-art-${surface.id}-${stamp}-${ext}`;links.append(a);}
 }
 select.addEventListener('change',show);const close=document.createElement('button');close.textContent='Close artwork photo';close.style.marginTop='20px';close.onclick=()=>{dialog.close();dialog.remove();};dialog.append(close);document.body.append(dialog);show();dialog.showModal();return dialog;
}
