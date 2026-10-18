// Independent samples: no project, reward, preferred object or destination.
export function randomAction(rng = Math.random) {
 const pick = xs => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
 const kind = pick(['walk', 'look', 'turn', 'gesture', 'wait', 'sit', 'stand']);
 switch (kind) {
  case 'walk': return {do:'walk_to', target:[(rng()-.5)*3.2, (rng()-.5)*2.4]};
  case 'look': return {do:'look_at', target:pick(['up','down','left','right','hands']), seconds:1+rng()*3};
  case 'turn': return {do:'turn', degrees:(rng()-.5)*360};
  case 'gesture': return {do:'gesture', kind:pick(['wave','shrug','nod','shake_head','stretch','clap','salute','dance','look_around'])};
  case 'sit': return {do:'sit', on:pick(['bed','stool','floor'])};
  case 'stand': return {do:'stand_up'};
  default: return {do:'wait', seconds:1+rng()*4};
 }
}
