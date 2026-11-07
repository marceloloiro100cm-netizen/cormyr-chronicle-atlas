import {describe,expect,it} from 'vitest';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelSiege} from '@/lib/battle/got/siege';
import {previewWarSiegeReadiness} from '@/lib/battle/got/siege-readiness';
import {previewWarAftermath} from '@/lib/battle/got/aftermath';
import {previewWarResourceConsequences} from '@/lib/battle/got/aftermath-resources';

function battle(){
 const engineer=modelWarUnit({id:'e',name:'Engenheiros',side:'attacker',
  typeId:'engineers',position:{x:2,y:2}});
 const defender=modelWarUnit({id:'d',name:'Defensores',side:'defender',
  typeId:'infantry',position:{x:9,y:2}});
 const siege=[makeModelSiege({id:'s1',kind:'scorpion',side:'attacker',
  position:{x:1,y:2},engineerId:'e'})];
 return createWarBattle({id:'after-next',name:'Lote pós-batalha',seed:'next-lote',
  width:12,height:7,units:[engineer,defender],siege,
  commanders:modelWarCommanders({attacker:5,defender:5})});
}

describe('Cerco — diagnóstico sem efeitos e sem burlar as regras',()=>{
 it('inspeciona alcance, engenheiros, tempo de recarga e não modifica o combate',()=>{
  const b=battle(),original=JSON.stringify(b);
  const ok=previewWarSiegeReadiness(b,'attacker',{x:9,y:2});
  expect(ok).toHaveLength(1);
  expect(ok[0]?.available).toBe(true);
  expect(ok[0]?.distanceMetres).toBe(80);
  expect(JSON.stringify(b)).toBe(original);
  expect(previewWarSiegeReadiness(b,'attacker',{x:100,y:2})[0]?.blockers.join(' '))
   .toMatch(/fora do alcance/);
  const used={...b,siege:b.siege.map(w=>({...w,lastFiredRound:b.round}))};
  expect(previewWarSiegeReadiness(used,'attacker',{x:9,y:2})[0]?.blockers.join(' '))
   .toMatch(/Recarga pendente/);
 });
 it('ocultação e indisponibilidade de engenheiros impedem o disparo',()=>{
  const b=battle();
  expect(previewWarSiegeReadiness(b,'attacker',{x:9,y:2},{targetHidden:true})[0]?.available)
   .toBe(false);
  const noEngineer={...b,units:b.units.map(u=>u.id==='e'?
   {...u,condition:'routed' as const}:u)};
  expect(previewWarSiegeReadiness(noEngineer,'attacker',{x:9,y:2})[0]?.blockers.join(' '))
   .toMatch(/engenheiros indisponível/);
  const noTarget=previewWarSiegeReadiness(b,'attacker',null);
  expect(noTarget[0]?.available).toBe(false);
 });
});

describe('Pós-batalha — Tabela 10-6, recursos e rastreabilidade',()=>{
 it('Mestre de Armas +1 é explícito e auditável, sem alterar a graduação oficial',()=>{
  const b=battle(),finished={...b,phase:'finished' as const,winner:'attacker' as const};
  const baseline=previewWarAftermath(finished);
  const promoted=previewWarAftermath(finished,{masterOfArmsBonus:{e:1}});
  const original=baseline.survivors.find(x=>x.unitId==='e')!;
  const candidate=promoted.survivors.find(x=>x.unitId==='e')!;
  expect(candidate.die).toBe(original.die);
  expect(candidate.masterOfArmsBonus).toBe(1);
  expect(candidate.adjusted).toBe(Math.min(6,original.adjusted+1));
  expect(candidate.disorganizationPenalty).toBe(0);
  expect(promoted.appliedToHouse).toBe(false);
  expect(finished.units[0]?.training).toBe(b.units[0]?.training);
 });
 it('separa domínio provisório, dados e tarefas pendentes sem lançar recursos',()=>{
  const b=battle(),finished={...b,phase:'finished' as const,winner:'attacker' as const,
   scorchedPreview:[{side:'attacker' as const,unitId:'e',domainId:'colina',
    round:1,populationDelta:-2,wealthDelta:-1}]};
  const input={occupiedDomain:true,garrisonHeldForThreeMonths:false,
   capturedLandValue:8,survivingFortDefenseValue:3,
   domainHasCommunityOrFort:true,transferredWealthInvestments:2};
  const report=previewWarResourceConsequences(finished,input);
  expect(report.occupationReview.status).toBe('provisional');
  expect(report.occupationReview.requiresNarratorApproval).toBe(true);
  expect(report.occupationReview.land).toBe(8);
  expect(report.provisionalOccupationTransfer).toBe(true);
  expect(report.rollLedger.length).toBeGreaterThan(0);
  expect(report.rollLedger.every(row=>row.total===row.dice.reduce((a,n)=>a+n,0)))
   .toBe(true);
  expect(report.approvalItems.join(' ')).toMatch(/três meses/);
  expect(report.approvalItems.join(' ')).toMatch(/colina/);
  expect(report.unresolvedScorchedDomains).toEqual(['colina']);
  expect(report.appliedToHouse).toBe(false);
  const secured=previewWarResourceConsequences(finished,{
   ...input,garrisonHeldForThreeMonths:true,
   scorchedDomainOwners:{colina:'defender'}});
  expect(secured.occupationReview.status).toBe('secured');
  expect(secured.unresolvedScorchedDomains).toHaveLength(0);
  expect(secured.appliedToHouse).toBe(false);
 });
});
