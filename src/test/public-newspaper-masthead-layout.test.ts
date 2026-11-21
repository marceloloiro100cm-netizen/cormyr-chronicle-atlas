import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

/** Public Jornal layout and navigation contracts. No operational data is touched. */
const css=readFileSync('src/components/newspaper/newspaper.css','utf8');
const source=readFileSync('src/routes/jornal.tsx','utf8');

describe('Public Folha masthead alignment',()=>{
 it('keeps the crest full-height while precisely centering the newspaper title',()=>{
  expect(source).toContain('<div className="public-folha-crest" aria-hidden="true">');
  expect(source).toContain('<div className="public-folha-head-balance" aria-hidden="true"/>');
  expect(source).toContain('<h1>A Folha Sem Selo</h1>');
  expect(source).not.toContain('A IMPRENSA DO REINO');
  expect(css).toContain('display:flex;flex-direction:column;align-items:center;justify-content:center;');
  expect(css).toContain('padding:18px 8px;text-align:center;');
  expect(css).toContain('grid-template-columns:clamp(140px,13vw,200px) minmax(0,1fr) clamp(140px,13vw,200px)');
  expect(css).toMatch(/\.public-folha-crest img\{[^}]*position:absolute;inset:0;[^}]*width:100%;height:100%;[^}]*object-fit:contain/s);
 });
 it('aligns the same full-width upper and lower rectangles',()=>{
  expect(css).toContain('--public-folha-inset:clamp(14px,3vw,30px)');
  expect(css).toMatch(/\.public-folha-masthead\{[^}]*box-sizing:border-box;[^}]*width:100%;[^}]*max-width:1500px;[^}]*padding:0 var\(--public-folha-inset\)/s);
  expect(css).toMatch(/\.public-folha-layout\{[^}]*display:block;box-sizing:border-box;[^}]*max-width:1500px;[^}]*padding:0 var\(--public-folha-inset\)/s);
  expect(css).toMatch(/\.public-folha-head\{[^}]*box-sizing:border-box;[^}]*max-width:none;[^}]*width:100%;[^}]*margin:0;/s);
  expect(css).toContain('grid-template-columns:clamp(64px,22vw,96px) minmax(0,1fr) clamp(64px,22vw,96px)');
 });
});

describe('On-demand editions archive and full-width page',()=>{
 it('has one top toolbar, Edições toggle and a preserved Redação link',()=>{
  expect(source).toContain('className="public-folha-toolbar"');
  expect(source).toContain('ref={editionsTrigger} aria-expanded={editionsOpen}');
  expect(source).toContain('aria-controls="public-folha-editions-menu"');
  expect(source).toContain('setEditionsOpen(open=>!open)');
  expect(source).toContain(' A Redação</a>');
  expect(source).toContain('className="public-folha-edition-nav"');
  expect(source).toContain('Edição anterior');
  expect(source).toContain('Edição seguinte');
 });
 it('renders edition links exclusively in the collapsible overlay, not a sidebar',()=>{
  expect(source).toContain('editionsOpen&&view===\'edicoes\'&&<nav');
  expect(source).toContain('aria-label="Selecionar edição publicada"');
  expect(source).toContain('id="public-folha-editions-menu"');
  expect(source).not.toContain('className="public-folha-list"');
  expect(source).toContain('isPlainLeftClick(event)');
  expect(source).toContain('go(item.id)');
  expect(source).toContain('setEditionsOpen(false);setUrlParams({edicao:id,ver:null})');
  expect(css).toMatch(/\.public-folha-editions-menu\{[^}]*position:absolute;z-index:40;top:100%;/s);
  expect(css).toContain('max-height:min(65vh,570px);overflow-y:auto;');
 });
 it('closes the dropdown on Escape or outside click without modifying the published edition',()=>{
  expect(source).toContain("event.key==='Escape'");
  expect(source).toContain("document.addEventListener('pointerdown',outside)");
  expect(source).toContain("document.addEventListener('keydown',escape)");
  expect(source).toContain('editionsTrigger.current?.focus()');
  expect(source).toContain('if(view===\'redacao\')setEditionsOpen(false)');
 });
 it('lets the published newspaper fill the entire lower rectangle',()=>{
  expect(source).toContain('<div className="public-folha-layout">');
  expect(source).toContain('<main className="public-folha-reader">');
  expect(css).toMatch(/\.public-folha-layout\{\s*display:block;/);
  expect(css).toContain('.public-folha-reader > .newspaper-page{');
  expect(css).toContain('box-sizing:border-box;width:100%;max-width:none;margin:0;');
  expect(css).toContain('.public-folha-reader .newspaper-page-masthead h1{');
 });
 it('retains narrow-screen usability without clipping the dropdown',()=>{
  expect(css).toContain('overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;');
  expect(css).toContain('/* Arquivo sob demanda:');
  expect(css).toContain('.public-folha-editions-menu{');
  expect(css).toContain('.public-folha-editions-menu{padding:9px;max-height:60vh}');
 });
});
