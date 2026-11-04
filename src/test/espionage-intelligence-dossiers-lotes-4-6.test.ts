import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');
const sql=()=>read('docs/espionage/sql/0105_spy_intelligence_catalog_dossiers_and_admin.sql');

describe('Dossiês de espionagem · lotes 4, 5 e 6',()=>{
 it('extrai apenas unidades reais e posses adquiridas sem expor dados em SELECT',()=>{
  const migration=sql();
  expect(migration).toContain("p_objective='army'");
  expect(migration).toContain("coalesce(u.value->>'destroyed','false')<>'true'");
  expect(migration).toContain("h.value->>'status'='active'");
  expect(migration).toContain("'domain:'||(v_item->>'id')");
  expect(migration).toContain("'holding:'||(v_item->>'id')");
  expect(migration).toContain('spy_intelligence_source_items');
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.spy_intelligence_source_items(text,text,jsonb)');
 });
 it('registra descobertas novas, revalidacoes e mudancas administrativas de forma historica',()=>{
  const migration=sql();
  expect(migration).toContain('processing_state');
  expect(migration).toContain('FOR UPDATE');
  expect(migration).toContain('UPDATE public.spy_intelligence_mission_awards SET');
  expect(migration).toContain("ORDER BY md5(p_operation::text||':'||item_key)");
  expect(migration).toContain("'waiting_catalog'");
  expect(migration).toContain('spy_intelligence_admin_audit');
  expect(migration).toContain("p_action='revoke'");
  expect(migration).toContain('campaign_date_key');
 });
 it('não expõe atributos secretos por consultas diretas',()=>{
  const migration=sql();
  expect(migration).toContain('public.is_campaign_admin()');
  expect(migration).toContain('public.in_campaign_house(p_house,false)');
  expect(migration).toContain("d.owner_house_id=p_house");
  expect(migration).toContain('f.value_snapshot');
  expect(migration).not.toContain('GRANT SELECT ON public.spy_intelligence_findings TO authenticated');
 });
 it('usa o motor de atributos oficial e permite retomar resultados pendentes',()=>{
  const actions=read('src/lib/espionage/spy-dossier.functions.ts');
  const resolution=read('src/lib/espionage/spy-agent-actions.functions.ts');
  expect(actions).toContain('balances(result.data.state as HouseState).total');
  expect(actions).toContain("spy_intelligence_finalize");
  expect(actions).toContain("retrySpyIntelligence");
  expect(actions).toContain("adjustSpyIntelligence");
  expect(resolution).toContain('finishSpyIntelligence');
 });
 it('renderiza abas de Recursos, Exército e Posses dentro da ficha',()=>{
  const component=read('src/components/house/espionage/spy-dossier-panel.tsx');
  const hub=read('src/components/house/hub.tsx');
  expect(component).toContain("DossierView");
  expect(component).toContain('SPY_INTELLIGENCE_OBJECTIVES.map');
  expect(component).toContain("readSpyDossiersBrowser(houseId)");
  expect(component).toContain('Nenhuma informação desta categoria foi descoberta.');
  expect(hub).toContain("<SpyPlayerDossiers houseId={house.id}/>");
  expect(hub).toContain("onClick={()=>setSpyView('dossiers')}");
 });
 it('coloca o gerenciador do narrador abaixo do Hub Temporal com filtros e auditoria',()=>{
  const menu=read('src/components/players/narrator-missives-hub.tsx');
  const page=read('src/routes/_authenticated/jogadores.tsx');
  const panel=read('src/components/house/espionage/spy-dossier-panel.tsx');
  expect(menu.indexOf("['dossies','Dossiês de Espionagem']"))
   .toBeGreaterThan(menu.indexOf("['calendario','Hub Temporal']"));
  expect(page).toContain("section==='dossies'?<SpyNarratorDossiers/>");
  expect(panel).toContain('Casa investigadora');
  expect(panel).toContain('Casa-alvo');
  expect(panel).toContain('Região');
  expect(panel).toContain('Gerenciamento de segredos');
  expect(panel).toContain('Missões aguardando fonte oficial');
 });
});
