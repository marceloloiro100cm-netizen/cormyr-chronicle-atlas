import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';

const archiveFile=(path:string)=>readFileSync(resolve(process.cwd(),'public/cormyr',path),'utf8');
const catalogue=()=>JSON.parse(archiveFile('data.js').replace(/^window\.CORMYR_DATA\s*=\s*/,'').replace(/;\s*$/,''));
const formatter=()=>{
 const ctx:{window:Record<string,unknown>}={window:{}};
 runInNewContext(archiveFile('nobility-format.js'),ctx);
 return ctx.window.CORMYR_NOBILITY_FORMAT as {
  isMissingPlace:(value:string)=>boolean;
  colorTokens:(value:string)=>{label:string;swatch:string|null}[];
  parseHistory:(raw:string,house:Record<string,unknown>)=>{
   preface:string[];supplemental:{label:string;value:string}[];
   body:{type:string;text:string}[];
  };
 };
};
const house=(name:string)=>{
 const all=catalogue().regions.flatMap((r:{houses:Record<string,unknown>[]})=>r.houses);
 const found=all.find((h:Record<string,unknown>)=>h.name===name);
 if(!found)throw new Error('Casa ausente: '+name);
 return found as Record<string,unknown>;
};

describe('Nobreza pública — fases 1 e 2',()=>{
 it('carrega os auxiliares antes do inicializador assíncrono do Atlas',()=>{
  const html=archiveFile('index.html'),loader=archiveFile('gm-loader.js');
  expect(html).toContain('nobility-layout.css?v=20261127p12');
  expect(html.indexOf('nobility-format.js?v=20261127p12')).toBeLessThan(html.indexOf('gm-loader.js?'));
  expect(html).toContain('app.js?v=20261127noble');
  expect(loader).toContain("s.src='app.js?v=20261127noble'");
  expect(()=>new Function(archiveFile('nobility-format.js'))).not.toThrow();
  expect(()=>new Function(archiveFile('app.js'))).not.toThrow();
 });
 it('posiciona a bandeira à direita, preserva o brasão completo e mantém a versão mobile',()=>{
  const css=archiveFile('nobility-layout.css');
  const app=archiveFile('app.js');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) 76px');
  expect(css).toContain('.noble-heraldry-flag');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('@media(max-width:767px)');
  expect(css).toContain('@media(max-width:480px)');
  expect(app).toContain('class="noble-card__copy"');
  expect(app).toContain('class="noble-card__flag');
  expect(app.indexOf('class="noble-card__copy"')).toBeLessThan(app.indexOf('class="noble-card__flag'));
  expect(app).toContain('class="noble-heraldry-panel"');
  expect(app).toContain('class="noble-governor"');
  expect(app).toContain('Casa Real');
  expect(app).toContain('Casa Maior');
 });
 it('normaliza a apresentação das cores e preserva os nomes dos tons oficiais',()=>{
  const fmt=formatter();
  expect(fmt.colorTokens('Roxo & Prata').map(t=>t.label)).toEqual(['Roxo','Prata']);
  expect(fmt.colorTokens('Bronze, cinza, vermelho escuro').map(t=>t.label)).toEqual(['Bronze','Cinza','Vermelho escuro']);
  expect(fmt.colorTokens('Ferro & Laranja').map(t=>t.label)).toEqual(['Ferro','Laranja']);
  expect(fmt.isMissingPlace('Sem cidade')).toBe(true);
  expect(fmt.isMissingPlace('Cinzaria')).toBe(false);
  expect(house('Ashkar').city).toBe('Sem cidade');
 });
 it('remove apenas metadados idênticos da apresentação sem perder Fama e Vassalos',()=>{
  const fmt=formatter(),ashkar=house('Ashkar');
  const original=JSON.parse(archiveFile('histories/ashkar.json')).text as string;
  const parsed=fmt.parseHistory(original,ashkar);
  expect(original).toContain('Nome: Kael Ashkar.');
  expect(parsed.body.some(p=>p.text.includes('As terras de Vhal-Zar'))).toBe(true);
  expect(parsed.body.some(p=>p.text==='Nome: Kael Ashkar.')).toBe(false);
  // Menções a outros personagens no restante do documento não são removidas.
  expect(parsed.body.some(p=>p.text==='Nome: Phoinix')).toBe(true);
  expect(parsed.supplemental.some(p=>p.label==='Fama')).toBe(true);
  expect(parsed.supplemental.some(p=>p.label==='Vassalos')).toBe(true);
  // "Tons de ouro..." é diferente da lista do catálogo e deve ser preservado.
  expect(parsed.supplemental.some(p=>p.label==='Cores')).toBe(true);
 });
 it('não apaga divergências entre registro original e dados estruturados',()=>{
  const fmt=formatter(),ashkar=house('Ashkar');
  const changed='Casa Ashkar\nFundação: 999 CV\nLema: Um lema alternativo\n\nA história continua intacta.';
  const parsed=fmt.parseHistory(changed,ashkar);
  expect(parsed.supplemental.map(p=>p.value)).toContain('999 CV');
  expect(parsed.supplemental.map(p=>p.value)).toContain('Um lema alternativo');
  expect(parsed.body.some(p=>p.text.includes('A história continua intacta.'))).toBe(true);
 });
 it('mantém subtítulos autorais e traduções que não equivalem ao campo curto',()=>{
  const fmt=formatter();
  const huntinghorn=fmt.parseHistory(JSON.parse(archiveFile('histories/huntinghorn.json')).text,house('Huntinghorn'));
  expect(huntinghorn.preface.some(t=>t.includes('Exploradores'))).toBe(true);
  const barelder=fmt.parseHistory(JSON.parse(archiveFile('histories/barelder.json')).text,house('Barelder'));
  expect(barelder.supplemental.some(t=>t.label==='Lema'&&t.value.includes('O Dever'))).toBe(true);
 });
});
