// No autonomous operator service is included by default.
export function createAutopilot(){return {setEnabled(){},get enabled(){return false;},get history(){return [];}};}
