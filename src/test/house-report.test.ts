import { describe,it,expect } from 'vitest';
import { newHouseState } from '@/lib/house/types';
import { houseReport } from '@/lib/house/report';
import { CORE_CATALOG } from '@/lib/house/catalog';
describe('exportação privada da ficha',()=>{
 it('exporta valores alocados separados do total e histórico auditável',()=>{const s=newHouseState('isolated');s.base.defense=50;s.holdings.push({id:'castle',itemId:'castle',name:'Castelo de teste',domainId:'domain',costs:[{resource:'defense',amount:40,mode:'allocation'}],source:'Livro básico',ruleVersion:'1',effects:[],status:'active'});const report=houseReport(s,'Isolada',CORE_CATALOG,[{action:'purchase',explanation:'Compra aprovada',rule:'Fortificação',created_at:'2026-10-24T22:02:00Z',campaign_month:1522*12,version:1}]);expect(report.find(r=>r.title==='Recursos')?.rows[0]).toEqual(['Defesa',50,40,0,10,0]);expect(report.find(r=>r.title==='Histórico de operações')?.rows[0]).toContain('Compra aprovada');});
 it('não perde pendências e eventos ao exportar',()=>{const s=newHouseState('isolated');s.pending=['Casa!B38: #REF!'];s.identity.history=['Vitória'];const report=houseReport(s,'Isolada');expect(report.find(r=>r.title==='Conciliação')?.rows).toEqual([['Casa!B38: #REF!']]);expect(report.find(r=>r.title==='História da casa')?.rows).toEqual([['Vitória']]);});
});