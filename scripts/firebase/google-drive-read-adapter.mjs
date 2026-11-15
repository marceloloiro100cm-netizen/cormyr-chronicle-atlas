/**
 * Server-only Google Drive v3 adapter for homologation: READ-ONLY.
 *
 * Existing Firestore Emulator Drive service injects an adapter with
 * {list,read,write}; this implementation deliberately refuses writes until
 * the real Google OAuth scope, conditional updates and account ownership have
 * been verified in isolated homologation. No client receives Drive tokens.
 */
import {DriveError,validateEnvelope} from './drive-core.mjs';

const FILE_ID=/^[A-Za-z0-9_-]{10,256}$/;
const BASE='https://www.googleapis.com/drive/v3/files';
const SIZE_LIMIT=2_100_000;
const FILE_LIMIT=5000;
const FIELDS='nextPageToken,files(id,name,mimeType,parents,size,trashed)';
const LIST_FIELDS='id,name,mimeType,parents,size,trashed';
function denial(){return new DriveError('denied','Google Drive não autorizado neste escopo');}
function unavailable(){return new DriveError('invalid','Google Drive indisponível para homologação');}

export function createGoogleDriveReadAdapter({
  allowedFolderIds,getAccessToken,fetcher=fetch,
}){
  if(!Array.isArray(allowedFolderIds)||allowedFolderIds.length===0||
     allowedFolderIds.length>50||!allowedFolderIds.every(x=>FILE_ID.test(x))||
     typeof getAccessToken!=='function'||typeof fetcher!=='function')
    throw Error('Explicit approved Drive folders and token provider required');
  const folders=new Set(allowedFolderIds);
  const listed=new Map();
  const auth=async()=>{
    const token=await getAccessToken();
    if(typeof token!=='string'||token.length<10||/\s/.test(token))throw denial();
    return {Authorization:'Bearer '+token};
  };
  const send=async(url,headers)=>{
    try{
      const response=await fetcher(url.toString(),{
        method:'GET',headers,redirect:'error',cache:'no-store',
        signal:AbortSignal.timeout(12_000),
      });
      if(!response.ok)throw unavailable();
      return response;
    }catch{throw unavailable();}
  };
  async function list(folder){
    if(!folders.has(folder))throw denial();
    const headers=await auth();
    const files=[],seen=new Set(),pages=new Set();
    let next;
    do{
      const u=new URL(BASE);
      u.searchParams.set('q',`'${folder}' in parents and trashed = false and mimeType = 'application/json'`);
      u.searchParams.set('fields',FIELDS);
      u.searchParams.set('pageSize','1000');
      u.searchParams.set('supportsAllDrives','true');
      u.searchParams.set('includeItemsFromAllDrives','true');
      if(next)u.searchParams.set('pageToken',next);
      const res=await send(u,headers);
      const body=await res.json().catch(()=>{throw unavailable();});
      if(!body||!Array.isArray(body.files))throw unavailable();
      for(const f of body.files){
        if(!FILE_ID.test(f.id)||f.mimeType!=='application/json'||
           typeof f.name!=='string'||f.name.length>256||
           !Array.isArray(f.parents)||!f.parents.includes(folder)||
           (f.trashed!==undefined&&f.trashed!==false)||
           !/^(0|[1-9][0-9]*)$/.test(String(f.size))||
           !Number.isSafeInteger(Number(f.size))||Number(f.size)>SIZE_LIMIT||
           seen.has(f.id))
          throw unavailable();
        seen.add(f.id);
        files.push({id:f.id,name:f.name,parents:f.parents,size:String(f.size)});
        listed.set(f.id,folder);
        if(files.length>FILE_LIMIT)throw unavailable();
      }
      next=body.nextPageToken;
      if(next&&(typeof next!=='string'||pages.has(next)||pages.size>20))
        throw unavailable();
      if(next)pages.add(next);
    }while(next);
    return files;
  }
  async function read(fileId){
    const folder=listed.get(fileId);
    if(!folder||!folders.has(folder)||!FILE_ID.test(fileId))throw denial();
    const headers=await auth();
    const metadataUrl=new URL(BASE+'/'+encodeURIComponent(fileId));
    metadataUrl.searchParams.set('fields',LIST_FIELDS);
    metadataUrl.searchParams.set('supportsAllDrives','true');
    const metaResponse=await send(metadataUrl,headers);
    const meta=await metaResponse.json().catch(()=>{throw unavailable();});
    if(!meta||meta.id!==fileId||meta.mimeType!=='application/json'||
       !Array.isArray(meta.parents)||!meta.parents.includes(folder)||
       meta.trashed===true||!Number.isSafeInteger(Number(meta.size))||
       Number(meta.size)>SIZE_LIMIT)throw denial();
    const mediaUrl=new URL(BASE+'/'+encodeURIComponent(fileId));
    mediaUrl.searchParams.set('alt','media');
    mediaUrl.searchParams.set('supportsAllDrives','true');
    const media=await send(mediaUrl,headers);
    const text=await media.text();
    if(Buffer.byteLength(text,'utf8')>SIZE_LIMIT)throw unavailable();
    let envelope;
    try{
      envelope=JSON.parse(text);
      validateEnvelope(envelope);
    }catch{throw unavailable();}
    const etag=metaResponse.headers.get('etag')||media.headers.get('etag')||null;
    return {envelope,etag};
  }
  return {
    list,read,
    async write(){throw new DriveError('denied',
      'Envio Google Drive bloqueado até autenticação e atualização condicional homologadas');},
  };
}
