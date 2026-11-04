import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const source=(path:string)=>readFileSync(path,'utf8');

describe('Hub temporal: limpeza visual sem mudar regras',()=>{
 it('oculta notas históricas e referência a calendário externo sem removê-las dos registros',()=>{
  const s=source('src/components/players/mail-period-notice.tsx');
  expect(s).toContain('<p hidden aria-hidden="true">Semana de correspondência');
  expect(s).toContain('<p hidden aria-hidden="true">Período atual do Reino:');
  expect(s).toContain('<small hidden aria-hidden="true">Eventos da campanha sem data confirmada');
  expect(s).toContain('eventsForHarptosPeriod(date)');
 });
 it('oculta a análise de missivas e não monta a conciliação genealógica',()=>{
  const mail=source('src/components/players/missivas-tab.tsx');
  expect(mail).toContain('<details hidden aria-hidden="true" onToggle=');
  const hub=source('src/components/calendar/narrator-calendar.tsx');
  expect(hub).not.toContain('<NarratorCharacterRegistry/>');
  expect(hub).not.toContain('href="#temporal-genealogias"');
  expect(hub).toContain('<NarratorCharacterAges');
 });
 it('mostra justificativa numa linha com expansão automática e confirmação à direita',()=>{
  const hub=source('src/components/calendar/narrator-calendar.tsx');
  expect(hub).toContain('className="narrator-calendar-justification-row"');
  expect(hub).toContain('aria-label="Justificativa temporal" rows={1}');
  expect(hub).toContain('Math.min(field.scrollHeight,180)');
  const start=hub.indexOf('<div className="narrator-calendar-justification-row">');
  const selection=hub.indexOf('<p className="narrator-calendar-selection">',start);
  const area=hub.slice(start,selection);
  expect(area).toContain('className="narrator-calendar-publish-button"');
  expect(hub.split('className="narrator-calendar-publish-button"')).toHaveLength(2);
  const css=source('src/components/calendar/harptos.css');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) auto');
 });
 it('redimensiona o mapa sem rolagem lateral ou instrução técnica visível',()=>{
  const map=source('src/components/house/espionage/cormyr-interactive-map.tsx');
  const css=source('src/components/house/espionage/cormyr-interactive-map.css');
  expect(map).toContain('href="/maps/cormyr-regioes.webp"');
  expect(map).toContain('<div className="cormyr-map-scroll">');
  expect(map).toContain('<p className="cormyr-map-source" hidden aria-hidden="true">');
  expect(css).toContain('.cormyr-map-scroll{width:100%;min-width:0;overflow:hidden;');
  expect(css).toContain('.cormyr-map-svg{display:block;width:100%;min-width:0;max-width:100%;');
  expect(map).toContain('onSelect');
 });
});
