/**
 * Explicit read-only Google Drive smoke test, limited to one approved folder.
 * Requires an OAuth token with drive.readonly rights in the process environment.
 * Prints counts only, never file names, IDs, content, token or envelope.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createGoogleDriveReadAdapter} from './google-drive-read-adapter.mjs';

export async function probeDriveFolder(adapter,folder,{maxFiles=20}={}){
  if(typeof folder!=='string'||!Number.isInteger(maxFiles)||
     maxFiles<1||maxFiles>100)
    throw Error('Invalid bounded Drive probe');
  const files=await adapter.list(folder);
  let checked=0;
  for(const file of files.slice(0,maxFiles)){
    await adapter.read(file.id);
    checked++;
  }
  return {
    scope:'ISOLATED_READ_ONLY_DRIVE_HOMOLOGATION',
    listedJsonFiles:files.length,validatedEnvelopes:checked,
    scanLimited:files.length>checked,
    googleDriveWrites:0,siteWrites:0,readyForCutover:false,
  };
}
async function main(args){
  if(args.length!==1||args[0]!=='--readonly-probe')
    throw Error('Only --readonly-probe is permitted');
  const folder=process.env.GOOGLE_DRIVE_HOMOLOGATION_FOLDER_ID;
  const token=process.env.GOOGLE_DRIVE_HOMOLOGATION_ACCESS_TOKEN;
  if(typeof folder!=='string'||!folder||typeof token!=='string'||!token)
    throw Error('Private Drive authorization is unavailable');
  const adapter=createGoogleDriveReadAdapter({
    allowedFolderIds:[folder],
    getAccessToken:async()=>token,
  });
  const result=await probeDriveFolder(adapter,folder);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(()=>{
    console.error('Drive read-only probe blocked; no private metadata or credentials printed.');
    process.exitCode=1;
  });
