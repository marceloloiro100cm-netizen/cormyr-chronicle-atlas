import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWorkspaceMetadata} from './workspace-audit.mjs';
const snapshot='a'.repeat(64);
function fixture(rootValue=null,tables={}){
  const docs=new Map();
  if(rootValue)docs.set('campaignWorkspaceImports/'+snapshot,rootValue);
  for(const [table,value] of Object.entries(tables))
    docs.set('campaignWorkspaceImports/'+snapshot+'/tables/'+table,value);
  const node=path=>({
    collection:part=>node(path?path+'/'+part:part),
    doc:id=>node(path+'/'+id),
    async get(){return {exists:docs.has(path),data:()=>docs.get(path)};},
  });
  return {db:{collection:name=>node(name)},docs};
}
const validRoot=()=>({status:'complete',private:true,formatVersion:1,
  sourceSnapshotId:snapshot,counts:{campaign_letters:2,letter_replies:3,campaign_records:1}});
const meta=(rows,id)=>({rowCount:rows,columns:['id','content'],sourceTableDocumentId:id});

test('pending import is not represented as completed',async()=>{
 const f=fixture();
 assert.deepEqual(await inspectWorkspaceMetadata(f.db,snapshot),{
  status:'pending',readOnly:true,metadataConsistent:false,
  rowHashesRechecked:false,relationshipsVerified:false,
  operationalConnected:false,
 });
});
test('narrator metadata proof tracks real table totals without disclosing content',async()=>{
 const f=fixture(validRoot(),{
  campaign_letters:meta(2,'private-source-1'),
  letter_replies:meta(3,'private-source-2'),
  campaign_records:meta(1,'private-source-3'),
 });
 const report=await inspectWorkspaceMetadata(f.db,snapshot);
 assert.equal(report.status,'complete');
 assert.equal(report.tablesImported,3);
 assert.equal(report.rowsImported,6);
 assert.equal(report.metadataConsistent,true);
 assert.equal(report.operationalConnected,false);
 assert.equal(report.relationshipsVerified,false);
 assert.equal(report.modules.missivas.rows,5);
 assert.equal(report.modules.registros.rows,1);
 assert.equal(report.modules.espionagem.rows,0);
 assert.ok(report.modules.espionagem.missingTables.includes('spy_operations'));
 assert.ok(!JSON.stringify(report).includes('private-source-1'));
 assert.ok(!JSON.stringify(report).includes(snapshot));
});
test('tampered document metadata and invented names fail closed',async()=>{
 for(const mutation of [
   root=>{root.counts['campaign_letters']=3;},
   root=>{root.counts['auth.users']=1;},
   root=>{root.sourceSnapshotId='b'.repeat(64);},
   root=>{root.private=false;},
   root=>{root.counts.letter_replies=-1;},
 ]){
   const root=validRoot();mutation(root);
   const f=fixture(root,{
     campaign_letters:meta(2,'private-source-1'),
     letter_replies:meta(3,'private-source-2'),
     campaign_records:meta(1,'private-source-3'),
   });
   await assert.rejects(()=>inspectWorkspaceMetadata(f.db,snapshot),/workspace_metadata_inconsistent/);
 }
});
test('incomplete table metadata cannot be classified as verified',async()=>{
 const f=fixture(validRoot(),{
  campaign_letters:meta(2,'private-source-1'),
  letter_replies:meta(3,'private-source-2'),
 });
 await assert.rejects(()=>inspectWorkspaceMetadata(f.db,snapshot),/workspace_metadata_inconsistent/);
});
