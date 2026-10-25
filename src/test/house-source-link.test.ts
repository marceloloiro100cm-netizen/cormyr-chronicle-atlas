import { describe,it,expect } from 'vitest';
import { confirmedSourceTotals,linkSourceTotals } from '@/lib/house/source-link';
import { newHouseState } from '@/lib/house/types';
import { balances } from '@/lib/house/engine';
import { md5 } from '@/lib/house/source-md5';
const source=(name='Ashkar',extra='')=>({id:'id',house_id:'ashkar',title:'Ficha da Casa',version:1,source_file_id:'file',source_modified_at:null,content:`Nome · ${name}\nBonus Inicial · Defesa · Influencia · Terras · Lei · População · Poder · Riqueza\nModificador · 0 · 0 · 0 · 0 · 0 · 0 · 0\nTotal · 50 · 50 · 20 · 30 · 10 · 50 · 40\n${extra}`});
describe('vínculo de fontes reais',()=>{
 it('usa total final50 não modificador0',()=>{expect(confirmedSourceTotals(source(),'Ashkar').defense).toBe(50);});
 it('preserva compra40 e total50 sem duplicar bônus',()=>{const s=newHouseState('ashkar','Horselands');s.base.defense=30;s.permanent.defense=5;s.holdings.push({id:'castle',itemId:'castle',name:'Castelo',domainId:'domain',costs:[{resource:'defense',amount:40,mode:'allocation'}],effects:[],ruleVersion:'1',source:'Livro',status:'active'});const next=linkSourceTotals(s,confirmedSourceTotals(source(),'Ashkar'),'record:id:v1');expect(balances(next).total.defense).toBe(50);expect(balances(next).available.defense).toBe(10);expect(next.holdings).toEqual(s.holdings);expect(next.base).toEqual(s.base);expect(s.permanent.defense).toBe(5);});
 it('bloqueia identidade divergente',()=>{expect(()=>confirmedSourceTotals(source('Erdenor'),'Ashkar')).toThrow('Identidade');});
 it('bloqueia totais conflitantes',()=>{expect(()=>confirmedSourceTotals(source('Ashkar','Total · 45 · 50 · 20 · 30 · 10 · 50 · 40'),'Ashkar')).toThrow('divergentes');});
 it('bloqueia erroREF sem inventar saldo',()=>{expect(()=>confirmedSourceTotals(source('Ashkar','#REF!'),'Ashkar')).toThrow('erro');});
 it('não aplica fonte duas vezes',()=>{const s=linkSourceTotals(newHouseState('ashkar'),confirmedSourceTotals(source(),'Ashkar'),'record:id:v1');expect(()=>linkSourceTotals(s,confirmedSourceTotals(source(),'Ashkar'),'record:id:v1')).toThrow('já vinculada');});
 it('hash corresponde ao PostgreSQL md5',()=>{expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');});
});