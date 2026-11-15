import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MEDIA_BUCKETS,validateMediaManifest,auditMediaManifestBundle,
  inspectMediaManifestDirectory} from './audit-media-export-manifests.mjs';

const secret='private-user-token-do-not-log';
const entry=(path='images/portrait.png')=>({path,id:'id-'+secret,
 updatedAt:'2026-11-12T12:00:00Z',size:55,sha256:'a'.repeat(64)});
const fixture=bucket=>({version:1,bucket,complete:true,files:[entry()]});
const complete=()=>Object.fromEntries(MEDIA_BUCKETS.map(x=>[x,fixture(x)]));

test('five complete schema manifests validate declarations only, never bytes/cloud',()=>{
 const r=auditMediaManifestBundle(complete());
 assert.equal(r.allManifestsComplete,true);
 assert.equal(r.completeBuckets,5);
 assert.equal(r.totalFilesDeclared,5);
 assert.equal(r.bytesVerified,false);
 assert.equal(r.sourceLiveReconciled,false);
 assert.equal(r.readyForCloudImport,false);
 assert.equal(r.readyForCutover,false);
 assert.equal(r.cloudWrites,0);
 assert.ok(!JSON.stringify(r).includes(secret));
});

test('incomplete and missing manifests block migration without leaking paths',()=>{
 const manifests={'campaign-images':{...fixture('campaign-images'),complete:false}};
 const r=auditMediaManifestBundle(manifests);
 assert.equal(r.checkedBuckets,1);
 assert.equal(r.allManifestsComplete,false);
 assert.deepEqual(r.issues.map(i=>i.code),[
  'export_incomplete',...Array(4).fill('manifest_missing')]);
 assert.ok(!JSON.stringify(r).includes(secret));
});

test('duplicate paths, traversal and invalid hashes block when declared complete',()=>{
 let m=fixture('campaign-images');m.files.push(entry());
 let r=validateMediaManifest('campaign-images',m);
 assert.equal(r.schemaValid,false);
 assert.ok(r.issues.includes('duplicate_paths'));
 m=fixture('campaign-images');m.files=[entry('../private/secret')];
 r=validateMediaManifest('campaign-images',m);
 assert.equal(r.schemaValid,false);
 assert.ok(r.issues.includes('invalid_file_metadata'));
 m=fixture('campaign-images');m.files=[{...entry(),sha256:'not-a-hash'}];
 assert.equal(validateMediaManifest('campaign-images',m).schemaValid,false);
});

test('invalid schema, unsafe bucket and overlarge sizes block the audit',()=>{
 assert.throws(()=>validateMediaManifest('other',fixture('other')),/Unknown/);
 assert.equal(validateMediaManifest('campaign-images',{
  version:2,bucket:'campaign-images',complete:true,files:[]}).schemaValid,false);
 const m=fixture('campaign-images');m.files[0].size=Number.MAX_SAFE_INTEGER+1;
 assert.equal(validateMediaManifest('campaign-images',m).schemaValid,false);
 const invalid=fixture('campaign-images');invalid.files=[{...entry(),path:'a\\\\secret'}];
 assert.equal(validateMediaManifest('campaign-images',invalid).schemaValid,false);
});

test('scans fixed names and rejects symlinks before reading private files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cormyr-media-test-'));
 try{
  for(const bucket of MEDIA_BUCKETS)
   await writeFile(join(dir,bucket+'.manifest.json'),JSON.stringify(fixture(bucket)));
  let r=await inspectMediaManifestDirectory(dir);
  assert.equal(r.allManifestsComplete,true);
  await rm(join(dir,'campaign-newspapers.manifest.json'));
  await symlink(join(dir,'campaign-images.manifest.json'),
    join(dir,'campaign-newspapers.manifest.json'));
  await assert.rejects(inspectMediaManifestDirectory(dir),/Unsafe media manifest/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('invalid JSON remains blocked without leaking content',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cormyr-media-test-'));
 try{
  await writeFile(join(dir,'campaign-images.manifest.json'),'SECRET_DUMP_DO_NOT_PRINT');
  const r=await inspectMediaManifestDirectory(dir);
  assert.equal(r.allManifestsComplete,false);
  assert.equal(r.checkedBuckets,1);
  assert.ok(!JSON.stringify(r).includes('SECRET_DUMP'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
