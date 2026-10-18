import {cleanModel} from './config.mjs';

export async function requestModels({live,fetcher,signal}){
 const headers={accept:'application/json'};
 if(live.key)headers.authorization='Bearer '+live.key;
 const endpoint=live.endpoint.replace(/\/chat\/completions$/,'/models');
 const response=await fetcher(endpoint,{method:'GET',headers,signal,redirect:'error'});
 if(!response.ok){
  await response.body?.cancel();
  const error=response.status===401||response.status===403?'Model fetch rejected. Check the API key.':response.status===404?'This service does not offer model discovery. Enter a model ID manually.':'Model fetch failed. Check the endpoint or try again later.';
  throw Object.assign(Error(error),{status:502});
 }
 const chunks=[];let bytes=0;
 for await(const chunk of response.body){
  bytes+=chunk.length;
  if(bytes>2*1024*1024)throw Object.assign(Error('Model list is too large.'),{status:502});
  chunks.push(chunk);
 }
 let data;
 try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{}
 if(!Array.isArray(data?.data))throw Object.assign(Error('Service did not return a model list. Enter a model ID manually.'),{status:502});
 const models=[...new Set(data.data.flatMap(model=>{
  try{return [cleanModel(model?.id,'Invalid model ID.')];}catch{return [];}
 }))].sort().slice(0,2000);
 return {models};
}
