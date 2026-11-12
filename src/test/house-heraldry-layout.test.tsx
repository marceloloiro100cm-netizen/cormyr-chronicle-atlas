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
 PrivateImage:({caption,onUnavailable}:{caption:string;onUnavailable?:()=>void})=><button type="button" onClick={onUnavailable} aria-label={caption+' (imagem privada)'}>Imagem cadastrada</button>,
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
 it('preserva o zoom e prioriza o brasão original da Casa sobre a bandeira decorativa',()=>{
  render(<HouseHeaderCrest houseName="Harcourt" theme="harcourt" crest="assets/horselands-harcourt.webp" privatePath={null}/>);
  expect(screen.getByRole('button',{name:'Ampliar Brasão da Casa Harcourt'})).toBeInTheDocument();
  let img=screen.getByRole('img',{name:'Brasão da Casa Harcourt'});
  expect(img).toHaveAttribute('src','/cormyr/assets/horselands-harcourt.webp');
  fireEvent.error(img);
  img=screen.getByRole('img',{name:'Brasão da Casa Harcourt'});
  expect(img).toHaveAttribute('src','/house-flags/player-harcourt.webp');
  fireEvent.error(img);
  expect(screen.getByRole('img',{name:'Brasão indisponível para Harcourt'})).toBeInTheDocument();
 });
 it('usa a imagem privada em resolução original antes da cópia pública e possui fallback',()=>{
  render(<HouseHeaderCrest houseName="Ashkar" theme="ashkar" crest="assets/ashkar.webp" privatePath="houses/ashkar/brasao-original.png"/>);
  const privateCrest=screen.getByRole('button',{name:'Brasão da Casa Ashkar (imagem privada)'});
  expect(privateCrest).toBeInTheDocument();
  fireEvent.click(privateCrest);
  expect(screen.getByRole('img',{name:'Brasão da Casa Ashkar'})).toHaveAttribute('src','/cormyr/assets/ashkar.webp');
 });
 it('mantém o visualizador sem recortar e com texto de alto contraste',()=>{
  const viewer=readFileSync(join(process.cwd(),'src/components/image-viewer.tsx'),'utf8');
  const css=readFileSync(join(process.cwd(),'src/styles.css'),'utf8');
  expect(viewer).toContain('objectFit: "contain"');
  expect(viewer).toContain('maxHeight: "65vh"');
  expect(viewer).toContain('image-viewer-dialog');
  expect(css).toContain('.image-viewer-dialog .image-viewer-dialog__title');
  expect(css).toContain('color:#34223a!important');
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
