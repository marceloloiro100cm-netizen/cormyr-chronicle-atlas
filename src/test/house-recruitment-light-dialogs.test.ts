import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const file=(path:string)=>readFileSync(resolve(path),'utf8');
function luminance(hex:string){
 const values=hex.slice(1).match(/.{2}/g)!.map(x=>parseInt(x,16)/255);
 const channels=values.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return .2126*channels[0]!+.7152*channels[1]!+.0722*channels[2]!;
}
function contrast(a:string,b:string){
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

describe('Cormyr · criação militar e de espiões em marfim e dourado',()=>{
 it('aplica o mesmo tema claro somente às janelas de criação',()=>{
  const army=file('src/components/house/army.tsx');
  const spy=file('src/components/house/espionage/spy-create-agent-dialog.tsx');
  const css=file('src/components/house/creation-dialog-theme.css');
  expect(army).toContain("import './creation-dialog-theme.css'");
  expect(spy).toContain("import '../creation-dialog-theme.css'");
  expect(army).toContain('cormyr-creation-dialog--military');
  expect(spy).toContain('cormyr-creation-dialog--spy');
  expect(army).toContain('campaign-form cormyr-creation-form');
  expect(spy).toContain('className="cormyr-creation-form');
  expect(css).toContain('.cormyr-creation-dialog{');
  expect(css).toContain('background:#faf6ed!important');
  expect(css).toContain('border:1px solid var(--creation-gold)!important');
  expect(css).toContain('color-scheme:light');
  expect(css).toContain('background:#fffefa!important');
  expect(css).toContain('color:#352723!important');
  expect(css).not.toContain('.campaign-theme input,');
 });
 it('garante contraste AA de leitura para texto, campos e subtítulos',()=>{
  expect(contrast('#382a28','#faf6ed')).toBeGreaterThanOrEqual(7);
  expect(contrast('#352723','#fffefa')).toBeGreaterThanOrEqual(7);
  expect(contrast('#716357','#faf6ed')).toBeGreaterThanOrEqual(4.5);
 });
 it('preserva as regras de recrutamento, a confirmação e todos os campos militares',()=>{
  const s=file('src/components/house/army.tsx');
  for(const text of [
   'UNIT_TYPES.map(t=>','TRAINING[training].xp','quoteMilitaryUnit(state,types,training)',
   'onCreate({unit})','Nome da unidade','Conjunto de equipamento','Treinamento',
   'Localização','Comandante (opcional)','Tipos — custos somados',
  ])expect(s).toContain(text);
  expect(s).toContain('type="submit" className="cormyr-creation-primary"');
  expect(s).toContain('type="checkbox" checked={types.includes(t.id)}');
 });
 it('preserva foto, vagas, upgrades e transação única ao criar espião',()=>{
  const s=file('src/components/house/espionage/spy-create-agent-dialog.tsx');
  for(const text of [
   'createSpyAgentBrowser({','readSpyRecruitmentOptionsBrowser(houseId)',
   'SPY_AGENT_UPGRADES','spy-create-vacancy',
   'Vagas disponíveis para criar espiões',
   '<SpyPortraitPicker portraits={portraits} selected={portraitId}',
   'sourceHoldingId:source.sourceHoldingId','upgrades,',
  ])expect(s).toContain(text);
  expect(s).toContain('cormyr-creation-choice');
  expect(s).toContain('cormyr-creation-portraits');
  expect(s).toContain('type="submit" className="cormyr-creation-primary"');
 });
 it('adapta opções e campos ao celular, com foco visível e contraste em selects nativos',()=>{
  const css=file('src/components/house/creation-dialog-theme.css');
  expect(css).toContain('@media(max-width:680px)');
  expect(css).toContain('grid-template-columns:1fr');
  expect(css).toContain('select option:checked');
  expect(css).toContain(':focus-visible');
  expect(css).toContain(':has(input:checked)');
 });
});
