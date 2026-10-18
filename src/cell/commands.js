// Only recognizable imperatives execute locally; questions remain conversation.
export function operatorCommand(raw) {
 let text=String(raw||'').trim();
 // Remove delivery fillers before the verb, never inside the words to say.
 const prefix=/^(?:please|just|then|hey|okay|ok|alright|listen|fucking|goddamn|damn|fuck|for fuck['?]?s sake)\b[\s,:;!-]*/i;
 while(prefix.test(text))text=text.replace(prefix,'');
 const spoken=/^(?:say|repeat)\s+([\s\S]+)$/i.exec(text);
 if(spoken)return {say:spoken[1],actions:[]};
 if(text.includes('?')||/^(?:can|could|would|will|do|does|did|what|where|when|why|how|is|are|have|should)\b/i.test(text))return null;
 text=text.replace(/[.!]+$/,'').replace(/(?:\s+(?:properly|closely|carefully|please))+$/i,'').trim();
 const t=text.toLowerCase();
 const target=s=>s.replace(/^(?:(?:the|a|an|fucking|goddamn|damn)\s+)+/i,'').trim();
 if (/^(?:stop|stop moving|stand still|stay still|wait)$/.test(t)) return [{do:'wait', seconds:10}];
 if (/^(?:stand|stand up|get up)$/.test(t)) return [{do:'stand_up'}];
 if (/^(?:tidy(?: up)?|clean up|reorgani[sz]e)(?: (?:the )?(?:room|cell|mess|things))?$/.test(t)) return [{do:'tidy'}];
 let m;
 if((m=/^(?:(?:take|capture) (?:a )?(?:snapshot|picture|photo)|snapshot|capture|observe)(?: (?:of )?(.+))?$/.exec(t)))return [{do:'snapshot',...(m[1]?{target:target(m[1])}:{})}];
 if ((m = /^(?:walk|go|move) to (.+)$/.exec(t))) return [{do:'walk_to', target:target(m[1])}];
 if ((m = /^(?:look(?: closely| carefully)? at|inspect) (.+)$/.exec(t))) return [{do:t.startsWith('inspect')?'inspect':'look_at', target:target(m[1]), seconds:3}];
 if ((m = /^(?:pick up|take) (.+)$/.exec(t))) return [{do:'pick_up', object:target(m[1])}];
 if ((m = /^(?:put (?:it|that|the .+?) down|put down what you are holding)(?: on (?:the )?(table|bed|sink|floor))$/.exec(t))) return [{do:'put_down',on:m[1]}];
 if (/^(?:drop it|put it down|put down what you are holding)$/.test(t)) return [{do:'put_down'}];
 if ((m = /^sit(?: down)?(?: on (?:the )?(bed|stool|floor))?$/.exec(t))) return [{do:'sit', on:m[1]||'floor'}];
 if ((m = /^lie down(?: on (?:the )?(bed|floor))?$/.exec(t))) return [{do:'lie_down', on:m[1]||'bed'}];
 return null;
}
