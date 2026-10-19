import {requestErrorMessage} from '../../src/cell/ai/request-errors.js';

function failure(code,extra={}){
 return {ok:false,code,error:requestErrorMessage(code),...extra};
}
function providerFailure(status,error){
 const type=error?.metadata?.error_type||error?.code||error?.type;
 const typed={
  authentication:'provider_authentication','invalid_api_key':'provider_authentication',
  payment_required:'provider_payment_required',insufficient_quota:'provider_payment_required',
  permission_denied:'provider_permission_denied',
  not_found:'provider_model_unavailable',model_not_found:'provider_model_unavailable',
  rate_limit_exceeded:'provider_rate_limited',
  context_length_exceeded:'provider_context_limit',string_too_long:'provider_context_limit',
  max_tokens_exceeded:'provider_output_limit',token_limit_exceeded:'provider_output_limit',
  content_policy_violation:'provider_content_policy',refusal:'provider_content_policy',
  provider_overloaded:'provider_unavailable',provider_unavailable:'provider_unavailable',
  timeout:'provider_timeout',invalid_request:'provider_invalid_request',invalid_prompt:'provider_invalid_request',
 };
 const code=typeof type==='string'&&Object.hasOwn(typed,type)?typed[type]:
  status===401?'provider_authentication':status===402?'provider_payment_required':
  status===403?'provider_permission_denied':status===404?'provider_model_unavailable':
  status===429?'provider_rate_limited':status===408||status===504?'provider_timeout':
  status===400||status===413||status===422?'provider_invalid_request':
  status>=500?'provider_unavailable':'provider_request_failed';
 return failure(code);
}

export async function requestUpstream({live,payload,oauth,fetcher,signal,modeOf}){
 const headers={'content-type':'application/json'};
 const token=live.authMode==='oauth'?await oauth.accessToken():modeOf(live)==='api-key'?live.key:'';
 if(signal.aborted)throw Error('Request cancelled.');
 if(token)headers.authorization='Bearer '+token;
 const upstream=await fetcher(live.endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal,redirect:'error'});
 const chunks=[];let bytes=0;
 if(upstream.body)for await(const chunk of upstream.body){bytes+=chunk.length;if(bytes>2*1024*1024)return failure('provider_response_too_large',{tooLarge:true});chunks.push(chunk);}
 const text=Buffer.concat(chunks).toString('utf8');
 let data;try{data=JSON.parse(text);}catch{}
 const choice=data?.choices?.[0],error=data?.error||choice?.error;
 // Some providers commit HTTP 200 before generation fails. Never accept partial
 // output alongside an error as a completed decision.
 if(!upstream.ok||error||choice?.finish_reason==='error'){
  const code=typeof error?.code==='number'||typeof error?.code==='string'?Number(error.code):0;
  return providerFailure(upstream.ok&&Number.isInteger(code)&&code>=400&&code<=599?code:upstream.status,error);
 }
 if(!data||typeof data!=='object')return failure('provider_invalid_response');
 if(choice?.finish_reason==='content_filter'||choice?.message?.refusal)return failure('provider_content_policy');
 const content=choice?.message?.content;
 if(typeof content!=='string'||!content.trim())return failure(choice?.finish_reason==='length'?'provider_output_limit':'provider_empty_response');
 return {ok:true,content};
}
