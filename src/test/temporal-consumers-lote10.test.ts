import {describe,expect,it} from 'vitest';
import {
 temporalBoundaryPreview,temporalConsumerIdentity,validateTemporalConsumerDashboard,validateTemporalReleasePreflight,
 validatedTemporalDate,
} from '@/lib/calendar/temporal-consumers';
import type {CampaignTimePreview} from '@/lib/calendar/temporal-publication';

const op='00000000-0000-4000-8000-000000000010';
const id='00000000-0000-4000-8000-000000000011';
const dashboard=()=>({
 pending_total:1,
 consumers:[
  {code:'economy',title:'Economia',description:'Somente conferência',
   boundary:'month',mode:'manual_review',enabled:true,total:1,pending:1},
  {code:'army-units',title:'Exército',description:'Bônus recalculados',
   boundary:'month',mode:'projection',enabled:true,total:1,pending:0},
 ],
 deliveries:[
  {id,operation_id:op,consumer_code:'economy',calendar_version:2,
   from_date:'1522-01-21',to_date:'1522-02-01',
   direction:'forward',boundary:'month',mode:'manual_review',status:'pending',
   review_note:null,reviewed_at:null,created_at:'2026-10-31T18:00:00Z'},
 ],
});
const preview=(from:string,to:string,backdated=false):CampaignTimePreview=>({
 version:1,from,to,mode:'set',ordinary_days:0,calendar_days:0,month_delta:0,
 backdated,backdate_authorized:backdated,crossed_festivals:[],
 crossed_years:[],house_sheets_to_check:0,published_week_unchanged:1,
});

describe('Hub Temporal · Lote 10 · integrações e replay seguro',()=>{
 it('valida a fila completa e rejeita consumidores e entregas inconsistentes',()=>{
  expect(validateTemporalConsumerDashboard(dashboard()).pending_total).toBe(1);
  expect(()=>validateTemporalConsumerDashboard({...dashboard(),pending_total:-1})).toThrow();
  expect(()=>validateTemporalConsumerDashboard({
   ...dashboard(),consumers:[...dashboard().consumers,dashboard().consumers[0]],
  })).toThrow();
  const broken=dashboard();
  broken.deliveries[0]!.status='informational';
  expect(()=>validateTemporalConsumerDashboard(broken)).toThrow();
  const foreign=dashboard();
  foreign.deliveries[0]!.consumer_code='external-unknown';
  expect(()=>validateTemporalConsumerDashboard(foreign)).toThrow();
 });
 it('identifica mês, ano e estação pela data de Harptos, inclusive ao retroceder',()=>{
  const next=temporalBoundaryPreview(preview('1522-12-30','1523-01-01'));
  expect(next).toMatchObject({months:1,years:1,seasonChanges:false,manualEffectsApplied:false});
  expect(temporalBoundaryPreview(preview('1524-07-30','1524-F-shieldmeet')))
   .toMatchObject({months:0,years:0,manualEffectsApplied:false});
  expect(temporalBoundaryPreview(preview('1523-03-01','1523-02-30',true)))
   .toMatchObject({months:1,years:0,seasonChanges:true,backdated:true});
 });
 it('gera identidade única por versão e rejeita datas locais arbitrárias',()=>{
  expect(temporalConsumerIdentity('army-units',20)).toBe('army-units:v20');
  expect(temporalConsumerIdentity('army-units',21)).not.toBe('army-units:v20');
  expect(()=>temporalConsumerIdentity('../economy',20)).toThrow();
  expect(()=>temporalConsumerIdentity('economy',-1)).toThrow();
  expect(validatedTemporalDate('1524-F-shieldmeet')).toBe('1524-F-shieldmeet');
  expect(()=>validatedTemporalDate('2026-10-31')).toThrow();
 });
});


describe('Hub Temporal · Lote 11 · gate de integridade de produção',()=>{
 const valid=()=>({
  calendar_version:7,official_date:'1524-F-shieldmeet',official_month:1524*12+6,
  house_sheets:2,active_houses:1,draft_houses:1,invalid_houses:0,
  lagging_houses:0,ahead_houses:1,operations:3,deliveries:12,
  manual_reviews_pending:4,month_processing_preflight_ok:true,
  requires_production_backup:true,requires_homologation:true,
  automatic_economic_effects_enabled:false,
 });
 it('concorda com o mês de festival e exige backup/homologação sem declarar deploy liberado',()=>{
  expect(validateTemporalReleasePreflight(valid()).official_month).toBe(1524*12+6);
  expect(()=>validateTemporalReleasePreflight({...valid(),requires_production_backup:false})).toThrow();
  expect(()=>validateTemporalReleasePreflight({...valid(),automatic_economic_effects_enabled:true})).toThrow();
 });
 it('falha em contagem inconsistente, data falsa, calendário obsoleto e promessa indevida',()=>{
  expect(()=>validateTemporalReleasePreflight({...valid(),official_month:1524*12+7})).toThrow();
  expect(()=>validateTemporalReleasePreflight({...valid(),house_sheets:3})).toThrow();
  expect(()=>validateTemporalReleasePreflight({...valid(),calendar_version:-1})).toThrow();
  expect(()=>validateTemporalReleasePreflight({...valid(),month_processing_preflight_ok:false})).toThrow();
 });
});
