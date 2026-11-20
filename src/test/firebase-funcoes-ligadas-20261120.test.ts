import {describe,expect,it} from 'vitest';
import {planOverlayMutation,mergeOverlay,isOverlayTable} from '@/lib/firebase-workspace/operational-table-overlay';
import {setRuntimeApprovals,RUNTIME_APPROVALS} from '@/lib/firebase-workspace/runtime-approvals';
import {shouldBlockLegacyRequest} from '@/lib/archive-only';
import {regionalStrategy} from '../../scripts/firebase/workspace-spy.mjs';
import {spyRegionalStrategySchema} from '@/lib/espionage/region-turns';

const NOW='2026-11-20T21:00:00.000Z';
describe('Tabelas operacionais do Firebase',()=>{
 it('cria, edita e exclui modelos de matéria pela Redação',()=>{
  const ins=planOverlayMutation('campaign_newspaper_story_models','editor',[],
   [{op:'insert',args:[{name:'Crônica',description:'',blocks:[]}]}],NOW);
  const row=ins.writes[0]!.row!;
  expect(row['name']).toBe('Crônica');expect(typeof row['id']).toBe('string');
  const current=mergeOverlay([],ins.writes,'id');
  const upd=planOverlayMutation('campaign_newspaper_story_models','editor',current,
   [{op:'update',args:[{name:'Crônica do Reino'}]},{op:'eq',args:['id',row['id']]}],NOW);
  expect(upd.writes[0]!.row!['name']).toBe('Crônica do Reino');
  const del=planOverlayMutation('campaign_newspaper_story_models','editor',current,
   [{op:'delete',args:[]},{op:'eq',args:['id',row['id']]}],NOW);
  expect(mergeOverlay(current,del.writes,'id')).toHaveLength(0);
 });
 it('salva as configurações do jornal por upsert e devolve a linha',()=>{
  const plan=planOverlayMutation('campaign_newspaper_settings','editor',[{id:true,title:'Antigo',subtitle:'',template:'classico',font_style:'classico'}],
   [{op:'upsert',args:[{id:true,title:'A Folha',subtitle:'S',template:'classico',font_style:'classico'},{onConflict:'id'}]},
    {op:'select',args:['title,subtitle,template,font_style']},{op:'single',args:[]}],NOW);
  expect(plan.result.data).toMatchObject({title:'A Folha'});
 });
 it('caderno do Narrador e criação de Casa só para o Narrador',()=>{
  expect(()=>planOverlayMutation('noble_house_gm_notes','jogador',[],
   [{op:'upsert',args:[{house_id:'a',notes:'x',secret_state:{}}]}],NOW)).toThrow();
  const house=planOverlayMutation('campaign_houses','narrador',[],
   [{op:'insert',args:[{id:'nova',name:'Nova',castle:null,source:'Documento'}]}],NOW);
  expect(house.writes[0]!.row).toMatchObject({id:'nova',active:true,season:2});
  expect(()=>planOverlayMutation('campaign_houses','narrador',[{id:'nova'}],
   [{op:'insert',args:[{id:'nova',name:'Nova',source:'x'}]}],NOW)).toThrow();
 });
 it('recusa campos fora da lista, tabelas fora da lista e gravação sem filtro',()=>{
  expect(()=>planOverlayMutation('campaign_newspaper_engravings','editor',[],
   [{op:'insert',args:[{name:'x',admin:true}]}],NOW)).toThrow();
  expect(isOverlayTable('campaign_letters')).toBe(false);
  expect(()=>planOverlayMutation('campaign_newspaper_engravings','editor',[{id:'a',name:'x'}],
   [{op:'delete',args:[]}],NOW)).toThrow();
 });
});

describe('Aprovações do runtime',()=>{
 it('aceita só campos booleanos conhecidos',async()=>{
  await expect(setRuntimeApprovals({},'x','u',{houseOpsWriteApproved:'sim'})).rejects.toThrow();
  await expect(setRuntimeApprovals({},'x','u',{status:true})).rejects.toThrow();
  expect(RUNTIME_APPROVALS.map(([k])=>k)).toContain('spyWriteApproved');
 });
});

describe('Rotas liberadas em 20/11/2026',()=>{
 it('abre as rotas Firebase com chave própria sem abrir serverFns',()=>{
  for(const p of ['/api/public/time','/api/public/catalog','/api/firebase-cloud-treasury','/api/firebase-cloud-construction']){
   expect(shouldBlockLegacyRequest(p,'router')).toBe(false);
   expect(shouldBlockLegacyRequest(p,'serverFn')).toBe(true);
  }
  expect(shouldBlockLegacyRequest('/api/firebase-domain','router')).toBe(true);
 });
});

describe('Turnos regionais no Firebase',()=>{
 it('devolve agentes da Casa e o grafo oficial no formato validado pela tela',()=>{
  const out=regionalStrategy({houseId:'ashkar',
   assets:[{id:'0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e',ownerHouseId:'ashkar',codename:'Sombra',status:'available',currentLocationId:'l1'},
    {id:'1f1e2d3c-4b5a-4968-8778-695a4b3c2d1e',ownerHouseId:'outra',codename:'Outro',status:'available',currentLocationId:null}],
   locations:[{id:'l1',kind:'region',refId:'dragoncoast'}]});
  const parsed=spyRegionalStrategySchema.parse(out);
  expect(parsed.agents).toHaveLength(1);
  expect(parsed.agents[0]!.currentRegion).toBe('dragoncoast');
  expect(parsed.links.length).toBeGreaterThan(10);
 });
});
