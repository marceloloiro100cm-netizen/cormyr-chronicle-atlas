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
  expect(css).toMatch(/\.public-folha-masthead\{[^}]*box-sizing:border-box;[^}]*width:100%;[^}]*max-width:1500px;[^}]*padding:0 var\(--public-folha-inset\)/s);
  expect(css).toMatch(/\.public-folha-layout\{[^}]*box-sizing:border-box;width:100%;max-width:1500px;margin:0 auto;[^}]*padding:0 var\(--public-folha-inset\)/s);
  expect(css).toMatch(/\.public-folha-head\{[^}]*box-sizing:border-box;[^}]*max-width:none;[^}]*width:100%;[^}]*margin:0;/s);
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

describe('Video-requested newspaper navigation',()=>{
 it('places Edições, A Redação, Anterior and Seguinte in one shared toolbar',()=>{
  const start=source.indexOf('<div className="public-folha-toolbar">');
  const end=source.indexOf('className="public-folha-toolbar-balance"',start);
  const toolbar=source.slice(start,end);
  expect(start).toBeGreaterThan(source.indexOf('className="public-folha-head-copy"'));
  expect(end).toBeGreaterThan(start);
  expect(toolbar).toContain('className="public-folha-tabs"');
  expect(toolbar).toContain(' Edições</a>');
  expect(toolbar).toContain(' A Redação</a>');
  expect(toolbar).toContain('className="public-folha-edition-nav"');
  expect(toolbar).toContain('Edição anterior');
  expect(toolbar).toContain('Edição seguinte');
  expect(toolbar).toContain('className="public-folha-current-edition"');
 });
 it('places previous and next controls in the centered header and preserves historical menu',()=>{
  expect(source).toContain('items[index+1]');
  expect(source).toContain('items[index-1]');
  expect(source).toContain('aria-label="Edições publicadas"');
  expect(source).not.toContain('<div className="public-folha-pager">');
  expect(css).toContain('.public-folha-toolbar .public-folha-edition-nav{');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)');
  expect(css).toContain('.public-folha-toolbar .public-folha-tabs{');
  expect(css).toContain('overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;');
  expect(css).toContain('justify-content:center');
 });
 it('prevents long headlines and image blocks from stretching the visible published page',()=>{
  expect(css).toContain('.public-folha-reader .newspaper-page{box-sizing:border-box;min-width:0;max-width:100%}');
  expect(css).toContain('.public-folha-reader .newspaper-page-masthead h1{');
  expect(css).toContain('overflow-wrap:break-word;word-break:normal;');
 });
});
