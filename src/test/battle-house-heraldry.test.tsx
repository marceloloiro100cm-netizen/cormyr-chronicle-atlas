import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {battleHouseDirectory} from '@/lib/battle/adapters/house-directory';
import {BattleHouseCrest,BattleHouseBanner,BattleHouseIdentityCard}
 from '@/components/battle/BattleHouseHeraldry';

type AuditEntry={id:string;name:string;region:string;crest:string};
const manifest=JSON.parse(readFileSync(
 resolve('src/test/fixtures/battle-house-crest-audit-2026-11-07.json'),'utf8')) as AuditEntry[];

describe('Brasões de Cormyr · 172 casas sem caminhos inferidos',()=>{
 it('audita todos os 172 brasões públicos e nenhum arquivo ausente',()=>{
  expect(manifest).toHaveLength(172);
  expect(new Set(manifest.map(h=>h.id)).size).toBe(172);
  expect(new Set(manifest.map(h=>h.crest)).size).toBe(172);
  const missing=manifest.filter(h=>!h.crest.startsWith('assets/')||
   !h.crest.endsWith('.webp')||
   !existsSync(resolve('public/cormyr',h.crest)));
  expect(missing).toEqual([]);
  expect(manifest.find(h=>h.id==='von-der-harten')?.crest)
   .toBe('assets/crownlands-vonderharten.webp');
 });
 it('prioriza o brasão cadastrado na campanha e preserva o do catálogo como fallback',()=>{
  const catalog=[{id:'ashkar',name:'Ashkar',region:'Dragon Coast',
   crest:'assets/dragoncoast-ashkar.webp',classification:'major'},
   {id:'evenhand',name:'Evenhand',region:'Helmlands',
    crest:'assets/helmlands-evenhand.webp'}];
  const rows=battleHouseDirectory(catalog,[
   {id:'ashkar',name:'Ashkar',region:'Dragon Coast',crest:null},
   {id:'evenhand',name:'Evenhand',region:'Helmlands',
    crest:'/cormyr/assets/helmlands-evenhand.webp'},
  ]);
  expect(rows.find(h=>h.id==='ashkar')?.crest).toBe('assets/dragoncoast-ashkar.webp');
  expect(rows.find(h=>h.id==='evenhand')?.crest)
   .toBe('/cormyr/assets/helmlands-evenhand.webp');
  expect(rows.find(h=>h.id==='ashkar')?.classification).toBe('major');
 });
 it('usa a arte correta sem trocar brasões entre casas',()=>{
  const ashkar=manifest.find(h=>h.id==='ashkar')!;
  const phelles=manifest.find(h=>h.id==='phelles')!;
  const {rerender}=render(<BattleHouseCrest house={ashkar} size="large"/>);
  const image=screen.getByRole('img',{name:'Brasão da Casa Ashkar'});
  expect(image).toHaveAttribute('src','/cormyr/'+ashkar.crest);
  rerender(<BattleHouseCrest house={phelles} size="large"/>);
  expect(screen.getByRole('img',{name:'Brasão da Casa Phelles'}))
   .toHaveAttribute('src','/cormyr/'+phelles.crest);
  expect(screen.queryByRole('img',{name:'Brasão da Casa Ashkar'})).not.toBeInTheDocument();
 });
 it('substitui somente a imagem que falha por um escudo acessível',()=>{
  render(<BattleHouseCrest house={{
   id:'legacy',name:'Casa Legada',region:'Ferlin',crest:'assets/sem-imagem.webp'
  }}/>);
  fireEvent.error(screen.getByRole('img',{name:'Brasão da Casa Casa Legada'}));
  expect(screen.queryByRole('img',{name:'Brasão da Casa Casa Legada'}))
   .not.toBeInTheDocument();
  expect(screen.getByRole('img',{name:/Brasão indisponível para Casa Legada/}))
   .toBeInTheDocument();
 });
 it('mostra a identidade completa e mantém atacante distinto do defensor',()=>{
  const evenhand=manifest.find(h=>h.id==='evenhand')!;
  render(<>
   <BattleHouseIdentityCard house={{...evenhand,classification:'major'}}
    unitCount={5} men={1230} selectedCount={5} sourceStatus="recorded"/>
   <BattleHouseBanner side="attacker" house={evenhand}/>
   <BattleHouseBanner side="defender" name="Exército adversário"/>
  </>);
  expect(screen.getByRole('heading',{name:'Casa Selecionada'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Evenhand'})).toBeInTheDocument();
  expect(screen.getByText(/Casa Maior/)).toBeInTheDocument();
  expect(screen.getByText(/1.230 combatentes/)).toBeInTheDocument();
  expect(screen.getByLabelText('Atacantes: Evenhand')).toBeInTheDocument();
  expect(screen.getByLabelText('Defensores: Exército adversário')).toBeInTheDocument();
 });
 it('garante estilo responsivo sem recortar as imagens',()=>{
  const css=readFileSync(resolve('src/components/battle/battle-house-heraldry.css'),'utf8');
  expect(css).toContain('object-fit:contain!important');
  expect(css).toContain('object-position:50% 50%');
  expect(css).toContain('@media(max-width:760px)');
  expect(css).toContain('.battle-house-presentation-grid');
 });
});
