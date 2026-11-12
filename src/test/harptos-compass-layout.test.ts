import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

describe('layout da rosa dos ventos no Calendário de Harptos',()=>{
 const component=readFileSync(join(process.cwd(),'src/components/calendar/calendar.tsx'),'utf8');
 const css=readFileSync(join(process.cwd(),'src/components/calendar/harptos.css'),'utf8');

 it('coloca a rosa dos ventos ao lado do cabeçalho sem alterar a legenda',()=>{
  const intro=component.indexOf('className="harptos-intro"');
  const compass=component.indexOf('className="harptos-compass"');
  const end=component.indexOf('className="harptos-legend"');
  expect(intro).toBeGreaterThan(-1);
  expect(compass).toBeGreaterThan(intro);
  expect(end).toBeGreaterThan(compass);
  expect(component.slice(intro,compass)).toContain('className="harptos-intro-copy"');
  expect(component.slice(compass,end)).toContain('</svg>');
 });
 it('alinha o símbolo à direita e adapta a grade em dispositivos pequenos',()=>{
  expect(css).toContain('.harptos-intro{');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) 148px');
  expect(css).toContain('justify-self:end');
  expect(css).toContain('@media(max-width:620px)');
  expect(css).toContain('@media(max-width:380px)');
 });
});
