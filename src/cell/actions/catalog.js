export const ACTION_ALIASES = Object.freeze({
  go_to:'walk_to', move_to:'walk_to', walk:'walk_to', go:'walk_to', approach:'walk_to', run_to:'walk_to',
  look:'look_at', watch:'look_at', stare_at:'look_at', examine:'inspect', study:'inspect',
  grab:'pick_up', take:'pick_up', pickup:'pick_up', drop:'put_down', place:'put_down', set_down:'put_down', toss:'throw',
  play:'use', play_with:'use', interact:'use', read:'read', write:'write', draw:'draw', scribble:'draw', sketch:'draw', doodle:'draw', paint:'draw',
  sleep:'lie_down', lie:'lie_down', rest:'wait', idle:'wait', pause:'wait', listen:'wait', think:'wait', stand:'stand_up', get_up:'stand_up', kneel:'crouch', squat:'crouch',
  knock:'use', try_door:'use', open:'use', look_out:'use', look_out_window:'use', water:'use', fill:'use', turn_on:'use', turn_off:'use', switch:'use', bounce:'use', twist:'use', shuffle:'use', solve:'use', tally:'write',
  wave:'gesture', shrug:'gesture', nod:'gesture', shake_head:'gesture', cover_face:'gesture', stretch:'gesture', point:'gesture', clap:'gesture', salute:'gesture', dance:'gesture', punch_wall:'gesture', hug_knees:'sit', look_around:'gesture', rub_head:'gesture', fists:'gesture',
  program:'code', build_app:'code', make_app:'code', build_3d:'create_3d', slopcannon:'browser', write_note:'note', journal:'note', type:'note',
  sit_down:'sit', clean_up:'tidy', reorganize:'tidy', turn_around:'turn', capture:'snapshot', observe:'snapshot'
});

export const SUPPORTED_ACTIONS = Object.freeze([
  'walk_to','pace','look_at','inspect','snapshot','turn','pick_up','put_down','throw','kick','tidy','repair','read','code','create_3d','browser','note','write','draw','sit','lie_down','stand_up','crouch','wait','gesture','use'
]);
const SUPPORTED = new Set(SUPPORTED_ACTIONS);

export function actionName(value=''){
  return String(value||'').toLowerCase().trim().replace(/^(the|a|an)\s+/,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
export function canonicalAction(value=''){
  const raw=actionName(value);
  const look=/^look_(up|down|left|right|around)$/.exec(raw);
  if(look)return look[1]==='around'?'gesture':'look_at';
  return ACTION_ALIASES[raw]||raw;
}
export function isSupportedAction(value=''){return SUPPORTED.has(canonicalAction(value));}

export const ACTION_CATALOG_PROMPT=`ACTIONS ("do" plus parameters):
- walk_to {target}; pace {seconds}; look_at {target, seconds}; inspect {target}; turn {degrees}
- snapshot {target?} captures and interprets the current optical frame; it does not create or upload a photo file
- pick_up {object}; put_down {on?}; throw {target}; kick {object}; tidy {object?, on?, position?:[x,z]}; repair
- use {object, how}; read; write {text, surface?, x?, y?, size?}; draw {subject, surface, area?, style?}
- code {app, idea}; create_3d {name, idea, position?:[x,z]}; note {title, text}; browser
- sit {on:bed|stool|floor}; lie_down {on:bed|floor}; stand_up; crouch {seconds}; wait {seconds}
- gesture {kind:wave|shrug|nod|shake_head|cover_face|stretch|point|fists|clap|salute|dance|rub_head|look_around|punch_wall}
Unknown action names are unavailable and will not be simulated. Use only this catalog. Wait for each action result before claiming completion.`;
