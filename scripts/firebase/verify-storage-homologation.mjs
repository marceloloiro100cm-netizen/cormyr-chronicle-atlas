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
    if(!response.ok)throw Error('Private Storage listing unavailable');
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
export async function verifyStorageReadOnly({token,fetcher=fetch}){
  const [source,target]=await Promise.all([
    listGcsPrefix(SOURCE,token,fetcher),
    listGcsPrefix(DESTINATION,token,fetcher),
  ]);
  return compareStorageCopies(source,target);
}
async function main(args){
  if(args.length!==1||args[0]!=='--readonly-live')
    throw Error('Use --readonly-live (owner Cloud Shell only)');
  const project=execFileSync('gcloud',['config','get-value','project'],{
    encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10_000,
  }).trim();
  if(project!=='cormyr')throw Error('Wrong Google Cloud project');
  const token=execFileSync('gcloud',['auth','print-access-token','--quiet'],{
    encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:15_000,
  }).trim();
  const result=await verifyStorageReadOnly({token});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.sourceToStagingBytesMatch)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(()=>{
    console.error('Private Storage integrity audit blocked; no object names, credentials or contents printed.');
    process.exitCode=2;
  });
