import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {
  harptosKey,validateHarptosDate,planTemporalEmulator,
} from './stage-temporal-emulator.mjs';

const HASH=createHash('sha256').update('demo-private-snapshot').digest('hex');
const t=(table,columns,rows)=>({table,columns,rows});
const history=[
 'public.campaign_calendar_audit','public.campaign_time_operations',
 'public.campaign_temporal_consumers','public.campaign_temporal_deliveries',
 'public.campaign_temporal_delivery_resolutions',
 'public.campaign_temporal_effect_checkpoints',
];
export function syntheticTemporalRows(){
  const tables=[
    t('public.campaign_calendar',
      ['id','year','month','day','festival','auto_advance','last_round','version','updated_at','updated_by'],
      [{id:'t',year:'1522',month:'0',day:'1',festival:null,auto_advance:'t',
        last_round:'3',version:'12',updated_at:'2026-11-13 14:00:00+00',updated_by:'private-user-id'}]),
  ];
  for(const name of history){
    tables.push(t(name,['id','private_value'],
      name==='public.campaign_time_operations'
        ? [{id:'historic-op',private_value:'private-temporal-history'}]
        : []));
  }
  return tables;
}

test('Harptos is not Gregorian calendar; verifies festival and leap Shieldmeet',()=>{
  assert.equal(harptosKey(1522,0,1,null),'1522-01-01');
  assert.equal(harptosKey(1522,11,30,null),'1522-12-30');
  assert.equal(harptosKey(1524,6,30,'shieldmeet'),'1524-F-shieldmeet');
  assert.equal(harptosKey(1522,6,30,'midsummer'),'1522-F-midsummer');
  assert.equal(validateHarptosDate(1522,6,30,'shieldmeet'),false);
  assert.equal(validateHarptosDate(1524,5,30,'shieldmeet'),false);
  assert.equal(validateHarptosDate(1522,11,31,null),false);
  assert.equal(validateHarptosDate(1522,12,1,null),false);
  assert.throws(()=>harptosKey(1522,6,30,'shieldmeet'));
});

test('preserves one typed calendar and all 7 private source history tables',()=>{
  const plan=planTemporalEmulator(syntheticTemporalRows(),HASH);
  assert.equal(plan.summary.planValid,true);
  assert.equal(plan.projection.dateKey,'1522-01-01');
  assert.equal(plan.projection.tenday,1);
  assert.equal(plan.projection.autoAdvance,true);
  assert.equal(plan.projection.lastRound,3);
  assert.equal(plan.projection.version,12);
  assert.equal(plan.summary.migratedTemporalTables,7);
  assert.equal(plan.summary.temporalHistoryRows,2);
  assert.equal(plan.summary.cloudWrites,0);
  assert.equal(plan.summary.readyForCloudImport,false);
  assert.ok(!JSON.stringify(plan.projection).includes('private-user-id'));
  assert.ok(!JSON.stringify(plan.summary).includes('private-temporal-history'));
});

test('missing history, extra calendar rows and invalid date fail closed',()=>{
  const noHistory=planTemporalEmulator(syntheticTemporalRows().slice(0,2),HASH);
  assert.equal(noHistory.summary.planValid,false);
  assert.equal(noHistory.summary.missingHistoryTables.length,5);
  const doubleCalendar=syntheticTemporalRows();
  doubleCalendar[0].rows.push({...doubleCalendar[0].rows[0]});
  assert.equal(planTemporalEmulator(doubleCalendar,HASH).summary.planValid,false);
  const badDate=syntheticTemporalRows();
  Object.assign(badDate[0].rows[0],{year:'1522',month:'6',day:'30',festival:'shieldmeet'});
  assert.equal(planTemporalEmulator(badDate,HASH).summary.planValid,false);
});

test('private history duplicate IDs or oversized values block emulator import',()=>{
  const d=syntheticTemporalRows();
  d[2].rows.push({id:'historic-op',private_value:'duplicated'});
  assert.equal(planTemporalEmulator(d,HASH).summary.planValid,false);
  const large=syntheticTemporalRows();
  large[2].rows.push({id:'huge-op',private_value:'A'.repeat(900000)});
  const p=planTemporalEmulator(large,HASH);
  assert.equal(p.summary.planValid,true);
  assert.ok(p.summary.fragmentedHistoryRows>=1);
  assert.ok(p.archive.plannedRows.some(r=>r.chunks.length>0));
});
