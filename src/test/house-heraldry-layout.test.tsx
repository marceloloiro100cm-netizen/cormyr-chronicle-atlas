import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {heraldicCrestUrl,heraldicHouseKey,HERALDIC_HOUSES} from '@/lib/house/heraldry';
import {HouseHeaderCrest} from '@/components/house/house-header-crest';

vi.mock('@/components/image-viewer',()=>({
 ImageViewer:({src,caption,onImageError}:{src:string;caption:string;onImageError?:()=>void})=>
  <button type="button" aria-label={'Ampliar '+caption}><img src={src} alt={caption} onError={onImageError}/></button>,
}));
vi.mock('@/components/campaign-content',()=>({
 PrivateImage:({caption}:{caption:string})=><span role="img" aria-label={caption+' (imagem privada)'}/>,
}));
afterEach(cleanup);

describe('personalização heráldica sem alteração de campos',()=>{
 it('reconhece somente as oito Casas e confirma os arquivos estáticos',()=>{
  for(const house of HERALDIC_HOUSES){
   expect(heraldicHouseKey('Casa '+house.toUpperCase())).toBe(house);
   const url=heraldicCrestUrl(house)!;
   const file=join(process.cwd(),'public',url);
   expect(existsSync(file),url).toBe(true);
   expect(readFileSync(file).toString('ascii',0,4)).toBe('RIFF');
  }
  expect(heraldicHouseKey('Casa Ashkar Falsa')).toBeNull();
 });
 it('preserva o botão para ampliar e alterna ao brasão original se a imagem preferida falhar',()=>{
  render(<HouseHeaderCrest houseName="Harcourt" theme="harcourt" crest="assets/horselands-harcourt.webp" privatePath={null}/>);
  expect(screen.getByRole('button',{name:'Ampliar Brasão da Casa Harcourt'})).toBeInTheDocument();
  let img=screen.getByRole('img',{name:'Brasão da Casa Harcourt'});
  expect(img).toHaveAttribute('src','/house-flags/player-harcourt.webp');
  fireEvent.error(img);
  img=screen.getByRole('img',{name:'Brasão da Casa Harcourt'});
  expect(img).toHaveAttribute('src','/cormyr/assets/horselands-harcourt.webp');
  fireEvent.error(img);
  expect(screen.getByRole('img',{name:'Brasão indisponível para Harcourt'})).toBeInTheDocument();
 });
 it('não cria cartões ou controles novos na ficha',()=>{
  const hub=readFileSync(join(process.cwd(),'src/components/house/hub.tsx'),'utf8');
  for(const field of ['Posses ativas','Domínios próprios','Unidades','Posses principais','Projetos em andamento','Continuar criação','Criar unidade','Trocar Visão']){
   expect(hub,field).toContain(field);
  }
  for(const invented of ['Última missiva','Próximo evento','Ranking']) expect(hub).not.toContain(invented);
 });
 it('oferece layout responsivo preservando todos os recursos',()=>{
  const css=readFileSync(join(process.cwd(),'src/components/house/heraldic-themes.css'),'utf8');
  expect(css).toContain('@media(max-width:1100px)');
  expect(css).toContain('@media(max-width:650px)');
  expect(css).toContain('@media(max-width:420px)');
  expect(css).toMatch(/house-stat-row\s*\{grid-template-columns:1fr\}/);
  expect(css).toMatch(/house-resource-bar\s*\{grid-template-columns:repeat\(7/);
  expect(css).not.toMatch(/display:\s*none\s*;\s*\/\*.*(house-resource|house-stat)/);
 });
});
