import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planNewspaperEmulator} from './stage-newspaper-emulator.mjs';

const HASH=createHash('sha256').update('newspaper-private-dummy-snapshot').digest('hex');
const row=(id,edition,state,options={})=>({
  id,edition_no:String(edition),
  campaign_date:options.date||'1522-01-01',
  title:'Private edition title',subtitle:'Article subtitle',
  template:'classico',font_style:options.font||'classico',state,
  blocks:JSON.stringify([{kind:'text',text:options.text||'Private story'}]),
  pdf_path:null,version:'1',publication_revision:'0',
  created_at:'2026-11-13 00:00:00+00',updated_at:null,
  published_at:state==='published'?'2026-11-13 01:00:00+00':null,
  publish_on:options.publishOn??null,
});
const tab=(table,rows,columns)=>({
  table,rows,columns:columns||Object.keys(rows[0]||{id:''}),
});
const extra=[
  'campaign_newspaper_revisions','campaign_newspaper_reads',
  'campaign_newspaper_commissions','campaign_newspaper_staff',
  'campaign_newspaper_story_models','campaign_newspaper_engravings',
];

export function syntheticNewspaperSource(){
  const editions=[
    row('published-id',1,'published',{text:'Visible published content'}),
    row('draft-id',2,'draft',{text:'Private draft content',publishOn:'1524-F-shieldmeet',font:'gotica'}),
    row('archived-id',3,'archived',{font:'romana'}),
    row('cancelled-id',4,'cancelled'),
  ];
  return [
    tab('public.campaign_newspapers',editions),
    ...extra.map(name=>tab('public.'+name,[],['id','private_value'])),
    tab('public.campaign_newspaper_settings',[{
      id:'t',title:'A Folha Sem Selo',subtitle:'Jornal do reino',
      template:'gazeta',font_style:'romana',
    }]),
  ];
}

test('keeps 4 editions, private draft/cancelled separated, no private text in aggregate summary',()=>{
  const plan=planNewspaperEmulator(syntheticNewspaperSource(),HASH);
  assert.equal(plan.summary.planValid,true);
  assert.equal(plan.summary.actualSourceTables,8);
  assert.equal(plan.summary.sourceEditionRows,4);
  assert.equal(plan.summary.publishedEditions,2);
  assert.equal(plan.summary.privateEditions,2);
  assert.equal(plan.summary.archivedSourceRows,5);
  assert.equal(plan.summary.firebaseCloudWrites,0);
  assert.equal(plan.summary.readyForCloudImport,false);
  assert.equal(plan.settings[0].payload.title,'A Folha Sem Selo');
  assert.equal(plan.privateEditions.find(e=>e.payload.state==='draft').payload.publishOn,'1524-F-shieldmeet');
  const summary=JSON.stringify(plan.summary);
  assert.ok(!summary.includes('Private draft content'));
  assert.ok(!summary.includes('Visible published content'));
  assert.equal(plan.archive.plannedRows.length,5);
  assert.ok(plan.archive.tableDocs.every(t=>t.payload.sourceTable.startsWith('public.campaign_newspaper')));
});

test('rejects missing tables, invalid article, duplicate editions and non-Harptos dates',()=>{
  const missing=syntheticNewspaperSource().slice(0,4);
  assert.equal(planNewspaperEmulator(missing,HASH).summary.planValid,false);
  const invalid=syntheticNewspaperSource();
  invalid[0].rows[1].campaign_date='1522-07-31';
  assert.equal(planNewspaperEmulator(invalid,HASH).summary.planValid,false);
  const shield=syntheticNewspaperSource();
  shield[0].rows[1].publish_on='1522-F-shieldmeet';
  assert.equal(planNewspaperEmulator(shield,HASH).summary.planValid,false);
  const duplicate=syntheticNewspaperSource();
  duplicate[0].rows[1].id=duplicate[0].rows[0].id;
  assert.equal(planNewspaperEmulator(duplicate,HASH).summary.planValid,false);
  const duplicateNo=syntheticNewspaperSource();
  duplicateNo[0].rows[1].edition_no='1';
  assert.equal(planNewspaperEmulator(duplicateNo,HASH).summary.planValid,false);
  const invalidFont=syntheticNewspaperSource();
  invalidFont[0].rows[1].font_style='moderno';
  assert.equal(planNewspaperEmulator(invalidFont,HASH).summary.planValid,false);
});

test('large edition never becomes a partial public doc, though raw source stays archived',()=>{
  const source=syntheticNewspaperSource();
  source[0].rows[0].blocks=JSON.stringify([{kind:'text',text:'x'.repeat(870000)}]);
  const p=planNewspaperEmulator(source,HASH);
  assert.equal(p.summary.planValid,false);
  assert.equal(p.summary.issues.oversizedEdition,1);
  assert.equal(p.summary.issues.incompleteEditionCoverage,1);
  assert.ok(p.archive.plannedRows.some(x=>x.chunks.length>0));
});

test('invalid metadata and malformed JSON are not presented to viewers',()=>{
  const bad=syntheticNewspaperSource();
  bad[0].rows[0].blocks='broken';
  assert.equal(planNewspaperEmulator(bad,HASH).summary.planValid,false);
  const setting=syntheticNewspaperSource();
  setting.at(-1).rows[0].font_style='unsupported';
  assert.equal(planNewspaperEmulator(setting,HASH).summary.planValid,false);
  const pdf=syntheticNewspaperSource();
  pdf[0].rows[0].pdf_path='../private.pdf';
  assert.equal(planNewspaperEmulator(pdf,HASH).summary.planValid,false);
});
