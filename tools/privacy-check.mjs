import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync,readdirSync,realpathSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Examine publishable files, including untracked files. Never print matching values.
const root=fileURLToPath(new URL('../',import.meta.url));
const checks=[
 ['provider token',/(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|AKIA[A-Z0-9]{16}|AIza[a-zA-Z0-9_-]{30,}|xox[baprs]-[a-zA-Z0-9-]{16,})/g],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/g],
 ['email address',/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g],
 ['personal machine path',/(?:[a-zA-Z]:[\\/]+Users[\\/]+[^\\/\s'"`]+|\/Users\/[^/\s'"`]+|\/home\/[^/\s'"`]+)/g],
 ['embedded credential',/(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['"][a-zA-Z0-9_+./=-]{12,}['"]/gi],
 ['wallet-like identifier',/(?<![a-zA-Z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![a-zA-Z0-9])/g],
 ['credential in URL',/https?:\/\/[^\s/'":]+:[^\s/'"]+@/gi],
];
// Text metadata can carry a drive path that does not pass through a Users directory.
const metadataPath=/(?:[a-zA-Z]:[\\/]+[^\s\x00-\x1f'"`]{3,}|\/Users\/[^/\s'"`]+|\/home\/[^/\s'"`]+)/g;
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const username=process.env.USERNAME||process.env.USER;
if(username&&username.length>=4)checks.push(['current local username',new RegExp(escape(username),'gi')]);

const lineAt=(text,index)=>text.slice(0,index).split('\n').length;

export function pngTextChunks(buffer){
 const bytes=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);
 const chunks=[];
 if(bytes.length<8||bytes.toString('latin1',0,8)!=='\x89PNG\r\n\x1a\n')return chunks;
 let i=8;
 while(i+12<=bytes.length){
  const length=bytes.readUInt32BE(i);
  if(i+12+length>bytes.length)break;
  const type=bytes.toString('ascii',i+4,i+8);
  const data=bytes.subarray(i+8,i+8+length);
  try{
   if(type==='tEXt'){
    const zero=data.indexOf(0);
    if(zero>=0)chunks.push({offset:i+8+zero+1,text:data.toString('latin1',zero+1)});
   }else if(type==='zTXt'){
    const zero=data.indexOf(0);
    if(zero>=0)chunks.push({offset:i+8,text:inflateSync(data.subarray(zero+2)).toString('utf8')});
   }else if(type==='iTXt'){
    const zero=data.indexOf(0);
    if(zero>=0){
     const compressed=data[zero+1]===1;
     let cursor=zero+3;
     const language=data.indexOf(0,cursor);
     const translated=data.indexOf(0,language+1);
     const raw=data.subarray(translated+1);
     chunks.push({offset:i+8,text:(compressed?inflateSync(raw):raw).toString('utf8')});
    }
   }
  }catch{/* skip a damaged metadata chunk; the rest of the file is still scanned */}
  i+=12+length;
  if(type==='IEND')break;
 }
 return chunks;
}

function collect(findings,file,kind,text,index){
 const line=lineAt(text,index);
 if(kind==='wallet-like identifier'&&file==='package-lock.json'&&/^\s*"integrity":\s*"sha(?:256|384|512)-[A-Za-z0-9+/=]+",?\s*$/.test(text.split('\n')[line-1]))return;
 findings.push({file,kind,line});
}

function scanText(findings,file,text,patterns){
 for(const [kind,pattern] of patterns){
  pattern.lastIndex=0;
  for(const match of text.matchAll(pattern))collect(findings,file,kind,text,match.index);
 }
}

// PNG compressed image data can accidentally look like a path. Scan metadata
// chunks as text, and do not apply path or username checks to the raw bytes.
export function findingsInFile(name,buffer){
 const findings=[];
 const bytes=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);
 const png=name.toLowerCase().endsWith('.png');
 const data=bytes.toString('latin1');
 const rawChecks=png?checks.filter(([kind])=>kind!=='personal machine path'&&kind!=='current local username'):checks;
 scanText(findings,name,data,rawChecks);
 if(png){
  const textChecks=checks.filter(([kind])=>kind!=='personal machine path');
  for(const chunk of pngTextChunks(bytes)){
   scanText(findings,name,chunk.text,textChecks);
   metadataPath.lastIndex=0;
   for(const match of chunk.text.matchAll(metadataPath)){
    findings.push({file:name,kind:'personal machine path',line:lineAt(data,chunk.offset+match.index)});
   }
  }
 }
 return findings;
}

function publicationFiles(){
 return [...new Set(execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))];
}

export function scanRepository(){
 const files=publicationFiles();
 const findings=[];
 for(const name of files){
  const path=resolve(root,name);
  if(!existsSync(path))continue;
  if(/(?:^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519)$/.test(name)&&name!=='.env.example')findings.push({file:name,kind:'private configuration filename'});
  if(/(?:^|\/)(?:saved-world|logs|\.profiles|repair-backups|recovery|creations|verification)(?:\/|$)/.test(name))findings.push({file:name,kind:'runtime or private directory'});
  if(/\.(?:pem|key|p12|pfx|log)$/i.test(name))findings.push({file:name,kind:'private or runtime file'});
  findings.push(...findingsInFile(name,readFileSync(path)));
 }
 const localEnv=readdirSync(root).filter(n=>/^\.env(?:\.|$)/.test(n)&&n!=='.env.example');
 return {scannedFiles:files.length,findings,ignoredLocalEnvFiles:localEnv.length};
}

const invoked=process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));
if(invoked){
 const report=scanRepository();
 console.log(JSON.stringify(report,null,2));
 process.exitCode=report.findings.length?1:0;
}
