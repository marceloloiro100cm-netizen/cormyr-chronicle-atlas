/**
 * Lote 4: validate the five private browser-export manifests OFFLINE.
 * Never reads attachments, uploads files, logs object names or grants cutover.
 * Validation of recorded SHA-256 fields is NOT verification of file bytes.
 */
import {lstat,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const MEDIA_BUCKETS=Object.freeze([
  'campaign-images','campaign-newspapers','campaign-newspaper-staff',
  'campaign-newspaper-commissions','campaign-newspaper-engravings',
]);
const MAX_MANIFEST_BYTES=20*1024*1024;
const MAX_ITEMS=100_000;
const SHA256=/^[a-fA-F0-9]{64}$/;
const SAFE_BUCKET=new Set(MEDIA_BUCKETS);

export function validateMediaManifest(bucket,manifest){
  if(!SAFE_BUCKET.has(bucket))throw Error('Unknown media bucket');
  const issues=[];
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
     manifest.version!==1||manifest.bucket!==bucket||
     !Array.isArray(manifest.files)||manifest.files.length>MAX_ITEMS||
     typeof manifest.complete!=='boolean'){
    return {bucket,manifestPresent:manifest!==undefined,
      filesDeclared:0,bytesDeclared:0,completeDeclared:false,
      schemaValid:false,issues:['invalid_manifest_schema']};
  }
  let bytes=0,entriesValid=true;
  const uniquePaths=new Set();
  for(const file of manifest.files){
    if(!file||typeof file!=='object'||Array.isArray(file)){
      entriesValid=false;continue;
    }
    const path=file.path;
    const safePath=typeof path==='string'&&path.length>0&&path.length<=1024&&
      !path.startsWith('/')&&!path.includes('\\')&&!path.includes('//')&&
      !path.split('/').some(segment=>segment===''||segment==='.'||segment==='..')&&
      !/[\u0000-\u001f\u007f]/.test(path);
    const safeId=typeof file.id==='string'&&file.id.length>0&&file.id.length<=1024;
    const safeHash=typeof file.sha256==='string'&&SHA256.test(file.sha256);
    const safeSize=Number.isSafeInteger(file.size)&&file.size>=0;
    const safeDate=typeof file.updatedAt==='string'&&file.updatedAt.length>0&&
      file.updatedAt.length<=128;
    if(!safePath||!safeId||!safeHash||!safeSize||!safeDate){
      entriesValid=false;continue;
    }
    if(uniquePaths.has(path))issues.push('duplicate_paths');
    uniquePaths.add(path);
    bytes+=file.size;
    if(!Number.isSafeInteger(bytes))entriesValid=false;
  }
  if(!entriesValid)issues.push('invalid_file_metadata');
  if(manifest.complete!==true)issues.push('export_incomplete');
  return {bucket,manifestPresent:true,filesDeclared:manifest.files.length,
    bytesDeclared:Number.isSafeInteger(bytes)?bytes:null,
    completeDeclared:manifest.complete,schemaValid:entriesValid&&
      !issues.includes('duplicate_paths'),issues:[...new Set(issues)],
  };
}

export function auditMediaManifestBundle(manifests){
  if(!manifests||typeof manifests!=='object'||Array.isArray(manifests))
    throw Error('Expected private manifest dictionary');
  const buckets=MEDIA_BUCKETS.map(bucket=>{
    if(!Object.hasOwn(manifests,bucket))return {
      bucket,manifestPresent:false,filesDeclared:0,bytesDeclared:0,
      completeDeclared:false,schemaValid:false,issues:['manifest_missing'],
    };
    return validateMediaManifest(bucket,manifests[bucket]);
  });
  const totalFiles=buckets.reduce((sum,b)=>sum+b.filesDeclared,0);
  const totalBytes=buckets.some(b=>b.bytesDeclared===null)?null:
    buckets.reduce((sum,b)=>sum+b.bytesDeclared,0);
  const allComplete=buckets.every(b=>b.manifestPresent&&b.completeDeclared&&
    b.schemaValid&&b.issues.length===0);
  return {
    scope:'OFFLINE_PRIVATE_MEDIA_EXPORT_MANIFESTS',expectedBuckets:MEDIA_BUCKETS.length,
    checkedBuckets:buckets.filter(b=>b.manifestPresent).length,
    completeBuckets:buckets.filter(b=>b.manifestPresent&&b.completeDeclared&&b.schemaValid).length,
    totalFilesDeclared:totalFiles,totalBytesDeclared:totalBytes,
    allManifestsComplete:allComplete,issues:buckets.flatMap(b=>b.issues.map(code=>({bucket:b.bucket,code}))),
    buckets,sha256ValuesWellFormedOnly:true,bytesVerified:false,
    sourceInventoryStableVerified:false,sourceLiveReconciled:false,
    destinationFilesVerified:false,readyForCloudImport:false,
    readyForCutover:false,cloudWrites:0,
  };
}

export async function inspectMediaManifestDirectory(directory){
  if(typeof directory!=='string'||!directory)throw Error('Private directory required');
  const root=resolve(directory);
  const rootStats=await lstat(root);
  if(!rootStats.isDirectory()||rootStats.isSymbolicLink())
    throw Error('Private directory required');
  const manifests=Object.create(null);
  for(const bucket of MEDIA_BUCKETS){
    const filePath=join(root,bucket+'.manifest.json');
    let stats;
    try {stats=await lstat(filePath);}catch(error){
      if(error?.code==='ENOENT')continue;
      throw Error('Private manifest unreadable');
    }
    if(!stats.isFile()||stats.isSymbolicLink()||stats.size>MAX_MANIFEST_BYTES)
      throw Error('Unsafe media manifest');
    try {manifests[bucket]=JSON.parse(await readFile(filePath,'utf8'));}
    catch {manifests[bucket]=null;}
  }
  return auditMediaManifestBundle(manifests);
}

async function main(args){
  if(args.length!==2||args[0]!=='--directory'||!args[1]||args[1].startsWith('--'))
    throw Error('Usage: --directory PRIVATE_EXPORT_ROOT');
  const report=await inspectMediaManifestDirectory(args[1]);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.allManifestsComplete)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(()=>{
    console.error('Media manifest audit blocked; no filenames or private data printed.');
    process.exitCode=2;
  });
