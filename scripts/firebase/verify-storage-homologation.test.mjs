import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE,DESTINATION,compareStorageCopies,listGcsPrefix,verifyStorageReadOnly,summarizePrivateStaging,HISTORICAL_GCLOUD_ENTRY_COUNT}
  from './verify-storage-homologation.mjs';
const CRC='AAAAAA==',CRC2='AQAAAA==';
const obj=(prefix,path,crc32c=CRC,size='1024')=>({
 name:prefix+path,crc32c,size,
});
const src=[obj(SOURCE.prefix,'image-a.png'),obj(SOURCE.prefix,'private/image-b.webp',CRC2,'0')];
const dst=[obj(DESTINATION.prefix,'image-a.png'),obj(DESTINATION.prefix,'private/image-b.webp',CRC2,'0')];

test('read-only byte comparison succeeds with equal paths, CRC32C and sizes',()=>{
 const r=compareStorageCopies(src,dst);
 assert.equal(r.sourceToStagingBytesMatch,true);
 assert.equal(r.sourceObjects,2);
 assert.equal(r.destinationObjects,2);
 assert.equal(r.cloudWrites,0);
 assert.equal(r.readyForCutover,false);
 assert.equal(r.otherBucketsVerified,false);
 assert.equal(JSON.stringify(r).includes('private/image-b'),false);
});
test('checksum, size, deleted or added objects block acceptance',()=>{
 const mismatch=compareStorageCopies(src,[
   dst[0],{...dst[1],size:'1',crc32c:CRC},
 ]);
 assert.equal(mismatch.sourceToStagingBytesMatch,false);
 assert.equal(mismatch.crcMismatch,1);
 assert.equal(mismatch.sizeMismatch,1);
 const missing=compareStorageCopies(src,[dst[0]]);
 assert.equal(missing.missing,1);
 assert.equal(missing.sourceToStagingBytesMatch,false);
 const extra=compareStorageCopies(src,[...dst,obj(DESTINATION.prefix,'other.png')]);
 assert.equal(extra.extra,1);
 assert.equal(extra.sourceToStagingBytesMatch,false);
});
test('missing CRC32C, traversal, duplicate and malformed source metadata fail closed',()=>{
 assert.throws(()=>compareStorageCopies([{...src[0],crc32c:null}],dst));
 assert.throws(()=>compareStorageCopies([...src,src[0]],dst));
 assert.throws(()=>compareStorageCopies([{...src[0],name:SOURCE.prefix+'../bad.png'}],dst));
 assert.throws(()=>compareStorageCopies([{...src[0],size:'2E5'}],dst));
 assert.throws(()=>compareStorageCopies(src,[{...dst[0],name:SOURCE.prefix+'image-a.png'}]));
});
test('paginated GCS JSON API uses GET and fixed scoped bucket only',async()=>{
 const calls=[];
 const fetcher=async (url,options)=>{
   calls.push({url,options});
   const u=new URL(url);
   assert.equal(options.method,'GET');
   assert.equal(u.origin,'https://storage.googleapis.com');
   const source=u.pathname.includes(encodeURIComponent(SOURCE.bucket));
   const prefix=source?SOURCE.prefix:DESTINATION.prefix;
   if(u.searchParams.get('pageToken')==='page2')
     return Response.json({items:[obj(prefix,'private/image-b.webp',CRC2,'0')]});
   return Response.json({items:[obj(prefix,'image-a.png')],nextPageToken:'page2'});
 };
 const result=await verifyStorageReadOnly({token:'test-token-long-enough',fetcher});
 assert.equal(result.sourceToStagingBytesMatch,true);
 assert.equal(calls.length,4);
 assert.ok(calls.every(x=>x.options.headers.Authorization==='Bearer test-token-long-enough'));
 await assert.rejects(listGcsPrefix({bucket:'production-unknown',prefix:'x/'},'token-long-enough',fetcher));
});
test('unauthorized or cyclic pagination fails without writing data',async()=>{
 const fail=async()=>new Response('{}',{status:403});
 await assert.rejects(listGcsPrefix(SOURCE,'test-token-long-enough',fail));
 const cyclic=async()=>Response.json({items:[],nextPageToken:'repeat'});
 await assert.rejects(listGcsPrefix(SOURCE,'test-token-long-enough',cyclic));
});

test('CLI 986 entries may contain 207 virtual folders and only 779 real GCS objects',()=>{
 const sample=Array.from({length:779},(_,i)=>obj(DESTINATION.prefix+'nested/','file-'+i+'.webp'));
 const prefix='gs://'+DESTINATION.bucket+'/'+DESTINATION.prefix;
 const real=sample.map(x=>'gs://'+DESTINATION.bucket+'/'+x.name);
 const folders=Array.from({length:207},(_,i)=>prefix+'virtual-dir-'+i+'/');
 const report=summarizePrivateStaging(sample,[...real,...folders].join('\n'));
 assert.equal(HISTORICAL_GCLOUD_ENTRY_COUNT,986);
 assert.equal(report.destinationObjects,779);
 assert.equal(report.cliEntries,986);
 assert.equal(report.cliPseudoFolders,207);
 assert.equal(report.cliUniqueObjectEntries,779);
 assert.equal(report.onlyInCli,0);
 assert.equal(report.onlyInApi,0);
 assert.equal(report.listingMethodsAgree,true);
 assert.equal(report.matchesHistoricalEntryCount,true);
 assert.equal(report.readyForCutover,false);
 assert.equal(report.sourceCompared,false);
 assert.equal(report.cloudWrites,0);
 assert.equal(JSON.stringify(report).includes('nested/'),false);
});
test('real missing or extra objects remain blocked, independent of virtual folders',()=>{
 const prefix='gs://'+DESTINATION.bucket+'/'+DESTINATION.prefix;
 const onlyApi=[obj(DESTINATION.prefix,'a.webp')];
 const none=summarizePrivateStaging(onlyApi,prefix+'other.webp');
 assert.equal(none.listingMethodsAgree,false);
 assert.equal(none.onlyInCli,1);
 assert.equal(none.onlyInApi,1);
 const missing=summarizePrivateStaging(onlyApi,prefix+'virtual/');
 assert.equal(missing.listingMethodsAgree,false);
 assert.equal(missing.cliPseudoFolders,1);
});
