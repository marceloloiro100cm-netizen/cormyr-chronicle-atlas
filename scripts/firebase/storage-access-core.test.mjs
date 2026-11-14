import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccess,requireAccess,BUCKETS as B,StorageAccessError} from './storage-access-core.mjs';

const nar={role:'narrador',uid:'n',playerId:null,memberHouseIds:new Set(),editHouseIds:new Set()};
const alice={role:'jogador',uid:'a',playerId:'pA',memberHouseIds:new Set(['hA']),editHouseIds:new Set(['hA'])};
const viewer={role:'jogador',uid:'v',playerId:'pV',memberHouseIds:new Set(['hA']),editHouseIds:new Set()};
const noPlayer={...alice,uid:'z',playerId:null};
const ok=(a,op,bucket,name,facts)=>canAccess({actor:a,op,bucket,name,facts});

test('campaign-images upload: own folder, and a player id or the Narrator',()=>{
  assert.equal(ok(alice,'upload',B.images,'a/x.png'),true);
  assert.equal(ok(alice,'upload',B.images,'b/x.png'),false);
  assert.equal(ok(alice,'upload',B.images,'x.png'),false);
  assert.equal(ok(noPlayer,'upload',B.images,'z/x.png'),false);
  assert.equal(ok(nar,'upload',B.images,'n/x.png'),true);
  assert.equal(ok(nar,'upload',B.images,'a/x.png'),false);
  assert.equal(ok(null,'upload',B.images,'a/x.png'),false);
});
test('campaign-images read: Narrator, own folder, readable content, crest of an own house, public gallery',()=>{
  assert.equal(ok(nar,'read',B.images,'q/y.png'),true);
  assert.equal(ok(alice,'read',B.images,'a/y.png'),true);
  assert.equal(ok(alice,'read',B.images,'q/y.png'),false);
  assert.equal(ok(alice,'read',B.images,'q/y.png',{referencedByReadableContent:true}),true);
  assert.equal(ok(alice,'read',B.images,'house-crests/hA/c.png',{crestHouseId:'hA'}),true);
  assert.equal(ok(alice,'read',B.images,'house-crests/hB/c.png',{crestHouseId:'hB'}),false);
  assert.equal(ok(alice,'read',B.images,'house-crests/hA/c.png'),false);
  assert.equal(ok(alice,'read',B.images,'house-crests/hAx/c.png',{crestHouseId:'hA'}),false);
  assert.equal(ok(null,'read',B.images,'q/y.png'),false);
  assert.equal(ok(null,'read',B.images,'q/y.png',{publicGalleryImage:true}),true);
  assert.equal(ok(alice,'read',B.images,'q/y.png',{publicGalleryImage:true}),true);
});
test('there is no delete or update policy on campaign-images',()=>{
  assert.equal(ok(nar,'delete',B.images,'a/x.png'),false);
  assert.equal(ok(alice,'delete',B.images,'a/x.png'),false);
});
test('newspaper assets follow the injected predicates',()=>{
  assert.equal(ok(alice,'read',B.newspapers,'n/a.png',{newspaperAssetReadable:true}),true);
  assert.equal(ok(alice,'read',B.newspapers,'n/a.png'),false);
  assert.equal(ok(null,'read',B.newspapers,'n/a.png',{newspaperAssetReadable:true}),false);
  assert.equal(ok(alice,'upload',B.newspapers,'n/a.png',{canEditNewspaper:true,newspaperAssetUploadAllowed:true}),true);
  assert.equal(ok(alice,'upload',B.newspapers,'n/a.png',{canEditNewspaper:true}),false);
  assert.equal(ok(alice,'upload',B.newspapers,'n/a.png',{newspaperAssetUploadAllowed:true}),false);
  assert.equal(ok(nar,'delete',B.newspapers,'n/a.png',{canEditNewspaper:true}),false);
});
const U='123e4567-e89b-12d3-a456-426614174000';
test('commission images: house members read, editors and the Narrator upload with a strict name',()=>{
  assert.equal(ok(viewer,'read',B.commissions,`hA/${U}.png`),true);
  assert.equal(ok(viewer,'read',B.commissions,`hB/${U}.png`),false);
  assert.equal(ok(viewer,'read',B.commissions,`hB/${U}.png`,{canEditNewspaper:true}),true);
  assert.equal(ok(viewer,'upload',B.commissions,`hA/${U}.png`),false);
  assert.equal(ok(alice,'upload',B.commissions,`hA/${U}.png`),true);
  assert.equal(ok(alice,'upload',B.commissions,`hB/${U}.png`),false);
  assert.equal(ok(alice,'upload',B.commissions,`hA/${U}.gif`),false);
  assert.equal(ok(alice,'upload',B.commissions,`hA/x/${U}.png`),false);
  assert.equal(ok(nar,'upload',B.commissions,`hZ/${U}.webp`),true);
  assert.equal(ok(alice,'delete',B.commissions,`hA/${U}.png`),false);
});
test('staff photos and engravings belong to the newspaper editor',()=>{
  for(const b of [B.staff,B.engravings]){
    assert.equal(ok(alice,'read',b,`${U}.png`),false);
    assert.equal(ok(alice,'read',b,`${U}.png`,{canEditNewspaper:true}),true);
    assert.equal(ok(alice,'delete',b,`${U}.png`,{canEditNewspaper:true}),true);
    assert.equal(ok(alice,'upload',b,`${U}.png`,{canEditNewspaper:true}),true);
    assert.equal(ok(alice,'upload',b,`x/${U}.png`,{canEditNewspaper:true}),false);
    assert.equal(ok(alice,'upload',b,`${U}.svg`,{canEditNewspaper:true}),false);
    assert.equal(ok(null,'read',b,`${U}.png`,{canEditNewspaper:true}),false);
  }
});
test('default deny: unknown bucket, operation, path traversal and malformed actors',()=>{
  assert.equal(ok(nar,'read','other','a.png'),false);
  assert.equal(ok(nar,'update',B.images,'n/a.png'),false);
  for(const bad of ['../a.png','a/../b.png','/a.png','a//b.png','a\\b.png','',null,'x'.repeat(1025)])
    assert.equal(ok(nar,'read',B.images,bad),false,String(bad));
  assert.equal(ok({...alice,role:'admin'},'read',B.images,'a/x.png'),false);
  assert.throws(()=>requireAccess({actor:alice,op:'read',bucket:B.images,name:'q/y.png'}),StorageAccessError);
  requireAccess({actor:alice,op:'read',bucket:B.images,name:'a/y.png'});
});
