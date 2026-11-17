import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync}
  from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  summarizePublicAssetInventory,inspectPublicAssetInventory,safeAssetSummary,
} from './public-archive-asset-integrity.mjs';

const archive=()=>({regions:[{name:'Helmlands',houses:[
  {name:'Evenhand',historyPath:'histories/evenhand.json',
    crest:'assets/evenhand.webp'},
  {name:'Missing',historyPath:'histories/missing.json',
    crest:'assets/missing.webp'},
  {name:'No history',crest:'assets/note.webp'},
]}]});
test('reports only aggregate asset coverage and never approves publication',()=>{
  const r=summarizePublicAssetInventory({
    archive:archive(),
    checkHistory:path=>path==='histories/evenhand.json',
    checkCrest:path=>path==='assets/evenhand.webp',
  });
  assert.equal(r.houses,3);
  assert.equal(r.historyReferences,2);
  assert.equal(r.historyVerified,1);
  assert.equal(r.historyUnverified,1);
  assert.equal(r.withoutHistoryReference,1);
  assert.equal(r.crestReferences,3);
  assert.equal(r.crestVerified,1);
  assert.equal(r.crestUnverified,2);
  assert.equal(r.cloudWrites,0);
  assert.equal(r.reviewApproved,false);
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.releaseDecision,'NO_GO');
  const safe=JSON.stringify(r)+safeAssetSummary(r);
  for(const val of ['Evenhand','missing.json','assets/note.webp'])
    assert.ok(!safe.includes(val));
});
test('rejects traversal, invalid file names and provider exceptions',()=>{
  const a=archive();
  a.regions[0].houses.push({
    name:'Private trap',historyPath:'histories/../secret.json',
    crest:'assets/../../secret.webp',
  });
  let called=0;
  const r=summarizePublicAssetInventory({
    archive:a,
    checkHistory:()=>{called++;throw Error('PRIVATE_FILE_PATH');},
    checkCrest:()=>{called++;throw Error('PRIVATE_FILE_PATH');},
  });
  assert.equal(r.historyUnverified,3);
  assert.equal(r.crestUnverified,4);
  assert.equal(called,5);
  assert.ok(!JSON.stringify(r).includes('PRIVATE_FILE_PATH'));
  assert.throws(()=>summarizePublicAssetInventory({
    archive:{regions:[]},checkHistory:()=>true,checkCrest:()=>true,
  }),/public_asset_inventory_/);
});
test('uses local safe paths, parses history JSON, rejects missing and symlink assets',()=>{
  const dir=mkdtempSync(join(tmpdir(),'cormyr-asset-test-'));
  try{
    mkdirSync(join(dir,'histories'));
    mkdirSync(join(dir,'assets'));
    writeFileSync(join(dir,'data.js'),
      'window.CORMYR_DATA = '+JSON.stringify(archive())+';');
    writeFileSync(join(dir,'histories','evenhand.json'),
      JSON.stringify({text:'Public, unreviewed story'}));
    writeFileSync(join(dir,'assets','evenhand.webp'),'PUBLIC_IMAGE_BYTES');
    writeFileSync(join(dir,'assets','note.webp'),'PHOTO');
    const a=inspectPublicAssetInventory({root:dir});
    assert.equal(a.historyVerified,1);
    assert.equal(a.crestVerified,2);
    symlinkSync(join(dir,'assets','evenhand.webp'),
      join(dir,'assets','missing.webp'));
    const b=inspectPublicAssetInventory({root:dir});
    assert.equal(b.crestVerified,2);
    assert.equal(b.crestUnverified,1);
    writeFileSync(join(dir,'histories','evenhand.json'),
      JSON.stringify({text:''}));
    const c=inspectPublicAssetInventory({root:dir});
    assert.equal(c.historyVerified,0);
    assert.equal(c.readyForCutover,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('checked-in public data is scanned without cloud or personal data',()=>{
  const r=inspectPublicAssetInventory();
  assert.equal(r.regions,11);
  assert.equal(r.houses,172);
  assert.equal(r.historyReferences,170);
  assert.equal(r.withoutHistoryReference,2);
  assert.equal(r.crestReferences,172);
  // The checked-in archive has no malformed referenced file as of this fix.
  // Two houses intentionally lack a history reference; do not fabricate one.
  assert.equal(r.historyVerified,170);
  assert.equal(r.historyUnverified,0);
  assert.equal(r.crestVerified,172);
  assert.equal(r.crestUnverified,0);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.equal(r.cloudReads,0);
  assert.equal(r.cloudWrites,0);
  assert.equal(r.reviewApproved,false);
});
