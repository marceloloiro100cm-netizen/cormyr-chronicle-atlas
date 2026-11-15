import test from 'node:test';
import assert from 'node:assert/strict';
import {extractImagePaths,buildReferenceIndex,pathDocId,letterDocId,replyDocId} from './storage-references-core.mjs';
import {buildStoragePlan} from './stage-storage-references-emulator.mjs';

const SNAP='a'.repeat(64);
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});

test('extractImagePaths finds unique well-formed references only',()=>{
  const c='x [cormyr-image:u1/a.png|alt] y [cormyr-image:u1/a.png|b] [cormyr-image:../bad path|] [cormyr-image:u2/b.jpg|z]';
  assert.deepEqual(extractImagePaths(c),['u1/a.png','u2/b.jpg']);
  assert.deepEqual(extractImagePaths(null),[]);
  assert.deepEqual(extractImagePaths(''),[]);
});

test('buildReferenceIndex maps paths to hashed source ids and keeps reviewed gallery only',()=>{
  const idx=buildReferenceIndex({
    letters:[{id:'L1',content:'[cormyr-image:u/a.png|]'}],
    replies:[{id:'R1',content:'[cormyr-image:u/a.png|]'}],
    records:[{id:'rec1',content:'[cormyr-image:u/b.png|]'}],
    catalog:[
      {public_reviewed:'t',gallery:'[{"path":"g/1.png"},{"path":"g/2.png"}]'},
      {public_reviewed:'f',gallery:'[{"path":"g/hidden.png"}]'},
      {public_reviewed:'t',gallery:'not json'},
    ]});
  assert.deepEqual(idx.refs.get('u/a.png'),{letters:[letterDocId('L1')],replies:[replyDocId('R1')],records:[]});
  assert.deepEqual(idx.refs.get('u/b.png').records,['rec1']);
  assert.deepEqual([...idx.gallery].sort(),['g/1.png','g/2.png']);
  assert.equal(idx.invalidGallery,1);
});

test('buildStoragePlan stores ids and paths only and blocks on invalid gallery or missing tables',()=>{
  const ok=buildStoragePlan([
    tab('public.campaign_letters',[{id:'L1',content:'[cormyr-image:u/a.png|]'}]),
    tab('public.letter_replies',[]),
    tab('public.campaign_records',[{id:'r1',content:'sem imagem'}]),
    tab('public.house_catalog',[{public_reviewed:'t',gallery:'[{"path":"g/1.png"}]'}]),
  ],SNAP);
  assert.equal(ok.summary.planValid,true);
  assert.equal(ok.summary.referencedPaths,1);
  assert.equal(ok.summary.galleryPaths,1);
  assert.equal(ok.docs.refs[0].id,pathDocId('u/a.png'));
  assert.ok(!JSON.stringify(ok.docs).includes('sem imagem'));
  assert.equal(buildStoragePlan([tab('public.campaign_letters',[])],SNAP).summary.planValid,false);
  const noReplies=buildStoragePlan([
    tab('public.campaign_letters',[]),
    tab('public.campaign_records',[]),
    tab('public.house_catalog',[]),
  ],SNAP);
  assert.deepEqual(noReplies.summary.missingTables,1);
  assert.equal(noReplies.summary.planValid,false);
  const noCatalog=buildStoragePlan([
    tab('public.campaign_letters',[]),
    tab('public.letter_replies',[]),
    tab('public.campaign_records',[]),
  ],SNAP);
  assert.equal(noCatalog.summary.planValid,false);
  const allEmpty=buildStoragePlan([
    tab('public.campaign_letters',[]),
    tab('public.letter_replies',[]),
    tab('public.campaign_records',[]),
    tab('public.house_catalog',[]),
  ],SNAP);
  assert.equal(allEmpty.summary.planValid,true);
  assert.equal(buildStoragePlan([tab('public.campaign_letters',[]),tab('public.campaign_records',[]),
    tab('public.house_catalog',[{public_reviewed:'t',gallery:'{"a":1}'}])],SNAP).summary.planValid,false);
  assert.throws(()=>buildStoragePlan([],'x'));
});
