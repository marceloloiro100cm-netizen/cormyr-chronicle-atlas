/**
 * Offline-only, bounded verification that public Cormyr archive references
 * point to readable files in this Git checkout. No Cloud access or private data.
 * Existence and JSON parsing NEVER imply narrative review or authorization.
 */
import {appendFileSync, closeSync, lstatSync, openSync, readFileSync, readSync, realpathSync} from 'node:fs';
import {isAbsolute, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parsePublicArchivePayload} from './public-archive-coverage-readonly.mjs';

const PUBLIC_ROOT=fileURLToPath(new URL('../../public/cormyr/',import.meta.url));
const ARCHIVE=new URL('../../public/cormyr/data.js',import.meta.url);
const HISTORY=/^histories\/[A-Za-z0-9/_-]+\.json$/;
const CREST=/^assets\/[A-Za-z0-9/_-]+\.(webp|png|jpe?g)$/i;
const fail=code=>{throw Error('public_asset_inventory_'+code);};
const valid=v=>typeof v==='string'&&v.length>0&&v.length<=256;

export function summarizePublicAssetInventory({
  archive,checkHistory,checkCrest,
}={}){
  if(!archive||!Array.isArray(archive.regions)||
     archive.regions.length<1||archive.regions.length>30||
     typeof checkHistory!=='function'||typeof checkCrest!=='function')
    fail('invalid_input');
  let regions=0,houses=0,historyReferences=0,historyVerified=0;
  let crestReferences=0,crestVerified=0,withoutHistoryReference=0;
  let directDescriptions=0;
  for(const region of archive.regions){
    if(!region||!Array.isArray(region.houses)||
       region.houses.length>500)fail('region_invalid');
    regions++;
    for(const house of region.houses){
      if(!house||!valid(house.name))fail('house_invalid');
      houses++;
      if(houses>5000)fail('inventory_exceeds_limit');
      if(typeof house.description==='string'&&house.description.trim())
        directDescriptions++;
      if(!house.historyPath)withoutHistoryReference++;
      else{
        historyReferences++;
        try{
          if(HISTORY.test(house.historyPath)&&
             checkHistory(house.historyPath)===true)historyVerified++;
        }catch{/* Suppress paths and parse errors; count unverified. */}
      }
      if(house.crest){
        crestReferences++;
        try{
          if(CREST.test(house.crest)&&
             checkCrest(house.crest)===true)crestVerified++;
        }catch{/* Never emit filesystem errors. */}
      }
    }
  }
  return {
    scope:'CORMYR_PUBLIC_ARCHIVE_ASSET_INVENTORY_OFFLINE',
    checked:true,regions,houses,
    historyReferences,historyVerified,
    historyUnverified:historyReferences-historyVerified,
    withoutHistoryReference,
    crestReferences,crestVerified,
    crestUnverified:crestReferences-crestVerified,
    directDescriptions,
    // A valid local file is not an approved public narrative.
    reviewApproved:false,publishedToFirebase:false,
    readyForPlayers:false,readyForCutover:false,
    releaseDecision:'NO_GO',cloudReads:0,cloudWrites:0,
  };
}

function localAsset(root,ref,pattern,maxSize){
  if(!valid(ref)||!pattern.test(ref))return null;
  try{
    const file=resolve(root,ref);
    const local=relative(root,file);
    if(!local||local.startsWith('..')||isAbsolute(local))return null;
    const rootReal=realpathSync(root),fileReal=realpathSync(file);
    const actual=relative(rootReal,fileReal);
    if(!actual||actual.startsWith('..')||isAbsolute(actual))return null;
    const stat=lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||
       stat.size<=0||stat.size>maxSize)return null;
    return file;
  }catch{return null;}
}

/** Header-only signature check; this does not claim full image decoding. */
export function hasMatchingImageSignature(bytes,ref){
  if(!(bytes instanceof Uint8Array)||typeof ref!=='string')return false;
  const b=Buffer.from(bytes);
  const lower=ref.toLowerCase();
  if(lower.endsWith('.webp'))
    return b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&
      b.toString('ascii',8,12)==='WEBP';
  if(lower.endsWith('.png'))
    return b.length>=8&&b.subarray(0,8).equals(
      Buffer.from([137,80,78,71,13,10,26,10]));
  if(lower.endsWith('.jpg')||lower.endsWith('.jpeg'))
    return b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255;
  return false;
}
function imageFileSignature(file,ref){
  let fd=null;
  try{
    fd=openSync(file,'r');
    const header=Buffer.alloc(12);
    const read=readSync(fd,header,0,12,0);
    return hasMatchingImageSignature(header.subarray(0,read),ref);
  }catch{return false;}
  finally{if(fd!==null)closeSync(fd);}
}
/** Reusable safe file checks: only booleans, no text or paths returned. */
export function verifyPublicHistoryAsset(ref,{root=PUBLIC_ROOT}={}){
  const file=localAsset(root,ref,HISTORY,1_000_000);
  if(!file)return false;
  try{
    const data=JSON.parse(readFileSync(file,'utf8'));
    return !!data&&!Array.isArray(data)&&
      typeof data.text==='string'&&data.text.trim().length>0&&
      data.text.length<=1_000_000;
  }catch{return false;}
}
export function verifyPublicCrestAsset(ref,{root=PUBLIC_ROOT}={}){
  const file=localAsset(root,ref,CREST,10_000_000);
  return file!==null&&imageFileSignature(file,ref);
}

export function inspectPublicAssetInventory({root=PUBLIC_ROOT}={}){
  if(root!==PUBLIC_ROOT&&
     (typeof root!=='string'||!isAbsolute(root)))fail('root_invalid');
  let archive;
  try{
    archive=parsePublicArchivePayload(readFileSync(
      resolve(root,'data.js'),'utf8'));
  }catch{fail('archive_unreadable');}
  return summarizePublicAssetInventory({
    archive,
    checkHistory:ref=>verifyPublicHistoryAsset(ref,{root}),
    checkCrest:ref=>verifyPublicCrestAsset(ref,{root}),
  });
}

export function safeAssetSummary(report){
  const n=v=>Number.isSafeInteger(v)&&v>=0&&v<=5000?v:'não verificado';
  return [
    '## Acervo público Cormyr — integridade offline',
    '| Verificação | Quantidade |','| --- | ---: |',
    '| Casas no arquivo público | '+n(report?.houses)+' |',
    '| Regiões | '+n(report?.regions)+' |',
    '| Histórias referenciadas | '+n(report?.historyReferences)+' |',
    '| Arquivos de história válidos | '+n(report?.historyVerified)+' |',
    '| Histórias ausentes/inválidas | '+n(report?.historyUnverified)+' |',
    '| Casas sem referência de história | '+n(report?.withoutHistoryReference)+' |',
    '| Brasões referenciados | '+n(report?.crestReferences)+' |',
    '| Brasões presentes com assinatura de imagem válida | '+n(report?.crestVerified)+' |',
    '| Brasões ausentes/inválidos | '+n(report?.crestUnverified)+' |',
    '| Revisão editorial | **Pendente** |',
    '| Publicação de dados no Firebase | **Nenhuma** |',
    '',
    'Os arquivos foram apenas conferidos localmente. NO_GO para publicação e jogadores.',
  ].join('\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const report=inspectPublicAssetInventory();
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        safeAssetSummary(report)+'\n','utf8');
  }catch{
    process.stderr.write('public_asset_inventory_failed\n');
    process.exitCode=2;
  }
}
