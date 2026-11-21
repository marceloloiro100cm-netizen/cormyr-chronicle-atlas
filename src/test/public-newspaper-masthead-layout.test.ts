import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

/** The public reader's panels must share the same desktop and mobile edges.
 * Guard the layout contract after the 21/11/2026 visual bug report.
 */
const css=readFileSync('src/components/newspaper/newspaper.css','utf8');
const source=readFileSync('src/routes/jornal.tsx','utf8');

describe('Public Folha masthead and editions visual alignment',()=>{
 it('uses a shared shell for crest, heading and tabs above the edition grid',()=>{
  expect(source).toContain('<div className="public-folha-masthead">');
  expect(source).toContain('<div className="public-folha-crest" aria-hidden="true">');
  expect(source).toContain('<div className="public-folha-head-copy">');
  expect(source.indexOf('className="public-folha-masthead"'))
   .toBeLessThan(source.indexOf('className="public-folha-layout"'));
  expect(source).toContain('<nav className="public-folha-tabs" aria-label="Jornal">');
 });
 it('keeps the top rectangle and bottom grid on the exact same outer edges',()=>{
  expect(css).toContain('--public-folha-inset:clamp(14px,3vw,30px)');
  expect(css).toMatch(/\.public-folha-masthead\{[^}]*max-width:1500px;[^}]*padding:0 var\(--public-folha-inset\)/s);
  expect(css).toMatch(/\.public-folha-layout\{max-width:1500px;[^}]*padding:0 var\(--public-folha-inset\)/s);
  expect(css).toMatch(/\.public-folha-head\{[^}]*width:100%;[^}]*margin:0;/s);
  expect(css).toMatch(/\.public-folha-tabs\{[^}]*width:100%;[^}]*max-width:none;[^}]*margin:0;/s);
 });
 it('stretches the crest over the masthead height without cropping the coat of arms',()=>{
  expect(css).toMatch(/\.public-folha-head\{[^}]*display:grid;[^}]*align-items:stretch;[^}]*min-height:/s);
  expect(css).toMatch(/\.public-folha-crest\{position:relative;align-self:stretch;/);
  expect(css).toMatch(/\.public-folha-crest img\{[^}]*position:absolute;inset:0;[^}]*width:100%;height:100%;[^}]*object-fit:contain/s);
  expect(css).not.toContain('.public-folha-head>img{width:76px;height:76px');
 });
 it('retains responsive space for the full newspaper title on narrow screens',()=>{
  expect(css).toMatch(/@media\(max-width:520px\)\{[\s\S]*?\.public-folha-head\{[\s\S]*?grid-template-columns:clamp\(102px,29vw,140px\) minmax\(0,1fr\)/);
  expect(css).toContain('.public-folha-head h1{font-size:clamp(1.65rem,6vw,2.1rem)}');
 });
});
