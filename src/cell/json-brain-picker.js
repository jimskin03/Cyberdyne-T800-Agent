/** Label shown for a memory or pathway in the JSON brain picker. */
export function pickerItemLabel(item){
 const json=item?.json||{};
 return item.id+' · '+(json.label||json.fact||'');
}

/** Lowercased text searched by the picker (id, category/domain, label, fact, cues). */
export function pickerItemHaystack(item){
 const json=item?.json||{};
 const cues=Array.isArray(json.cues)?json.cues.join(' '):'';
 return [item?.id,json.domain,json.label,json.fact,cues].filter(Boolean).join(' ').toLowerCase();
}

/** Case-insensitive filter; empty query returns every item. */
export function filterPickerItems(items,query){
 const list=Array.isArray(items)?items:[];
 const q=String(query??'').trim().toLowerCase();
 if(!q)return list.slice();
 return list.filter(item=>pickerItemHaystack(item).includes(q));
}
