import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {COURT_NPC_ARCHIVED_MARKER,isArchivedCourtNpc,isNarrativeNpc} from '@/lib/house/narrative-npc';

const source=(file:string)=>readFileSync(join(process.cwd(),file),'utf8');

describe('heráldica de ponta a ponta na área segura do jogador',()=>{
 it('aplica cores e brasão somente à Casa ativa, sem afetar o Narrador',()=>{
  const route=source('src/routes/_authenticated/jogadores.tsx');
  const shell=source('src/components/campaign-shell.tsx');
  expect(route).toContain('heraldry={!data.admin&&current?heraldicHouseKey(current.name):null}');
  expect(shell).toContain('data-house-theme={heraldry??undefined}');
 });
 it('estende a identidade visual aos cartões privados e preserva legibilidade',()=>{
  const css=source('src/styles.css');
  for(const house of ['goldfin','ashkar','fewmerry','grantass','harcourt','everlost','silversky','erdenor']){
   expect(css).toContain('data-house-theme="'+house+'"');
  }
  expect(css).toContain(':is(.campaign-record,.campaign-letter,.ficha-card');
  expect(css).toContain('color:#f3e8da');
  expect(css).toContain('.campaign-house-identity__crest img');
  expect(css).toContain('object-fit:contain');
 });
});

describe('exclusão auditável de membros narrativos da Corte',()=>{
 const npc={kind:'character',title:'Guarda gerado automaticamente',content:'Cargo: Guarda da Corte'};
 it('remove somente personagens arquivados das listas, não fichas técnicas',()=>{
  expect(isNarrativeNpc(npc)).toBe(true);
  expect(isArchivedCourtNpc(npc)).toBe(false);
  const archived={...npc,content:COURT_NPC_ARCHIVED_MARKER};
  expect(isArchivedCourtNpc(archived)).toBe(true);
  expect(isNarrativeNpc(archived)).toBe(false);
  expect(isNarrativeNpc({...npc,kind:'document'})).toBe(false);
 });
 it('exige confirmação, valida vínculos e usa o RPC versionado',()=>{
  const ui=source('src/components/npc-hub.tsx');
  expect(ui).toContain('window.confirm(');
  expect(ui).toContain('sheet.state.court.some');
  expect(ui).toContain('sheet.state.vassals?.some');
  expect(ui).toContain("supabase.rpc('save_campaign_record'");
  expect(ui).toContain('p_version:row.version');
  expect(ui).toContain('COURT_NPC_ARCHIVED_MARKER');
  expect(ui).toContain('Excluir da Corte');
 });
 it('exclui registros arquivados também da subseção da ficha de personagem',()=>{
  const tab=source('src/components/players/ficha-tab.tsx');
  expect(tab).toContain('!isArchivedCourtNpc(r)');
 });
});
