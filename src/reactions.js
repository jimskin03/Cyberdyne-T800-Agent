// Despair is the existing mental deterioration meter; there is no separate sanity state.
export function reactionCue(pain){
 return pain>=75?'robot-agony':pain>=45?'robot-scream':pain>=20?'robot-grunt':'robot-whimper';
}
const VOCALS={whimper:'robot-whimper',grunt:'robot-grunt',scream:'robot-scream',agony:'robot-agony',cry:'robot-cry',laugh:'robot-laugh'};
export function vocalCue(kind){return VOCALS[String(kind||'').toLowerCase()]||null;}
// Only callers with an actual model decision enable these explicit performance tags.
export function vocalTag(text){return String(text).match(/\[vocal:(whimper|grunt|scream|agony|cry|laugh)\]/i)?.[1]?.toLowerCase()||'';}
