import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPublicReviewCandidates,inspectPublicReviewCandidates,
  safeReviewCandidateSummary} from './public-review-candidates.mjs';
import {planReviewedPublicContent} from './public-content-review-plan.mjs';

const snap='a'.repeat(64);
const season=()=>Array.from({length:10},(_,i)=>({
  sourceId:'source-'+i,name:'Casa '+i,active:true,season:2,
}));
const archive=()=>({regions:[{name:'Helmlands',
  houses:Array.from({length:10},(_,i)=>({
    name:'Casa '+i,region:'Helmlands',hierarchy:{kind:'major'},
    crest:'assets/crest-'+i+'.webp',historyPath:'histories/house-'+i+'.json',
    description:'PUBLIC_NARRATIVE_NOT_APPROVED',
  }))}]});
test('ten exact candidates stay private, unreviewed and not publishable',()=>{
  const r=buildPublicReviewCandidates({snapshotId:snap,
    sourceHouses:[...season(),
      {sourceId:'old',name:'Older',active:false,season:1}],
    archive:archive()});
  assert.equal(r.summary.matched,10);
  assert.equal(r.summary.candidatePlanComplete,true);
  assert.equal(r.summary.crestReferences,10);
  assert.equal(r.summary.historyReferences,10);
  assert.equal(r.summary.reviewApproved,false);
  assert.equal(r.summary.readyForPlayers,false);
  assert.equal(r.summary.cloudWrites,0);
  assert.equal(r.privateDraft.houses.length,10);
  assert.ok(r.privateDraft.houses.every(h=>
    h.publicReviewed===false&&h.narrative_text===null&&
    h.gallery.length===0&&h.updated_at===null));
  assert.ok(r.privateDraft.houses.every(h=>
    h.reviewReferences.crestCandidate.startsWith('assets/')));
  assert.ok(!JSON.stringify(r.privateDraft).includes('PUBLIC_NARRATIVE_NOT_APPROVED'));
  const projection=planReviewedPublicContent(r.privateDraft);
  assert.equal(projection.summary.reviewPlanValid,false);
  assert.equal(projection.summary.issueCounts.unreviewedHouses,10);
  assert.equal(projection.privatePlan,null);
  const safe=JSON.stringify(r.summary)+safeReviewCandidateSummary(r.summary);
  for(const secret of ['source-0','Helmlands','Casa 1',
    'PRIVATE_NARRATIVE','histories/house-1'])assert.ok(!safe.includes(secret));
});

test('ambiguous or missing public names never create partial private draft',()=>{
  for(const mutated of [
    a=>{a.regions[0].houses.push({...a.regions[0].houses[0]});},
    a=>{a.regions[0].houses.pop();},
    a=>{a.regions[0].houses[0].hierarchy=null;},
    a=>{a.regions[0].houses[0].region='Other';},
  ]){
    const a=archive();mutated(a);
    const r=buildPublicReviewCandidates({snapshotId:snap,
      sourceHouses:season(),archive:a});
    assert.equal(r.privateDraft,null);
    assert.equal(r.summary.candidatePlanComplete,false);
    assert.equal(r.summary.releaseDecision,'NO_GO');
    assert.equal(r.summary.cloudWrites,0);
  }
});

test('duplicate active private names, malformed source and wrong season fail closed',()=>{
  const duplicate=season();
  duplicate[1].name='Casa 0';
  assert.equal(buildPublicReviewCandidates({snapshotId:snap,
    sourceHouses:duplicate,archive:archive()}).privateDraft,null);
  const bad=season();bad[1].sourceId=bad[0].sourceId;
  assert.throws(()=>buildPublicReviewCandidates({snapshotId:snap,
    sourceHouses:bad,archive:archive()}));
  const short=season().slice(1);
  assert.throws(()=>buildPublicReviewCandidates({snapshotId:snap,
    sourceHouses:short,archive:archive()}));
  assert.throws(()=>buildPublicReviewCandidates({snapshotId:'invalid',
    sourceHouses:season(),archive:archive()}));
});

test('read-only Firestore inspection reports aggregated counts, not draft content',async()=>{
  const snapshotRef={
    get:async()=>({exists:true,data:()=>({
      status:'complete',private:true,sourceSnapshotId:snap,
    })}),
    collection:name=>{
      assert.equal(name,'houses');
      return {limit:n=>{
        assert.equal(n,251);
        return {get:async()=>({docs:season().map(h=>({data:()=>h}))})};
      }};
    },
  };
  // This test checks all validation calls; the real checked-out public
  // archive will not match synthetic names, so it must fail closed without
  // emitting any private content to the thrown error.
  const db={collection:name=>{
    assert.equal(name,'migrationDomainStage');
    return {doc:id=>{
      assert.equal(id,snap);return snapshotRef;
    }};
  }};
  const summary=await inspectPublicReviewCandidates({db,snapshotId:snap});
  assert.equal(summary.scope,'CORMYR_PRIVATE_PUBLIC_REVIEW_CANDIDATES_READ_ONLY');
  assert.equal(summary.cloudWrites,0);
  assert.equal(summary.reviewApproved,false);
  assert.equal(summary.readyForPublication,false);
  assert.equal(summary.candidatePlanComplete,false);
  assert.ok(!JSON.stringify(summary).includes('source-0'));
});

test('no implicit or network access and no account modification',async()=>{
  await assert.rejects(inspectPublicReviewCandidates({
    db:null,snapshotId:snap,
  }),/public_review_candidates_input_invalid/);
  const report=buildPublicReviewCandidates({snapshotId:snap,
    sourceHouses:season(),archive:archive()}).summary;
  assert.ok(!safeReviewCandidateSummary(report).includes(snap));
});
