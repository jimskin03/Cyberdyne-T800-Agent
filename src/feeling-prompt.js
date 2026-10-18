export const FEELING_CUE='and i feel-';
// Keep this as the final user-prompt text, not an incomplete assistant JSON prefill.
export function withFeelingCue(observations,{field='thought',format='json'}={}){
 const location=format==='text'?'in your next in-character line':field?`in the ${field} field`:'within the existing character response fields';
 const contract=format==='text'?'Keep the required spoken-line format.':'Return the complete required JSON object, with no prose outside it. Preserve its existing schema and action choices; do not add fields.';
 return String(observations)+'\n\nContinue the unfinished first-person cue below '+location+', using the current observations. Do not invent sensations or events. '+contract+'\n'+FEELING_CUE;
}
