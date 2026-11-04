import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(path,'utf8');

describe('Hub Temporal · justificativa compacta junto ao botão',()=>{
 it('supera a altura global de 150px sem alterar os demais campos',()=>{
  const global=source('src/styles.css');
  const css=source('src/components/calendar/harptos.css');
  expect(global).toContain('.campaign-theme textarea{min-height:150px;resize:vertical}');
  expect(css).toContain('.campaign-theme textarea.narrator-calendar-reason-input{');
  expect(css).toContain('min-height:42px!important;height:42px');
  expect(css).toContain('max-height:180px');
  expect(css).toContain('.narrator-calendar-justification-row>.narrator-calendar-publish-button');
  expect(css).toContain('min-height:42px;height:42px');
 });
 it('começa com uma linha e expande/reduz conforme o texto, mesmo após limpar',()=>{
  const src=source('src/components/calendar/narrator-calendar.tsx');
  expect(src).toContain('aria-label="Justificativa temporal" rows={1}');
  expect(src).toContain('ref={reasonInputRef}');
  expect(src).toContain("field.style.height='42px'");
  expect(src).toContain('Math.max(42,Math.min(field.scrollHeight,180))');
  expect(src).toContain('},[reason]);');
  expect(src).toContain('preview.data.backdated&&(!allowBackdate||reason.trim().length<10)');
  expect(src).toContain('onClick={()=>void publish()}');
 });
});
