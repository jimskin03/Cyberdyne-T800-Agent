// Account-connected browser automation is excluded from the public package.
export const SLOP_GUIDE='External browser access is unavailable in this standalone scene. Use local notes, drawing, and the built-in computer instead.';
export function createSlop(){
 const st={connected:false,active:false,controls:[],image:null,error:'External browser is not configured.'};
 const unavailable=async()=>({error:st.error});
 return {st,act:unavailable,operatorAct:unavailable,observe:async()=>null,poll:async()=>null,onChange(){return ()=>{};},describe(){return SLOP_GUIDE;}};
}
export function mountSlop(element){element.textContent='External browser access is unavailable in this standalone scene.';}
