import test from 'node:test';
import assert from 'node:assert/strict';
import {planReviewedPublicContent} from './public-content-review-plan.mjs';

const SNAP='a'.repeat(64);
const PUBLIC_HOUSE={
  id:'synthetic_house',name:'Synthetic House',region:'Synthetic Region',
  classification:'Minor',updated_at:null,gallery:[],
  narrative_text:'PUBLIC REVIEWED DESCRIPTION',active:true,season:2,
  publicReviewed:true,
  treasury:999,privateNotes:'SYNTHETIC_PRIVATE_NOTES_DO_NOT_COPY',
};
const PUBLIC_TRANSLATION={
  entity_type:'house',entity_id:'synthetic_house',field_name:'name',
  translated_text:'Translated Reviewed Name',publicReviewed:true,
  privateTranslationNote:'SYNTHETIC_TRANSLATION_PRIVATE_NOTE',
};
const inputs=()=>({
  snapshotId:SNAP,catalogVersion:3,translationsVersion:2,
  houses:[{...PUBLIC_HOUSE}],
  playerHouses:[{house_id:'synthetic_house'}],
  translationsByLocale:{
    en:[{...PUBLIC_TRANSLATION}],es:[],de:[],
  },
});
const plan=overrides=>planReviewedPublicContent({...inputs(),...overrides});
const denied=result=>{
  assert.equal(result.summary.reviewPlanValid,false);
  assert.equal(result.privatePlan,null);
  assert.equal(result.summary.cloudWrites,0);
  assert.equal(result.summary.readyForCutover,false);
};

test('reviewed public plan is private, offline, explicitly pending and field allowlisted',()=>{
  const result=plan();
  assert.equal(result.summary.reviewPlanValid,true);
  assert.equal(result.summary.reviewedHouses,1);
  assert.equal(result.summary.reviewedPlayerHouseReferences,1);
  assert.equal(result.summary.reviewedTranslationsByLocale.en,1);
  assert.equal(result.summary.cloudWrites,0);
  assert.equal(result.summary.authWrites,0);
  assert.equal(result.summary.runtimeWrites,0);
  assert.equal(result.summary.releaseDecision,'NO_GO');
  assert.equal(result.summary.readyForCutover,false);
  assert.equal(result.privatePlan.stage.status,'pending');
  assert.equal(result.privatePlan.stage.private,true);
  assert.equal(result.privatePlan.stage.sourceSnapshotId,SNAP);
  assert.equal(result.privatePlan.catalog.houses[0].publicReviewed,true);
  assert.deepEqual(result.privatePlan.catalog.playerHouses,
    [{house_id:'synthetic_house'}]);
  assert.equal(result.privatePlan.translations.en.rows[0].translated_text,
    PUBLIC_TRANSLATION.translated_text);
  const serialized=JSON.stringify(result.privatePlan);
  assert.ok(!serialized.includes('SYNTHETIC_PRIVATE_NOTES_DO_NOT_COPY'));
  assert.ok(!serialized.includes('SYNTHETIC_TRANSLATION_PRIVATE_NOTE'));
  const summary=JSON.stringify(result.summary);
  for(const secret of [SNAP,'synthetic_house','Synthetic House',
    'PUBLIC REVIEWED DESCRIPTION','Translated Reviewed Name']){
    assert.ok(!summary.includes(secret));
  }
});

test('missing sources, unsupported locale, invalid version and snapshot block plan',()=>{
  for(const changes of [
    {snapshotId:'bad'},{houses:[]},{houses:null},{houses:[{},{}]},
    {playerHouses:null},{translationsByLocale:{}},
    {translationsByLocale:{en:[],es:[],de:[],pt:[]}},
    {translationsByLocale:{en:[],es:[]}},
    {catalogVersion:0},{translationsVersion:'1'},
  ]){
    denied(plan(changes));
  }
});

test('every source House requires explicit review and valid public fields',()=>{
  for(const changes of [
    {publicReviewed:false},{publicReviewed:undefined},{active:false},
    {season:1},{name:''},{region:''},{classification:''},
    {id:'../private'},{gallery:['javascript:alert(1)']},
    {narrative_text:'X'.repeat(15001)},
  ]){
    denied(plan({houses:[{...PUBLIC_HOUSE,...changes}]}));
  }
});

test('duplicates, invalid memberships and private translations fail all closed',()=>{
  for(const changes of [
    {houses:[PUBLIC_HOUSE,PUBLIC_HOUSE]},
    {playerHouses:[{house_id:'OTHER_HOUSE'}]},
    {playerHouses:[{house_id:'synthetic_house'},{house_id:'synthetic_house'}]},
    {translationsByLocale:{
      en:[{...PUBLIC_TRANSLATION,entity_type:'record'}],es:[],de:[],
    }},
    {translationsByLocale:{
      en:[{...PUBLIC_TRANSLATION,publicReviewed:false}],es:[],de:[],
    }},
    {translationsByLocale:{
      en:[{...PUBLIC_TRANSLATION,entity_id:'unpublished_house'}],es:[],de:[],
    }},
    {translationsByLocale:{
      en:[PUBLIC_TRANSLATION,PUBLIC_TRANSLATION],es:[],de:[],
    }},
  ]){
    denied(plan(changes));
  }
});

test('oversized public catalog cannot be generated even with approved rows',()=>{
  const houses=Array.from({length:50},(_,i)=>({
    ...PUBLIC_HOUSE,id:'synthetic_'+i,name:'Synthetic '+i,
    narrative_text:'A'.repeat(15000),
  }));
  const result=plan({
    houses,playerHouses:[],
    translationsByLocale:{en:[],es:[],de:[]},
  });
  denied(result);
  assert.ok(result.summary.issueCounts.oversizedDocuments>0);
});

test('explicitly empty reviewed locales do not invent translations',()=>{
  const result=plan({translationsByLocale:{en:[],es:[],de:[]}});
  assert.equal(result.summary.reviewPlanValid,true);
  for(const locale of ['en','es','de'])
    assert.deepEqual(result.privatePlan.translations[locale].rows,[]);
});
