/**
 * Read-only GCS integrity audit for the isolated Cormyr media migration.
 * Source and destination are deliberately fixed; no object contents leave GCS.
 * Nothing here copies, rewrites or deletes objects or grants permissions.
 */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const SOURCE={bucket:'cormyr.firebasestorage.app',prefix:'migration-staging/campaign-images/'};
export const DESTINATION={bucket:'cormyr-migration-homolog-477785088395',prefix:'campaign-images/'};
const BASE='https://storage.googleapis.com/storage/v1/b/';
const MAX_ITEMS=50_000;
export const HISTORICAL_GCLOUD_ENTRY_COUNT=986;
const CRC=/^[A-Za-z0-9+/]{6}==$/;
function cleanItem(item,prefix) {
  if(!item||typeof item.name!=='string'||!item.name.startsWith(prefix))
    throw Error('Invalid Storage inventory');
  const relative=item.name.slice(prefix.length);
  if(!relative||relative.includes('..')||relative.startsWith('/')||relative.includes('\\')||
     relative.includes('//')||relative.length>1024)
    throw Error('Invalid Storage object path');
  if(!/^(0|[1-9][0-9]*)$/.test(String(item.size))||
     !Number.isSafeInteger(Number(item.size))||!CRC.test(String(item.crc32c)))
    throw Error('Invalid Storage object checksum or size');
  if(item.md5Hash!==undefined&&item.md5Hash!==null&&
     !/^[A-Za-z0-9+/]{22}==$/.test(item.md5Hash))
    throw Error('Invalid Storage MD5');
  return {relative,size:String(item.size),crc32c:item.crc32c,
    md5Hash:item.md5Hash||null};
}
export function compareStorageCopies(source,target,from=SOURCE,to=DESTINATION){
  if(!Array.isArray(source)||!Array.isArray(target)||
     from.bucket===to.bucket||from.prefix===to.prefix)
    throw Error('Invalid GCS comparison');
  const mapping=(items,prefix)=>{
    const out=new Map();
    for(const item of items){
      const x=cleanItem(item,prefix);
      if(out.has(x.relative))throw Error('Duplicate Storage object in inventory');
      out.set(x.relative,x);
    }
    return out;
  };
  const a=mapping(source,from.prefix),b=mapping(target,to.prefix);
  let missing=0,extra=0,sizeMismatch=0,crcMismatch=0,md5Mismatch=0;
  let md5Compared=0,sourceBytes=0,destinationBytes=0;
  for(const x of a.values())sourceBytes+=Number(x.size);
  for(const x of b.values())destinationBytes+=Number(x.size);
  for(const [key,v] of a){
    const d=b.get(key);
    if(!d){missing++;continue;}
    if(v.size!==d.size)sizeMismatch++;
    if(v.crc32c!==d.crc32c)crcMismatch++;
    if(v.md5Hash&&d.md5Hash){
      md5Compared++;
      if(v.md5Hash!==d.md5Hash)md5Mismatch++;
    }
  }
  for(const key of b.keys())if(!a.has(key))extra++;
  const same=a.size>0&&missing===0&&extra===0&&
    sizeMismatch===0&&crcMismatch===0&&md5Mismatch===0;
  return {
    scope:'read-only-gcs-prefix-integrity',
    sourceObjects:a.size,destinationObjects:b.size,
    sourceBytes,destinationBytes,missing,extra,sizeMismatch,crcMismatch,
    md5Mismatch,md5Compared,
    checksumMethod:'CRC32C for all objects; MD5 where present on both',
    sourceToStagingBytesMatch:same,
    // Live data changes, Storage ACLs, non-image buckets and app access
    // remain separate cutover gates even when all staged bytes match.
    sourceFrozen:false,aclVerified:false,otherBucketsVerified:false,
    cloudWrites:0,readyForCutover:false,
  };
}
export async function listGcsPrefix({bucket,prefix},accessToken,fetcher=fetch){
  if(![SOURCE.bucket,DESTINATION.bucket].includes(bucket)||
     typeof accessToken!=='string'||accessToken.length<10)
    throw Error('Storage audit authentication unavailable');
  if((bucket===SOURCE.bucket&&prefix!==SOURCE.prefix)||
     (bucket===DESTINATION.bucket&&prefix!==DESTINATION.prefix))
    throw Error('Storage audit scope violation');
  const items=[],tokens=new Set();let next;
  while(true){
    const url=new URL(BASE+encodeURIComponent(bucket)+'/o');
    url.searchParams.set('prefix',prefix);
    url.searchParams.set('maxResults','1000');
    url.searchParams.set('fields','nextPageToken,items(name,size,crc32c,md5Hash)');
    if(next)url.searchParams.set('pageToken',next);
    const response=await fetcher(url.toString(),{
      method:'GET',headers:{Authorization:'Bearer '+accessToken},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20_000),
    });
    if(!response.ok){
      // Only a bounded HTTP category may reach logs; never read a provider
      // response body that might contain object names or account details.
      const known=[400,401,403,404,408,429,500,502,503,504].includes(response.status);
      const error=new Error('Private Storage listing unavailable');
      error.auditCode='GCS_HTTP_'+(known?String(response.status):'OTHER');
      throw error;
    }
    const body=await response.json();
    if(!body||typeof body!=='object'||!Array.isArray(body.items??[]))
      throw Error('Invalid GCS listing');
    for(const item of body.items??[]){
      // Validate on each page rather than trusting the provider payload.
      cleanItem(item,prefix);
      items.push(item);
      if(items.length>MAX_ITEMS)throw Error('GCS audit inventory too large');
    }
    next=body.nextPageToken;
    if(!next)break;
    if(typeof next!=='string'||tokens.has(next)||tokens.size>100)
      throw Error('GCS pagination invalid');
    tokens.add(next);
  }
  return items;
}
/**
 * Reconcile API objects with CLI output without logging any private paths.
 * 'gcloud storage ls --recursive' may include virtual directory entries;
 * those are NOT GCS objects unless the JSON API also lists the exact key.
 */
