import { describe,it,expect } from 'vitest';
import { newHouseState } from '@/lib/house/types';
import { proposeVassal,approveVassal } from '@/lib/house/military';
import { linkVassalNpcs,validateVassalNpcs,mergeOfficialHouse } from '@/lib/house/vassal-links';
const record={id:'npc-existing',house_id:'source',kind:'character',title:'NPC existente',content:'Descrição original'};
describe('precedência de imagem do brasão vassalo',()=>{
 it('recupera arte do arquivo histórico quando a casa oficial está sem imagem',()=>{
  const archive={id:'vassal',name:'Casa Vassala',crest:'/cormyr/heraldry/vassal.png',region:'Cormyr',castle:'Torre do Vale'};
  const result=mergeOfficialHouse(archive,{id:'vassal',name:'Casa Vassala',crest:null,region:null,castle:null});
  expect(result.crest).toBe(archive.crest);
  expect(result.region).toBe('Cormyr');
  expect(result.castle).toBe('Torre do Vale');
 });
 it('usa o brasão oficial quando o registro possui imagem válida',()=>{
  const result=mergeOfficialHouse({id:'child',name:'Casa Filha',crest:'/old.png'},{id:'child',name:'Casa Filha',crest:'/new.png'});
  expect(result.crest).toBe('/new.png');
 });
});
describe('NPCs de brasões vassalos',()=>{
 it('liga IDs existentes sem duplicar personagens ou membros da corte',()=>{let s=newHouseState('source');s.base.power=100;s=approveVassal(proposeVassal(s,{id:'v',houseId:'target',name:'Vassala',notes:''}),'v',0);const n=linkVassalNpcs(s,'v',validateVassalNpcs('source',[record.id],[record]));expect(n.vassals?.[0]?.npcIds).toEqual(['npc-existing']);expect(n.court).toEqual([]);expect(n.vassals?.[0]?.cost).toBe(20);expect(record.content).toBe('Descrição original');expect(s.vassals?.[0]?.npcIds).toEqual([]);});
 it('não vincula o mesmo NPC duas vezes ao brasão',()=>{expect(()=>validateVassalNpcs('source',[record.id,record.id],[record])).toThrow('duas vezes');});
 it('não concede ligação a NPC de outra casa',()=>{expect(()=>validateVassalNpcs('source',[record.id],[{...record,house_id:'other'}])).toThrow('acessíveis');});
 it('não liga NPC invisível ao ator',()=>{expect(()=>validateVassalNpcs('source',[record.id],[])).toThrow('acessíveis');});
 it('não confunde ficha de personagem com NPC',()=>{expect(()=>validateVassalNpcs('source',[record.id],[{...record,content:'Ficha de Personagem'}])).toThrow('NPCs');});
 it('alteração requer vínculo aprovado',()=>{const s=proposeVassal(newHouseState('source'),{id:'v',houseId:'target',name:'Vassala',notes:''});expect(()=>linkVassalNpcs(s,'v',[])).toThrow('aprovados');});
 it('quarto brasão mantém custo5, sem reaprová-lo',()=>{let s=newHouseState('source');s.base.power=100;for(let i=0;i<4;i++)s=approveVassal(proposeVassal(s,{id:'v'+i,houseId:'target'+i,name:'Vassala',notes:''}),'v'+i,0);expect(s.vassals?.map(v=>v.cost)).toEqual([20,10,5,5]);expect(()=>approveVassal(s,'v3',0)).toThrow('disponível');});
});