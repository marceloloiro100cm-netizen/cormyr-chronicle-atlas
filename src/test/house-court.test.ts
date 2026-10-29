import { describe,it,expect } from 'vitest';
import { assignCourt,validateCourtRecord } from '@/lib/house/court';
import { newHouseState } from '@/lib/house/types';
describe('cargos da Corte sem duplicação',()=>{
 for(const role of ['Lorde / Lady','Consorte','Herdeiro','Administrador'])it(`vincula ${role} apenas por referência ao original`,()=>{const original=newHouseState('source');const n=assignCourt(original,{id:'link',npcId:'existing',role,notes:''});expect(n.court).toEqual([{id:'link',npcId:'existing',role,notes:'',name:'Integrante da Corte'}]);expect(original.court).toHaveLength(0);});
 it('repetir vínculo de cargo atualiza notas sem duplicar',()=>{const s=assignCourt(newHouseState('source'),{id:'one',npcId:'existing',role:'Consorte',notes:''});const n=assignCourt(s,{id:'two',npcId:'existing',role:'Consorte',notes:'Revisado'});expect(n.court).toHaveLength(1);expect(n.court[0]?.notes).toBe('Revisado');});
 it('permite vários herdeiros existentes',()=>{let s=newHouseState('source');for(const id of ['one','two'])s=assignCourt(s,{id,npcId:id,role:'Herdeiro',notes:''});expect(s.court.map(m=>m.npcId)).toEqual(['one','two']);});
 it('recusa integrante de outra casa ou invisível',()=>{expect(()=>validateCourtRecord('source',null)).toThrow('acessível');expect(()=>validateCourtRecord('source',{house_id:'other',kind:'character'})).toThrow('pertence');});
});
