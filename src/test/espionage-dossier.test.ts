import {describe,it,expect} from 'vitest';
import {computeDisclosureCoverage,sealSpyReport,releaseSpyReport,playerSpyReport,projectSpyDossier,mergeDossierFacts,formatIntelLetter,type SpyDossier} from '@/lib/espionage/dossier';
import type {SpyIntelFact,SpyOperation} from '@/lib/espionage/contracts';
const id=(n:number)=>{const x=n.toString(16);return x.repeat(8)+'-'+x.repeat(4)+'-4'+x.repeat(3)+'-8'+x.repeat(3)+'-'+x.repeat(12)};
const fields=['house_name','house_region','house_lord','house_resources','house_army','house_law','house_trade','house_rumors'];
const op:SpyOperation={id:id(1),ownerHouseId:'evenhand',assetId:id(2),targetType:'house',targetId:'h-else',
 missionKind:'dossier_refresh',requestedFields:fields,status:'pending_narrator_review',
 sourceCalendarVersion:1,rulesVersion:'CCA-ESP-MVP-001:v1',version:1};
const fact=(n:number,field:string,value:string|null='Conhecido'):SpyIntelFact=>({
 id:id(n),dossierId:id(4),sourceOperationId:op.id,fieldCode:field as SpyIntelFact['fieldCode'],
 disclosedValue:value,confidence:'partial',observedDateKey:'1524-01-20',
 approvedByNarrator:true,
});
const sealed=()=>sealSpyReport({id:id(3),operation:op,code:'ES-014',assetCodename:'Olhos do Norte',
 locationLabel:'Arabel',observedDateKey:'1524-01-20',facts:fields.slice(0,4).map((f,i)=>fact(i+5,f))});
describe('Espionagem · Lote 7 dossiês e relatórios',()=>{
 it('cobertura conta campos únicos resolvidos, não porcentagem de toda a Casa',()=>{
  const facts=[fact(5,fields[0]!),fact(6,fields[1]!),fact(7,fields[2]!),fact(8,fields[3]!),
   fact(9,fields[3]!)];
  expect(computeDisclosureCoverage(fields,facts)).toEqual({eligibleCount:8,resolvedCount:4,coveragePercent:50});
 });
 it('fato sigiloso não passa para jogador até retorno ou comunicação autorizada',()=>{
  const report=sealed();
  expect(playerSpyReport(report,'evenhand')).toBe(null);
  expect(playerSpyReport(report,'h-else')).toBe(null);
  expect(()=>releaseSpyReport(report,{narratorAuthorized:true,narratorId:'gm',reason:'Autorizado após revisão',
   dateKey:'1524-01-21',delivery:'returned',expectedVersion:2})).toThrow('desatualizada');
  const released=releaseSpyReport(report,{narratorAuthorized:true,narratorId:'gm',
   reason:'Relatório entregue no retorno',dateKey:'1524-01-21',delivery:'returned',expectedVersion:1});
  expect(playerSpyReport(released,'h-else')).toBe(null);
  expect(playerSpyReport(released,'evenhand')?.coverage.coveragePercent).toBe(50);
  expect(formatIntelLetter(released,'evenhand')).toContain('50%');
  expect(formatIntelLetter(released,'h-else')).toBe(null);
  expect(JSON.stringify(playerSpyReport(released,'evenhand'))).not.toContain('sourceOperationId');
 });
 it('fatos históricos persistem sem leitura viva do adversário e idempotência',()=>{
  const released=releaseSpyReport(sealed(),{narratorAuthorized:true,narratorId:'gm',
   reason:'Comunicação aprovada pelo Narrador',dateKey:'1524-01-21',delivery:'explicit_communication',expectedVersion:1});
  const dossier:SpyDossier={id:id(4),ownerHouseId:'evenhand',targetType:'house',targetId:'h-else',
   facts:[],reportIds:[],version:1};
  const once=mergeDossierFacts(dossier,[released]);
  const twice=mergeDossierFacts(once,[released]);
  expect(twice.facts).toHaveLength(4);expect(twice.version).toBe(2);
  expect(projectSpyDossier(twice,'h-else','1524-01-22')).toBe(null);
  expect(projectSpyDossier(twice,'evenhand','1524-01-22')?.facts).toHaveLength(4);
  const expired={...twice,facts:[{...twice.facts[0]!,staleAtDateKey:'1524-01-21'},...twice.facts.slice(1)]};
  expect(projectSpyDossier(expired,'evenhand','1524-01-22')?.facts[0]?.stale).toBe(true);
 });
 it('rejeita fato inventado fora do escopo e divulgação sem justificativa',()=>{
  const bad=fact(11,'regional_roads');
  expect(()=>sealSpyReport({id:id(3),operation:op,code:'ES-014',
   assetCodename:'Olhos do Norte',locationLabel:'Arabel',observedDateKey:'1524-01-20',facts:[bad]})).toThrow('escopo');
  expect(()=>releaseSpyReport(sealed(),{narratorAuthorized:true,narratorId:'gm',
   reason:'curta',dateKey:'1524-01-21',delivery:'returned',expectedVersion:1})).toThrow();
 });
});