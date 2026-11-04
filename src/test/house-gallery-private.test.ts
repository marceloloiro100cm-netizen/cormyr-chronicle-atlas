import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {houseRecordGalleryImages,type GalleryRecord}
 from '@/lib/gallery/house-gallery';

const token=(path:string,caption:string)=>`[cormyr-image:${path}|${caption}]`;
const record=(id:string,title:string,kind:string,content:string,house_id='ashkar'):GalleryRecord=>
 ({id,title,kind,content,house_id});
const file=(path:string)=>readFileSync(path,'utf8');

describe('Galeria da Casa · acervo privado separado por tópicos',()=>{
 it('separa NPCs e retratos, mantendo imagens de registros anteriores',()=>{
  const oldPortrait=record('a','Retrato da Casa','character',token('player/portrait.jpg','Lorde'));
  const npc=record('b','Mestre de Armas','character',
   'Cargo: Mestre de Armas\n\n'+token('player/npc.webp','Veterano'));
  const document=record('c','Relatório','document',token('player/docs.png','Mapa'));
  const items=houseRecordGalleryImages([oldPortrait,npc,document],'ashkar');
  expect(items.filter(i=>i.topic==='images').map(i=>i.path))
   .toEqual(['player/portrait.jpg','player/docs.png']);
  expect(items.filter(i=>i.topic==='npcs').map(i=>i.path))
   .toEqual(['player/portrait.jpg','player/npc.webp']);
 });
 it('impede mostrar registros de outra Casa, inclusive na sessão do administrador',()=>{
  const items=houseRecordGalleryImages([
   record('ours','Nosso', 'document',token('a/own.jpg','Própria')),
   record('foreign','Outra Casa','document',token('b/private.jpg','Segredo'),'qazir'),
  ],'ashkar');
  expect(items.map(i=>i.path)).toEqual(['a/own.jpg']);
 });
 it('não duplica uma mesma imagem quando dois registros mencionam o arquivo',()=>{
  const items=houseRecordGalleryImages([
   record('a','A','document',token('a/one.jpg','A')),
   record('b','B','document',token('a/one.jpg','B')),
  ],'ashkar');
  expect(items).toHaveLength(1);
 });
 it('navegação contém a Galeria ao lado das fichas, com tópicos e filtro de missivas',()=>{
  const route=file('src/routes/_authenticated/jogadores.tsx');
  expect(route).toContain("['ficha','Ficha'],['galeria','Galeria'],['calendario','Calendário']");
  expect(route).toContain("tab==='galeria'&&current");
  expect(route).toContain("records={data.records.filter(r=>r.house_id===current.id)}");
  expect(route).toContain('key={current.id}');
  const tab=file('src/components/players/gallery-tab.tsx');
  expect(tab).toContain("['images','Retratos e imagens'");
  expect(tab).toContain("['npcs','NPCs'");
  expect(tab).toContain("['missives','Imagens das missivas'");
  expect(tab).toContain("['sent','Enviadas'],['received','Recebidas']");
  expect(tab).toContain("['house-gallery-mail-images',houseId]");
  expect(tab).toContain('<PrivateImage');
  const old=file('src/components/players/ficha-tab.tsx');
  expect(old).not.toContain('<h2>Retratos e imagens</h2>');
 });
 it('mostra a imagem Silversky programada só ao remetente, sem antecipar a entrega',()=>{
  const sql=file('docs/gallery/sql/0105_house_gallery_own_scheduled_images.sql');
  const gallery=file('src/components/players/gallery-tab.tsx');
  // As imagens programadas do autor não aparecem na Casa destinatária.
  expect(sql).toContain("r.publication_state='scheduled'");
  expect(sql).toContain("r.house_id=p_house");
  expect(sql).toContain("(r.author_user_id=auth.uid() OR public.is_campaign_admin())");
  expect(sql).toContain("author_player.user_id=r.author_user_id");
  expect(sql).toContain("author_player.roster_house_id=p_house");
  expect(sql).toContain('public.can_read_reply_as(r,auth.uid())');
  expect(sql).toContain('public.can_read_letter_as(l,auth.uid())');
  expect(sql).toContain("r.deleted_at IS NULL");
  expect(sql).toContain("'publicationState',g.publication_state");
  expect(gallery).toContain("publicationState:z.enum(['delivered','scheduled'])");
  expect(gallery).toContain("'Programada · ainda não entregue'");
  expect(gallery).toContain("['sent','Enviadas'],['received','Recebidas']");
 });
 it('SQL valida vinculação da Casa e RLS da missiva e de cada resposta',()=>{
  const sql=file('docs/gallery/sql/0104_house_gallery_mail_images.sql');
  expect(sql).toContain('public.in_campaign_house(p_house,false)');
  expect(sql).toContain('public.can_read_letter_as(l,auth.uid())');
  expect(sql).toContain('public.can_read_reply_as(r,auth.uid())');
  expect(sql).toContain("l.publication_state='delivered'");
  expect(sql).toContain("r.publication_state='delivered'");
  expect(sql).toContain('l.origin_house_id=p_house OR l.recipient_house_id=p_house');
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.house_gallery_mail_images(text)');
  expect(sql).not.toContain("'content',l.content");
 });
});
