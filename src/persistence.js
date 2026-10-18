// Standalone builds keep state in this browser; no shared disk service is contacted.
export function advanceTime(minutes,lastAt,now,scale=1){return minutes+Math.max(0,now-lastAt)/60000*scale;}
export function createPersistence(){
 const acknowledged=new Set();
 return {loading:Promise.resolve(null),save(data){for(const entry of data.archive||[])if(entry.id)acknowledged.add(entry.id);},takeAcknowledged(){const ids=[...acknowledged];acknowledged.clear();return ids;},get status(){return {available:false,savedAt:0,error:'Browser storage only',conflict:false};}};
}
