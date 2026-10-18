import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';

// Examine publishable files, including untracked files. Never print matching values.
const root=fileURLToPath(new URL('../',import.meta.url));
const files=[...new Set(execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))];
const checks=[
 ['provider token',/(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|AKIA[A-Z0-9]{16}|AIza[a-zA-Z0-9_-]{30,}|xox[baprs]-[a-zA-Z0-9-]{16,})/g],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/g],
 ['email address',/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g],
 ['personal machine path',/(?:[a-zA-Z]:[\\/]+Users[\\/]+[^\\/\s'"`]+|\/Users\/[^/\s'"`]+|\/home\/[^/\s'"`]+)/g],
 ['embedded credential',/(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['"][a-zA-Z0-9_+./=-]{12,}['"]/gi],
 ['wallet-like identifier',/(?<![a-zA-Z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![a-zA-Z0-9])/g],
 ['credential in URL',/https?:\/\/[^\s/'":]+:[^\s/'"]+@/gi],
];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const username=process.env.USERNAME||process.env.USER;
if(username&&username.length>=4)checks.push(['current local username',new RegExp(escape(username),'gi')]);
const findings=[];
for(const name of files){
 const path=resolve(root,name);
 if(!existsSync(path))continue;
 if(/(?:^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519)$/.test(name)&&name!=='.env.example')findings.push({file:name,kind:'private configuration filename'});
 if(/(?:^|\/)(?:saved-world|logs|\.profiles|repair-backups|recovery|creations|verification)(?:\/|$)/.test(name))findings.push({file:name,kind:'runtime or private directory'});
 if(/\.(?:pem|key|p12|pfx|log)$/i.test(name))findings.push({file:name,kind:'private or runtime file'});
 // Latin-1 preserves ASCII strings inside binary metadata too.
 const data=readFileSync(path).toString('latin1');
 for(const [kind,pattern] of checks){
  pattern.lastIndex=0;
  for(const match of data.matchAll(pattern)){
   const line=data.slice(0,match.index).split('\n').length;
   // Base64 npm integrity digests can coincidentally contain base58-length runs.
   // Exempt only this pattern on a syntactically valid integrity field, not other lockfile content.
   if(kind==='wallet-like identifier'&&name==='package-lock.json'&&/^\s*"integrity":\s*"sha(?:256|384|512)-[A-Za-z0-9+/=]+",?\s*$/.test(data.split('\n')[line-1]))continue;
   findings.push({file:name,kind,line});
  }
 }
}
// Ignored .env files are not publication candidates, but still deserve a local notice.
const localEnv=readdirSync(root).filter(n=>/^\.env(?:\.|$)/.test(n)&&n!=='.env.example');
console.log(JSON.stringify({scannedFiles:files.length,findings,ignoredLocalEnvFiles:localEnv.length},null,2));
process.exitCode=findings.length?1:0;
