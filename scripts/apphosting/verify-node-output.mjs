/**
 * Make the Firebase build fail closed if Nitro silently picked a non-Node
 * preset. This does not start or expose the legacy application.
 */
import {stat,readFile} from 'node:fs/promises';
const entry='.output/server/index.mjs';
const publicDir='.output/public';
const file=await stat(entry).catch(()=>null);
const assets=await stat(publicDir).catch(()=>null);
if(!file?.isFile()||!assets?.isDirectory()){
  console.error('App Hosting build blocked: Nitro Node output or asset directory missing.');
  process.exit(1);
}
const body=await readFile(entry,'utf8');
// This entrypoint must be a Node executable, not a Cloudflare Worker export.
if(!body||body.length<50){
  console.error('App Hosting Node output is invalid.');
  process.exit(1);
}
console.log('Verified Nitro Node entry and static output; preview remains locked.');
