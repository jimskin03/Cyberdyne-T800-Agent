// Reset only this package's state. One local undo slot keeps reset recoverable.
const PREFIX='cell-public-';
const BACKUP='cell-session-reset-backup.v1';
export function resetSessionStorage(storage){
 const entries={};
 for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX))entries[key]=storage.getItem(key);}
 storage.setItem(BACKUP,JSON.stringify(entries));
 for(const key of Object.keys(entries))storage.removeItem(key);
}
export function hasSessionBackup(storage){return storage.getItem(BACKUP)!==null;}
export function restoreSessionStorage(storage){
 const entries=JSON.parse(storage.getItem(BACKUP)||'null');if(!entries||typeof entries!=='object'||Array.isArray(entries))return false;
 const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX))keys.push(key);}
 for(const key of keys)storage.removeItem(key);
 for(const [key,value]of Object.entries(entries))if(key.startsWith(PREFIX)&&typeof value==='string')storage.setItem(key,value);
 storage.removeItem(BACKUP);return true;
}
