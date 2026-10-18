// Current production state precedes old Producer chat, even on very long plans.
export function describeBrowserContext({url='',sections=[],conversation=[],fallback=''}={}){
 const current=sections.filter(s=>s.text).map(s=>`${s.name}: ${s.text.slice(0,2200)}`).join('\n');
 const status=sections.filter(s=>/Your video|Review your scenes|Activity|dialog|status/i.test(s.name)).map(s=>s.text).join('\n');
 const waiting=/assembling|finishing your video|assembly runs|making your video|working at provider|\b\d+ working\b|\bRENDERING\b/i.test(status)&&!/\b(?:download (?:your )?(?:video|film)|video is ready|assembly complete)\b/i.test(status);
 const history=conversation.slice(-2).map(t=>String(t).slice(0,1400)).join('\n');
 const ui=`CURRENT PAGE: ${url}\nCURRENT LIVE PROJECT STATE (authoritative):\n${current||fallback.slice(-6000)}\n${waiting?'BACKGROUND JOB: render/assembly is accepted and still running. Leave the workstation and choose a physical room activity while waiting. Occasional status checks suffice; do not click generation again or keep describing the film.':''}\n${history?'OLDER PRODUCER CONVERSATION (history, not a new request; current live state overrides old missing-file or credit messages):\n'+history:''}\nA heading such as "Make every scene yours" is a permanent interface label, not a new Producer question.`;
 return {ui:ui.slice(0,11000),waiting,status:status.slice(0,3000)};
}

// Runs in the real browser. Read only DOM text: no private site state or API calls.
export function readBrowserContext(){
 const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const names=['Project files','Film plan','Review your scenes','Your video','Activity'];
 const sections=names.flatMap(name=>Array.from(document.querySelectorAll('[aria-label]')).filter(e=>e.getAttribute('aria-label')===name&&visible(e)).map(e=>({name,text:e.innerText||''})));
 for(const e of document.querySelectorAll('[role="dialog"],[aria-modal="true"],[role="status"]'))if(visible(e))sections.unshift({name:e.getAttribute('aria-label')||e.getAttribute('role')||'dialog',text:e.innerText||''});
 const conversation=Array.from(document.querySelectorAll('#creative-producer-panel article')).filter(visible).map(e=>e.innerText||'');
 return {url:location.href,sections,conversation,fallback:document.body.innerText};
}

export function workstationAction(action){
 const do_=String(action?.do||action?.action||'').toLowerCase().replace(/ /g,'_');
 const target=String(action?.target??action?.object??action?.on??'').toLowerCase();
 return /^(browser|slopcannon|code|program|create_app|edit_app|run_app)$/.test(do_)||/^(computer|crt|pc|monitor|screen|keyboard|terminal|table|stool)$/.test(target);
}
export function waitingDecisionIssues(decision,{browserWaiting=false,browserRequested=false,canCheckBrowser=false,atComputer=false}={}){
 if(!browserWaiting||browserRequested)return [];
 const actions=decision.actions||[],atWorkstation=actions.filter(workstationAction);
 const oneStatusCheck=canCheckBrowser&&atWorkstation.length===1&&/^(browser|slopcannon)$/.test(atWorkstation[0].do)&&/^(inspect|open)$/.test(atWorkstation[0].op||'open');
 const staying=atComputer&&!actions.some(a=>a.do==='walk_to'&&!workstationAction(a));
 return (atWorkstation.length&&!oneStatusCheck)||(staying&&!oneStatusCheck)?['The film is already rendering/assembling in the background. Leave the computer now. Your actions must include walk_to with a real room target away from the desk, such as bed, window, sink, door or center, followed by an activity you choose. Standing up, turning, looking at the floor, waiting and repeating an intention do not move you away. No further workstation interaction advances this pending job. A status check is allowed only at the next check interval, unless the operator explicitly requests browser work.']:[];
}
