import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleDriveReadAdapter} from './google-drive-read-adapter.mjs';
import {DriveError} from './drive-core.mjs';
const FOLDER='testFolderValid123',OTHER='anotherFolder12345';
const FILE='fileIdentifier12345',ID='11111111-1111-4111-8111-111111111111';
const envelope={schema:'cormyr-record-v1',entityType:'record',id:ID,
  houseId:'h1',playerId:null,visibility:'house',version:2,baseVersion:1,
  title:'T',content:'Private letter',kind:'document',
  createdAt:'2026-01-01T00:00:00+00:00',
  updatedAt:'2026-01-02T00:00:00+00:00',
  authorName:'',mutationId:ID,origin:'site'};
const file={id:FILE,name:'cormyr-record-'+ID+'.json',mimeType:'application/json',
  size:'760',parents:[FOLDER],trashed:false};

function mockDrive({metadata=file,payload=envelope,metadataEtag='W/"rev-1"',mediaEtag='W/"rev-1"'}={}){
  const seen=[];
  const fetcher=async(url,options)=>{
    const u=new URL(url);seen.push({url:u.toString(),options});
    assert.equal(options.method,'GET');
    assert.equal(u.origin,'https://www.googleapis.com');
    assert.equal(options.headers.Authorization,'Bearer fake-oauth-token');
    if(u.pathname==='/drive/v3/files'){
      assert.match(u.searchParams.get('q'),/in parents and trashed = false/);
      return Response.json({files:[file]});
    }
    if(u.searchParams.get('alt')==='media')
      return Response.json(payload,{headers:{etag:mediaEtag}});
    if(u.pathname.endsWith('/'+FILE))
      return Response.json(metadata,{headers:{etag:metadataEtag}});
    return new Response('unexpected',{status:404});
  };
  return {seen,fetcher};
}
const create=(fetcher)=>createGoogleDriveReadAdapter({
  allowedFolderIds:[FOLDER],getAccessToken:async()=> 'fake-oauth-token',fetcher,
});
test('Google Drive reader pages an allowlisted folder and validates its JSON envelope',async()=>{
  const {seen,fetcher}=mockDrive();
  const a=create(fetcher);
  const files=await a.list(FOLDER);
  assert.deepEqual(files,[{id:FILE,name:file.name,parents:[FOLDER],size:'760'}]);
  const result=await a.read(FILE);
  assert.equal(result.envelope.id,ID);
  assert.equal(result.etag,'W/"rev-1"');
  assert.deepEqual(seen.map(s=>new URL(s.url).searchParams.get('alt')),[null,null,'media']);
  assert.ok(seen.every(c=>!c.options.body));
});
test('cannot query unapproved folder or file id before listing',async()=>{
  const {fetcher}=mockDrive();const a=create(fetcher);
  await assert.rejects(a.list(OTHER),DriveError);
  await assert.rejects(a.read(FILE),DriveError);
  await assert.rejects(a.read('invalid/../file'),DriveError);
  await assert.rejects(a.write(FOLDER,envelope),DriveError);
});
test('folder moves and invalid JSON envelopes fail closed',async()=>{
  const wrong=mockDrive({metadata:{...file,parents:[OTHER]}});
  const a=create(wrong.fetcher);
  await a.list(FOLDER);
  await assert.rejects(a.read(FILE),DriveError);
  const malformed=mockDrive({payload:{...envelope,extra:'not allowed'}});
  const b=create(malformed.fetcher);
  await b.list(FOLDER);
  await assert.rejects(b.read(FILE),DriveError);
});
test('no token or API denial never causes a Supabase fallback',async()=>{
  const a=createGoogleDriveReadAdapter({
    allowedFolderIds:[FOLDER],getAccessToken:async()=>null,
  });
  await assert.rejects(a.list(FOLDER),DriveError);
  const b=create(async()=>new Response('{}',{status:403}));
  await assert.rejects(b.list(FOLDER),DriveError);
});
test('Drive folder listing is bounded and never trusts repeated page tokens',async()=>{
  const fetcher=async()=>Response.json({files:[],nextPageToken:'repeat'});
  const a=create(fetcher);
  await assert.rejects(a.list(FOLDER),DriveError);
  assert.throws(()=>createGoogleDriveReadAdapter({allowedFolderIds:[],getAccessToken:async()=> 'x'}));
});

test('never lists arbitrary JSON or file names outside the canonical campaign format',async()=>{
 const renamed=mockDrive({metadata:{...file,name:'private-notes.json'}});
 const a=create(renamed.fetcher);
 await assert.rejects(a.list(FOLDER),DriveError);
 const foreign=mockDrive({metadata:{...file,name:'cormyr-record-22222222-2222-4222-8222-222222222222.json'}});
 const b=create(foreign.fetcher);
 await b.list(FOLDER);
 await assert.rejects(b.read(FILE),DriveError);
});
test('metadata changes after listing never authorize importing a different file',async()=>{
 for(const metadata of [
  {...file,name:'cormyr-record-22222222-2222-4222-8222-222222222222.json'},
  {...file,size:'761'},
  {...file,mimeType:'text/html'},
 ]){
  const mock=mockDrive({metadata});
  const a=create(mock.fetcher);
  await a.list(FOLDER);
  await assert.rejects(a.read(FILE),DriveError);
 }
});
test('a different envelope or diverging provider revisions fail closed',async()=>{
 const wrong=mockDrive({payload:{
  ...envelope,id:'22222222-2222-4222-8222-222222222222',
 }});
 const a=create(wrong.fetcher);
 await a.list(FOLDER);
 await assert.rejects(a.read(FILE),DriveError);
 const changed=mockDrive({metadataEtag:'"rev-2"',mediaEtag:'"rev-1"'});
 const b=create(changed.fetcher);
 await b.list(FOLDER);
 await assert.rejects(b.read(FILE),DriveError);
});
