const bad=(status,error)=>({ok:false,status,error});
export function validateChatRequest(body,live){
 if(!body||typeof body!=='object'||Array.isArray(body))return bad(400,'Expected a JSON object.');
 if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>100||body.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||!(typeof m.content==='string'||Array.isArray(m.content))))return bad(400,'Invalid messages.');
 if(!['agent','vision','creative'].includes(body.model)||body.stream===true)return bad(400,'Unsupported model alias or streaming request.');
 if(body.max_tokens!==undefined&&(!Number.isInteger(body.max_tokens)||body.max_tokens<1||body.max_tokens>12000))return bad(400,'Invalid token limit.');
 if(body.temperature!==undefined&&(!Number.isFinite(body.temperature)||body.temperature<0||body.temperature>2))return bad(400,'Invalid temperature.');
 if(body.messages.some(m=>Array.isArray(m.content)&&m.content.some(part=>!part||!['text','image_url'].includes(part.type)||(part.type==='text'&&typeof part.text!=='string')||(part.type==='image_url'&&typeof part.image_url?.url!=='string'))))return bad(400,'Invalid content parts.');
 const hasImages=body.messages.some(m=>Array.isArray(m.content)&&m.content.some(part=>part?.type==='image_url'));
 if(hasImages&&!live.visionModel)return bad(400,'Configure API_VISION_MODEL for image requests.');
 const messages=body.messages.map(m=>({role:m.role,content:Array.isArray(m.content)&&!m.content.some(p=>p.type==='image_url')?m.content.map(p=>p.text).join('\n'):m.content}));
 const model=body.model==='vision'?(live.visionModel||live.textModel):body.model==='creative'?(live.creativeModel||live.visionModel||live.textModel):live.textModel;
 const payload={model,messages,stream:false};
 for(const field of ['max_tokens','temperature'])if(body[field]!==undefined)payload[field]=body[field];
 // OpenRouter's free router can select reasoning models. Preserve the app's
 // bounded reasoning preference using that service's supported wire format.
 if(body.effort==='low'&&live.endpoint&&new URL(live.endpoint).hostname==='openrouter.ai')payload.reasoning={effort:'low'};
 return {ok:true,payload};
}