export function summarizePrivateStaging(inventory,cliText){
  if(!Array.isArray(inventory)||inventory.length>MAX_ITEMS||
     typeof cliText!=='string'||cliText.length>50_000_000)
    throw Error('Invalid staging inventory');
  let destinationBytes=0;
  const apiKeys=new Set();
  for(const item of inventory){
    const checked=cleanItem(item,DESTINATION.prefix);
    if(apiKeys.has(checked.relative))throw Error('Duplicate staging object');
    apiKeys.add(checked.relative);
    destinationBytes+=Number(checked.size);
  }
  const uri='gs://'+DESTINATION.bucket+'/'+DESTINATION.prefix;
  let cliEntries=0,cliPseudoFolders=0,cliDuplicateFileEntries=0,unexpectedEntries=0;
  const cliObjects=new Set();
  for(const line of cliText.split(/\r?\n/)){
    const raw=line.trim();
    if(!raw)continue;
    if(!raw.startsWith(uri)){
      if(raw.startsWith('gs://'))unexpectedEntries++;
      continue;
    }
    cliEntries++;
    let name=raw.slice(uri.length);
    // CLI output can show headings ending in ':' or virtual directories.
    if(name.endsWith('/:'))name=name.slice(0,-1);
    if(name.endsWith(':')||name.endsWith('/')&&!apiKeys.has(name)){
      cliPseudoFolders++;
      continue;
    }
    if(!name||name.includes('..')||name.includes('\\')||name.startsWith('/')||
       name.length>1024){
      unexpectedEntries++;
      continue;
    }
    if(cliObjects.has(name))cliDuplicateFileEntries++;
    else cliObjects.add(name);
  }
  let onlyInCli=0,onlyInApi=0;
  for(const k of cliObjects)if(!apiKeys.has(k))onlyInCli++;
  for(const k of apiKeys)if(!cliObjects.has(k))onlyInApi++;
  const listingMethodsAgree=inventory.length>0&&onlyInApi===0&&onlyInCli===0&&
    cliDuplicateFileEntries===0&&unexpectedEntries===0;
  return {
    scope:'READ-ONLY-PRIVATE-STAGING-METADATA',
    destinationObjects:inventory.length,destinationBytes,
    cliEntries,cliPseudoFolders,cliUniqueObjectEntries:cliObjects.size,
    cliDuplicateFileEntries,unexpectedEntries,onlyInApi,onlyInCli,
    historicalReportedGcloudEntries:HISTORICAL_GCLOUD_ENTRY_COUNT,
    matchesHistoricalEntryCount:cliEntries===HISTORICAL_GCLOUD_ENTRY_COUNT,
    listingMethodsAgree,crc32cMetadataValidated:true,
    sourceCompared:false,sourceFrozen:false,readyForCutover:false,
    cloudWrites:0,
  };
}

