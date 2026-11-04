import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');

describe('Dossiês de espionagem · interface e conexão oficial',()=>{
 it('mostra Dossiê dentro de Espionagem da Casa',()=>{
  const hub=read('src/components/house/hub.tsx');
  expect(hub).toContain('SpyPlayerDossiers');
  expect(hub).toContain('<SpyPlayerDossiers houseId={house.id}/>');
  expect(hub).toContain("section==='spy'");
 });
 it('narrador tem menu imediatamente após o Hub Temporal',()=>{
  const nav=read('src/components/players/narrator-missives-hub.tsx');
  const route=read('src/routes/_authenticated/jogadores.tsx');
  expect(nav).toContain("['calendario','Hub Temporal'],\\n ['dossies','Dossiês de Espionagem']");
  expect(route).toContain("section==='dossies'?<SpyNarratorDossiers/>");
 });
 it('painel contém três modalidades, registros conhecidos e filtros sem total secreto',()=>{
  const panel=read('src/components/house/espionage/spy-dossier-panel.tsx');
  expect(panel).toContain('SPY_INTELLIGENCE_OBJECTIVES.map');
  expect(panel).toContain("count(dossier,'house_resources')}/7");
  expect(panel).toContain("count(dossier,'army')");
  expect(panel).toContain("count(dossier,'possessions')");
  expect(panel).toContain('A quantidade real de');
  expect(panel).toContain('Gerenciamento de segredos');
  expect(panel).toContain('Auditoria do Narrador');
 });
 it('lê somente dossiês da própria Casa e calcula recursos com motor oficial',()=>{
  const service=read('src/lib/espionage/spy-dossier.functions.ts');
  expect(service).toContain("spy_intelligence_read");
  expect(service).toContain('d.ownerHouseId!==houseId');
  expect(service).toContain('balances(result.data.state as HouseState).total');
  expect(service).toContain("requireNarrator(db)");
  expect(service).toContain("spy_intelligence_admin_action");
  expect(service).toContain("spy_intelligence_finalize");
 });
});
