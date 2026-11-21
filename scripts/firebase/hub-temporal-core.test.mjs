import test from 'node:test';
import assert from 'node:assert/strict';
import {absoluteDay,fromAbsoluteDay,dayOfYear,nextTendayStart,weekPeriod,parseDateKey,
  dateKeyOf,dateKeyInRange,festivalOccurrence,festivalsInRange,fixedFestivalEntries,
  planFestivalSave,visibleForRegions} from './hub-temporal-core.mjs';

const D=(year,month,day,festival=null)=>({year,month,day,festival});

test('dias absolutos distinguem a mesma data em anos diferentes',()=>{
  assert.notEqual(absoluteDay(D(1522,9,21)),absoluteDay(D(1300,9,21)));
  for(const d of [D(1,0,1),D(1522,9,21),D(1524,6,30,'shieldmeet'),D(1300,10,30,'feast-moon'),D(9999,11,30)])
    assert.deepEqual(fromAbsoluteDay(absoluteDay(d)),d);
  assert.equal(dayOfYear(D(1523,6,30,'shieldmeet')),0,'Encontro dos Escudos só em bissexto');
  assert.equal(absoluteDay(D(1523,0,1))-absoluteDay(D(1522,0,1)),365);
  assert.equal(absoluteDay(D(1525,0,1))-absoluteDay(D(1524,0,1)),366);
});

test('a semana cobre até a próxima désdia e inclui dias festivos do fim do mês',()=>{
  assert.deepEqual(nextTendayStart(D(1522,9,15)),D(1522,9,21));
  assert.deepEqual(nextTendayStart(D(1522,10,21)),D(1522,11,1));
  assert.deepEqual(nextTendayStart(D(1522,10,30,'feast-moon')),D(1522,11,1));
  assert.deepEqual(nextTendayStart(D(1522,11,25)),D(1523,0,1));
  const p=weekPeriod(D(1522,10,21));
  assert.equal(p.end-p.start,11,'dias 21 a 30 de Uktar mais a Festa da Lua');
  assert.ok(dateKeyInRange('1522-F-feast-moon',p.start,p.end));
  assert.ok(!dateKeyInRange('1522-12-01',p.start,p.end));
  assert.ok(!dateKeyInRange('1300-11-25',p.start,p.end));
});

test('chaves de data seguem o formato do calendário oficial',()=>{
  assert.deepEqual(parseDateKey('1522-10-21'),D(1522,9,21));
  assert.deepEqual(parseDateKey('1524-F-shieldmeet'),D(1524,6,30,'shieldmeet'));
  assert.equal(parseDateKey('1523-F-shieldmeet'),null);
  assert.equal(dateKeyOf(D(1522,9,21)),'1522-10-21');
  assert.equal(dateKeyOf(D(1300,10,30,'feast-moon')),'1300-F-feast-moon');
});

test('festivais anuais começam no ano informado; únicos só existem nele',()=>{
  const yearly={id:'fest-aaaaaaaa',name:'Vigília',scope:'kingdom',region:null,
    date:D(1350,9,18),repeat:'yearly',durationDays:1,notify:true,description:''};
  assert.equal(festivalOccurrence(yearly,1300),null);
  assert.ok(festivalOccurrence(yearly,1522));
  const once={...yearly,id:'fest-bbbbbbbb',date:D(1522,9,25),repeat:'once',durationDays:3};
  assert.equal(festivalOccurrence(once,1523),null);
  const p=weekPeriod(D(1522,9,21));
  const found=festivalsInRange([yearly,once],p.start,p.end);
  assert.deepEqual(found.map(x=>x.festival.id),['fest-bbbbbbbb']);
  assert.equal(found[0].end-found[0].start,3);
  const fixed=fixedFestivalEntries({'feast-moon':false});
  assert.equal(fixed.length,6);
  assert.equal(fixed.find(f=>f.id==='fixed-feast-moon').notify,false);
  assert.equal(festivalsInRange(fixed,...Object.values(weekPeriod(D(1523,6,21)))).some(x=>x.festival.id==='fixed-shieldmeet'),false);
  assert.equal(festivalsInRange(fixed,...Object.values(weekPeriod(D(1524,6,21)))).some(x=>x.festival.id==='fixed-shieldmeet'),true);
});

test('cadastro de festival valida região, data e versão',()=>{
  const deny=(code,status)=>{const e=Error(code);e.code=code;e.status=status;throw e;};
  const ctx={deny,newId:()=>'fest-00000001',uid:'n',at:'2026-11-21T00:00:00Z'};
  const base={name:'Feira',scope:'region',region:'1',date:D(1522,9,25),repeat:'once',
    durationDays:3,notify:true,description:''};
  const saved=planFestivalSave(null,base,ctx);
  assert.equal(saved.version,1);assert.equal(saved.region,'1');
  assert.throws(()=>planFestivalSave(null,{...base,region:'9'},ctx),e=>e.code==='invalid_festival');
  assert.throws(()=>planFestivalSave(null,{...base,date:D(1523,6,30,'shieldmeet')},ctx),e=>e.code==='invalid_festival');
  assert.throws(()=>planFestivalSave(saved,{...base,id:saved.id,version:5},ctx),e=>e.code==='festival_version_conflict');
  const edited=planFestivalSave(saved,{...base,id:saved.id,version:1,scope:'kingdom',region:null},ctx);
  assert.equal(edited.version,2);assert.equal(edited.region,null);
  assert.equal(visibleForRegions({scope:'region',region:'1'},['2']),false);
  assert.equal(visibleForRegions({scope:'region',region:'1'},null),true);
  assert.equal(visibleForRegions({scope:'kingdom',region:null},[]),true);
});
