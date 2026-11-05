import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(path,'utf8');

describe('Dossiês · lotes 13–15 · integração e defesa em profundidade',()=>{
 it('só consulta a Casa solicitante e mantém atualização manual disponível',()=>{
  const ui=read('src/components/house/espionage/spy-dossier-panel.tsx');
  const client=read('src/lib/espionage/spy-dossier.functions.ts');
  expect(ui).toContain('Atualizar dossiês');
  expect(ui).toContain("refetchOnWindowFocus:'always'");
  expect(ui).toContain("refetchOnReconnect:'always'");
  expect(ui).toContain('onRefresh={()=>{void query.refetch();}}');
  expect(client).toContain("parsed.data.some(d=>d.ownerHouseId!==houseId)");
 });
 it('não renderiza relatório administrativo cacheado se a consulta falhou',()=>{
  const ui=read('src/components/house/espionage/spy-dossier-panel.tsx');
  expect(ui).toContain('if(query.isError)return <section');
  expect(ui).toContain('O acesso pode ter sido revogado.');
  expect(ui).toContain('enabled:!!active&&!query.isError');
 });
 it('rejeita operações que dependem de fonte quando a consulta falha',()=>{
  const ui=read('src/components/house/espionage/spy-dossier-panel.tsx');
  expect(ui).toContain("(options.isError&&action!=='revoke')");
  expect(ui).toContain('spyDossierActionOptions(options.data??[],active?.findings??[],objective,action)');
  expect(ui).toContain("action==='revoke'?'Nenhuma informação conhecida nesta modalidade.'");
  expect(ui).toContain('Registrar alteração');
 });
});
