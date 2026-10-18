export const ACTION_STATUSES=Object.freeze(['completed','blocked','unavailable','cancelled','failed']);
const VALID=new Set(ACTION_STATUSES);
export function actionResult(status,text='',details={}){
  if(!VALID.has(status))throw new TypeError(`Invalid action status: ${status}`);
  return {status,text:String(text||''),...details};
}
export function completed(text,details){return actionResult('completed',text,details);}
export function blocked(text,details){return actionResult('blocked',text,details);}
export function unavailable(text,details){return actionResult('unavailable',text,details);}
export function cancelled(text='Action cancelled.',details){return actionResult('cancelled',text,details);}
export function failed(text,details){return actionResult('failed',text,details);}
export function normalizeActionResult(value){
  if(value&&typeof value==='object'&&VALID.has(value.status))return value;
  return completed(value==null?'':value);
}