/** A public-safe audit summary: only aggregate counts, never object paths. */
export function safeStagingSummary(report){
  const n=value=>Number.isSafeInteger(value)&&value>=0&&value<=10_000_000_000
    ?String(value):'indisponível';
  const agree=report?.listingMethodsAgree===true;
  return [
    '## Firebase Storage — homologação, auditoria somente leitura',
    '',
    '| Prova | Resultado |','| --- | --- |',
    '| Objetos reais no inventário GCS | '+n(report?.destinationObjects)+' |',
    '| Bytes totais no inventário GCS | '+n(report?.destinationBytes)+' |',
    '| Entradas únicas de objetos no CLI | '+n(report?.cliUniqueObjectEntries)+' |',
    '| Pseudopastas (não são objetos) | '+n(report?.cliPseudoFolders)+' |',
    '| Divergências API apenas / CLI apenas | '+
      n(report?.onlyInApi)+' / '+n(report?.onlyInCli)+' |',
    '| Entradas duplicadas do CLI | '+
      n(report?.cliDuplicateFileEntries)+' |',
    '| API e CLI concordam | **'+(agree?'SIM':'NÃO')+'** |',
    '| Entradas CLI iguais ao histórico (986) | '+
      (report?.matchesHistoricalEntryCount===true?'Sim':'Não — referência antiga, não bloqueante')+' |',
    '| Comparação atual com origem | **NÃO EFETUADA** |',
    '| Liberação de jogadores/cutover | **NÃO AUTORIZADA** |',
    '',
    'A contagem histórica inclui entradas virtuais e não autoriza migração.',
    'Nenhuma credencial, caminho de objeto ou arquivo foi publicado.',
  ].join('\n');
}

export async function verifyStorageReadOnly({token,fetcher=fetch}){
  const inventory=async (scope,locator)=>{
    try{
      return await listGcsPrefix(locator,token,fetcher);
    }catch(error){
      // Re-throw only allowlisted status and scope, not arbitrary exception
      // messages from provider responses, file names or caller data.
      const status=typeof error?.auditCode==='string'&&
        /^GCS_HTTP_(?:400|401|403|404|408|429|500|502|503|504|OTHER)$/.test(error.auditCode)
        ?error.auditCode:'INVENTORY_UNAVAILABLE';
      const safe=new Error('Private Storage inventory not verified');
      safe.auditCode=scope+'_'+status;
      throw safe;
    }
  };
  const source=await inventory('SOURCE',SOURCE);
  const target=await inventory('DESTINATION',DESTINATION);
  return compareStorageCopies(source,target);
}
async function main(args){
  if(args.length!==1||!['--readonly-live','--staging-only-readonly'].includes(args[0]))
    throw Error('Use --readonly-live (owner Cloud Shell) or --staging-only-readonly (reader OIDC)');
  const project=execFileSync('gcloud',['config','get-value','project'],{
    encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10_000,
  }).trim();
  if(project!=='cormyr')throw Error('Wrong Google Cloud project');
  const token=execFileSync('gcloud',['auth','print-access-token','--quiet'],{
    encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:15_000,
  }).trim();
  if(args[0]==='--staging-only-readonly'){
    const inventory=await listGcsPrefix(DESTINATION,token);
    const cli=execFileSync('gcloud',['storage','ls','--recursive',
      'gs://'+DESTINATION.bucket+'/'+DESTINATION.prefix],{
      encoding:'utf8',stdio:['ignore','pipe','ignore'],
      timeout:120_000,maxBuffer:50_000_000,
    });
    const report=summarizePrivateStaging(inventory,cli);
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(process.env.GITHUB_STEP_SUMMARY){
      const {appendFileSync}=await import('node:fs');
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        safeStagingSummary(report)+'\n','utf8');
    }
    // Old CLI count 986 includes virtual directories and is NOT a stable
    // object-integrity invariant. A mismatch is informational only.
    if(!report.listingMethodsAgree)process.exitCode=1;
    return;
  }
  const result=await verifyStorageReadOnly({token});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.sourceToStagingBytesMatch)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(error=>{
    const safeCode=typeof error?.auditCode==='string'&&
      /^(?:(?:SOURCE|DESTINATION)_(?:GCS_HTTP_(?:400|401|403|404|408|429|500|502|503|504|OTHER)|INVENTORY_UNAVAILABLE)|GCS_HTTP_(?:400|401|403|404|408|429|500|502|503|504|OTHER))$/.test(error.auditCode)
      ?error.auditCode:'AUDIT_NOT_VERIFIED';
    console.error('Private Storage integrity audit blocked: '+safeCode+
      '. No object names, credentials, provider response bodies or contents printed.');
    process.exitCode=2;
  });
