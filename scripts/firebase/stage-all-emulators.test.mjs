import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {
  planUnifiedEmulator,executeUnifiedEmulator,
} from './stage-all-emulators.mjs';

const HASH=createHash('sha256').update('fully-synthetic-private-backup').digest('hex');
const BCRYPT='$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
const t=(table,rows,columns=Object.keys(rows[0]||{id:''}))=>({table,rows,columns});
const temporalNames=[
  'campaign_calendar_audit','campaign_time_operations',
  'campaign_temporal_consumers','campaign_temporal_deliveries',
  'campaign_temporal_delivery_resolutions',
  'campaign_temporal_effect_checkpoints',
];
const newspaperNames=[
  'campaign_newspapers','campaign_newspaper_revisions',
  'campaign_newspaper_reads','campaign_newspaper_commissions',
  'campaign_newspaper_staff','campaign_newspaper_story_models',
  'campaign_newspaper_engravings','campaign_newspaper_settings',
];
function syntheticSource(){
  const users=[
    {id:'narrator',email:'narrator@example.invalid',encrypted_password:BCRYPT},
    {id:'player',email:'player@example.invalid',encrypted_password:BCRYPT},
  ];
  const tables=[
    t('auth.users',users),
    t('auth.identities',[],['id','user_id','provider','provider_id']),
    t('public.user_roles',[{id:'admin-role',user_id:'narrator',role:'admin'}]),
    t('public.campaign_access_profiles',[
      {user_id:'narrator',profile:'narrador',active:'t'},
      {user_id:'player',profile:'jogador',active:'t'},
    ]),
    t('public.campaign_houses',[
      {id:'house-a',name:'Casa A',castle:null,crest:null,season:'2',active:'t'},
    ]),
    t('public.campaign_players',[{
      id:'player-a',user_id:'player',name:'Jogador',
      active:'t',require_password_change:'f',roster_house_id:'house-a',
    }]),
    t('public.house_memberships',[{
      player_id:'player-a',house_id:'house-a',
      can_edit:'t',can_edit_attributes:'f',
    }]),
    t('public.campaign_letters',[],[
      'id','sender_user_id','recipient_player_id','recipient_house_id',
      'subject','content','created_at',
    ]),
    t('public.campaign_calendar',[{
      id:'t',year:'1522',month:'0',day:'1',festival:null,
      auto_advance:'t',version:'1',last_round:null,
    }]),
    ...temporalNames.map(x=>t('public.'+x,[],['id'])),
    ...newspaperNames.map(x=>t('public.'+x,[],['id'])),
  ];
  return tables;
}

test('consolidates 4 Firestore models and 1 Auth plan with no cloud access',()=>{
  const tables=syntheticSource();
  const plan=planUnifiedEmulator(tables,HASH);
  assert.equal(plan.summary.readyForEmulatorStage,true);
  for(const stage of Object.values(plan.summary.stages))
    assert.equal(stage.valid,true);
  assert.equal(plan.summary.stages.typedDomain.collections.houses,1);
  assert.equal(plan.summary.stages.typedDomain.collections.players,1);
  assert.equal(plan.summary.stages.typedDomain.collections.access,2);
  assert.equal(plan.summary.stages.typedDomain.letters.source,0);
  assert.equal(plan.summary.stages.temporal.calendarProjected,true);
  assert.equal(plan.summary.stages.temporal.historyTables,7);
  assert.equal(plan.summary.stages.newspaper.historyTables,8);
  assert.equal(plan.summary.stages.auth.importCandidates,2);
  assert.equal(plan.summary.cloudWrites,0);
  assert.equal(plan.summary.readyForCloudImport,false);
  assert.equal(plan.summary.readyForCutover,false);
  assert.ok(!JSON.stringify(plan.summary).includes('narrator@example.invalid'));
  assert.ok(!JSON.stringify(plan.summary).includes(BCRYPT));
});

test('any missing domain table blocks ALL emulator writes',()=>{
  const tables=syntheticSource().filter(x=>x.table!=='public.campaign_newspaper_settings');
  const plan=planUnifiedEmulator(tables,HASH);
  assert.equal(plan.summary.stages.newspaper.valid,false);
  assert.equal(plan.summary.readyForEmulatorStage,false);
});
test('missing Auth table or zero Auth users blocks a unified stage',()=>{
  const missing=syntheticSource().filter(x=>x.table!=='auth.identities');
  const p=planUnifiedEmulator(missing,HASH);
  assert.deepEqual(p.summary.missingAuthTables,['auth.identities']);
  assert.equal(p.summary.readyForEmulatorStage,false);
  const empty=syntheticSource();
  empty.find(x=>x.table==='auth.users').rows=[];
  assert.equal(planUnifiedEmulator(empty,HASH).summary.readyForEmulatorStage,false);
});

test('wrong project or missing local emulator host is rejected before any IO',async()=>{
  const plan=planUnifiedEmulator(syntheticSource(),HASH);
  const fakeDb={collection:()=>{throw Error('must not access db');}};
  await assert.rejects(executeUnifiedEmulator(plan,fakeDb,{},{}),/emulator/);
  await assert.rejects(executeUnifiedEmulator(plan,fakeDb,{},{
    FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST:'firebase.googleapis.com:443',
  }),/emulator/i);
});

test('existing Auth account blocks all Firestore writes in unified flow',async()=>{
  const plan=planUnifiedEmulator(syntheticSource(),HASH);
  let writes=0,reads=0;
  const db={collection:()=>({
    doc:()=>({
      get:async()=>{reads++;return {exists:false};},
      set:()=>{writes++;},
    }),
  })};
  const auth={listUsers:async()=>({users:[{uid:'existing'}]})};
  await assert.rejects(executeUnifiedEmulator(plan,db,auth,{
    FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',
  }),/destination already contains/);
  assert.equal(reads,5);
  assert.equal(writes,0);
});
