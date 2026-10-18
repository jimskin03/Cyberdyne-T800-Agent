export async function requestUpstream({live,payload,oauth,fetcher,signal,modeOf}){
 const headers={'content-type':'application/json'};
 const token=live.authMode==='oauth'?await oauth.accessToken():modeOf(live)==='api-key'?live.key:'';
 if(signal.aborted)throw Error('Request cancelled.');
 if(token)headers.authorization='Bearer '+token;
 const upstream=await fetcher(live.endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal,redirect:'error'});
 if(!upstream.ok){await upstream.body?.cancel();return {ok:false,error:'Provider request failed. Verify endpoint, credentials, models, and quota locally.'};}
 const chunks=[];let bytes=0;
 for await(const chunk of upstream.body){bytes+=chunk.length;if(bytes>2*1024*1024)return {ok:false,tooLarge:true,error:'Provider response is too large.'};chunks.push(chunk);}
 const text=Buffer.concat(chunks).toString('utf8');
 let data;try{data=JSON.parse(text);}catch{return {ok:false,error:'Provider did not return JSON.'};}
 const content=data.choices?.[0]?.message?.content;
 if(typeof content!=='string'||!content.trim())return {ok:false,error:'Provider response must contain choices[0].message.content as text.'};
 return {ok:true,content};
}
