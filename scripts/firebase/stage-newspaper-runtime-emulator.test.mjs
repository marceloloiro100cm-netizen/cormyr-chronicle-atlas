import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNewspaperRuntimePlan,readDocId} from './stage-newspaper-runtime-emulator.mjs';

const SNAP='a'.repeat(64);
const E1='11111111-1111-4111-8111-111111111111';
const E2='22222222-2222-4222-8222-222222222222';
const C1='33333333-3333-4333-8333-333333333333';
const K1='44444444-4444-4444-8444-444444444444';
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const ed=(id,no,o={})=>({id,edition_no:String(no),campaign_date:'1522-01-05',title:'T',subtitle:'',template:'classico',
  font_style:'gotica',state:'published',blocks:'[{"kind":"text"}]',pdf_path:'',version:'2',publication_revision:'1',
  created_by:'u',updated_by:'u',created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-02 00:00:00+00',
  published_at:'2026-01-02 00:00:00+00',archived_at:'',cancelled_at:'',publish_on:'',...o});
const source=(over={})=>[
  tab('public.campaign_newspapers',[ed(E1,1),ed(E2,2,{state:'draft',publish_on:'1524-F-shieldmeet'})]),
  tab('public.campaign_newspaper_revisions',[{id:'7',newspaper_id:E1,previous_version:'1',snapshot:'{"title":"old"}',changed_by:'u',changed_at:'2026-01-01 00:00:00+00'}]),
  tab('public.campaign_newspaper_reads',[{newspaper_id:E1,user_id:'u1',read_version:'1',read_at:'2026-01-03 00:00:00+00'}]),
  tab('public.campaign_newspaper_commissions',[{id:C1,house_id:'hA',requested_by:'u1',title:'Titulo',body:'Corpo da noticia',image_path:'',
    cost_wealth:'1',state:'pending',rejection_note:'',rejected_at:'',rejected_by:'',request_key:K1,newspaper_id:'',
    created_at:'2026-01-04 00:00:00+00',published_at:'',seen_at:''}]),
  tab('public.campaign_newspaper_staff',[{id:E1,name:'Ana',specialty:'',bio:'',photo_path:'',created_by:'u',created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-01 00:00:00+00'}]),
  tab('public.campaign_newspaper_story_models',[{id:E2,name:'M',description:'',blocks:'[{"kind":"text"}]',created_by:'u',created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-01 00:00:00+00'}]),
  tab('public.campaign_newspaper_engravings',[{id:C1,name:'G',image_path:'',public_src:'/newspaper/gravuras/a.jpg',in_collection:'t',created_by:'',created_at:'2000-01-01 00:00:01+00'}]),
  tab('public.campaign_newspaper_settings',[{id:'t',title:'A Folha',subtitle:'x',template:'gazeta',font_style:'romana',updated_by:'',updated_at:'2026-01-01 00:00:00+00'}]),
  ...[]].map(t=>over[t.table]?{...t,rows:over[t.table]}:t);

test('imports every table into the runtime stage with full coverage', () => {
  const p=buildNewspaperRuntimePlan(source(),SNAP);
  assert.equal(p.summary.planValid,true);
  assert.deepEqual(p.summary.stagedCounts,{editions:2,revisions:1,reads:1,commissions:1,staff:1,models:1,engravings:1,settings:1});
  assert.equal(p.revisionSeq,7);
  const draft=p.docs.editions.find(d=>d.id===E2).payload;
  assert.equal(draft.publishOn,'1524-F-shieldmeet');assert.equal(draft.pdfPath,null);assert.equal(draft.fontStyle,'gotica');
  assert.equal(p.docs.reads[0].id,readDocId(E1,'u1'));
  assert.equal(p.docs.commissions[0].payload.imagePath,null);
  assert.equal(p.docs.engravings[0].payload.inCollection,true);
});

test('blocks the plan on invalid, duplicate or orphan source rows', () => {
  const badEdition=buildNewspaperRuntimePlan(source({'public.campaign_newspapers':[ed(E1,1,{state:'weird'})]}),SNAP);
  assert.equal(badEdition.summary.planValid,false);assert.ok(badEdition.summary.issues.invalidValues>0);
  const dupNo=buildNewspaperRuntimePlan(source({'public.campaign_newspapers':[ed(E1,1),ed(E2,1)]}),SNAP);
  assert.equal(dupNo.summary.planValid,false);
  const orphan=buildNewspaperRuntimePlan(source({'public.campaign_newspaper_reads':[{newspaper_id:E2+'x',user_id:'u',read_version:'1',read_at:''}]}),SNAP);
  assert.ok(orphan.summary.issues.orphanLinks>0);assert.equal(orphan.summary.planValid,false);
  assert.throws(()=>buildNewspaperRuntimePlan([],'nope'));
  const missing=buildNewspaperRuntimePlan([],SNAP);
  assert.equal(missing.summary.planValid,false);assert.equal(missing.summary.missingRequiredTables,1);
});

test('summary carries counts only, never row contents', () => {
  const s=JSON.stringify(buildNewspaperRuntimePlan(source(),SNAP).summary);
  assert.ok(!s.includes('Corpo da noticia'));assert.ok(!s.includes(E1));
});
