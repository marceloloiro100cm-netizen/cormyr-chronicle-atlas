import test from 'node:test';
import assert from 'node:assert/strict';
import {timeKey,ordinaryIndex,fromOrdinaryIndex,advanceDesdia,calendarOrdinal,absoluteMonth,
  resolveTarget,previewTimeChange,TimeError} from './harptos-core.mjs';

const code=fn=>{try{fn();}catch(e){assert.ok(e instanceof TimeError);return e.code;}return null;};

test('ordinary index round-trips and festivals map to day 30 of their month',()=>{
  assert.equal(ordinaryIndex('0001-01-01'),0);
  assert.equal(fromOrdinaryIndex(ordinaryIndex('1520-07-15')),'1520-07-15');
  assert.equal(ordinaryIndex('1520-F-midsummer'),ordinaryIndex('1520-07-30'));
  assert.equal(code(()=>fromOrdinaryIndex(-1)),'range');
  assert.equal(code(()=>ordinaryIndex('1520-13-01')),'invalid');
});
test('advance desdia: 10 days each, 0 stays, bounds',()=>{
  assert.equal(advanceDesdia('1520-01-05',1),'1520-01-15');
  assert.equal(advanceDesdia('1520-01-25',1),'1520-02-05');
  assert.equal(advanceDesdia('1520-12-30',1),'1521-01-10');
  assert.equal(advanceDesdia('1520-01-05',0),'1520-01-05');
  assert.equal(code(()=>advanceDesdia('1520-01-05',121)),'invalid');
});
test('calendar ordinal counts festivals and Shieldmeet in leap years',()=>{
  const d=(a,b)=>calendarOrdinal(b)-calendarOrdinal(a);
  assert.equal(d('1520-01-30','1520-F-midwinter'),1);
  assert.equal(d('1520-F-midwinter','1520-02-01'),1);
  assert.equal(d('1520-F-midsummer','1520-F-shieldmeet'),1);
  assert.equal(d('1520-F-shieldmeet','1520-08-01'),1);
  assert.equal(d('1521-F-midsummer','1521-08-01'),1); // no Shieldmeet in 1521
  assert.equal(d('1520-12-30','1521-01-01'),1); // no festival between Nightal and Hammer
  assert.equal(d('1520-11-30','1520-F-feast-moon'),1);
});
test('resolve target per mode',()=>{
  assert.equal(resolveTarget('advance',null,3,'1520-01-01'),'1520-01-31'.replace('01-31','02-01'));
  assert.equal(code(()=>resolveTarget('advance','1520-01-01',1,'1520-01-01')),'invalid');
  assert.equal(resolveTarget('set','1521-02-02',1,'1520-01-01'),'1521-02-02');
  assert.equal(code(()=>resolveTarget('set','xx',1,'1520-01-01')),'invalid');
  assert.equal(resolveTarget('publish',null,1,'1520-05-05'),'1520-05-05');
  assert.equal(code(()=>resolveTarget('publish','1520-05-06',1,'1520-05-05')),'invalid');
  assert.equal(code(()=>resolveTarget('x',null,1,'1520-05-05')),'invalid');
});
const cal={year:1520,month:0,day:15,festival:null,version:4,publishedWeek:9};
test('preview: forward crossing lists festivals, years and month delta',()=>{
  const p=previewTimeChange({calendar:cal,mode:'set',date:'1521-02-10',
    houseSheets:[{state:{schemaVersion:1,month:6240}},{state:{schemaVersion:2,month:1}},{state:{schemaVersion:1}}]});
  assert.equal(p.month_delta,13);assert.equal(p.backdated,false);
  assert.deepEqual(p.crossed_years,[1521]);
  assert.deepEqual(p.crossed_festivals,['1520-F-midwinter','1520-F-greengrass','1520-F-midsummer','1520-F-shieldmeet',
    '1520-F-highharvestide','1520-F-feast-moon','1521-F-midwinter']);
  assert.equal(p.house_sheets_to_check,1);assert.equal(p.published_week_unchanged,9);
});
test('preview: backdate reverses order and does not check houses',()=>{
  const p=previewTimeChange({calendar:{...cal,year:1521,month:1},mode:'set',date:'1520-11-01',allowBackdate:true,houseSheets:[{state:{schemaVersion:1,month:1}}]});
  assert.equal(p.backdated,true);assert.equal(p.backdate_authorized,true);
  assert.equal(p.house_sheets_to_check,0);
  assert.deepEqual(p.crossed_years,[1520]);
  assert.equal(p.crossed_festivals[0],'1521-F-midwinter');
});
test('preview limits: more than 120 months is refused; publish keeps the date',()=>{
  assert.equal(code(()=>previewTimeChange({calendar:cal,mode:'set',date:'1531-01-01'})),'invalid');
  const p=previewTimeChange({calendar:cal,mode:'publish'});
  assert.equal(p.to,p.from);assert.equal(p.month_delta,0);assert.deepEqual(p.crossed_festivals,[]);
  assert.equal(absoluteMonth('1520-F-shieldmeet'),1520*12+6);
  assert.equal(timeKey(1520,6,30,'shieldmeet'),'1520-F-shieldmeet');
});
