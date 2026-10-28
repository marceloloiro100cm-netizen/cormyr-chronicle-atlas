import { describe, it, expect, vi } from 'vitest';
import { isolatedExecutor } from './fixtures/drive-executor';
import { exportBindingHouse } from '@/lib/house/drive-export.server';
import { newHouseState } from '@/lib/house/types';
import type { HouseExportAdapter } from '@/lib/house/drive-export';
function fixture() {
 const f=isolatedExecutor(),b=f.binding('house',{technical_folder_id:'technical'}),s=newHouseState('fixture-house');s.base.defense=50;s.holdings.push({id:'castle',itemId:'castle',name:'Castelo',domainId:'domain',costs:[{resource:'defense',amount:40,mode:'allocation'}],effects:[],ruleVersion:'1',source:'Livro',status:'active'});
 f.tables['noble_house_sheets']=[{house_id:'fixture-house',version:1,state:s,updated_at:'2026-10-24'}];f.tables['noble_house_ledger']=[];f.tables['noble_house_drive_exports']=[];
 return {f,b};
}
describe('executor de Ficha isolado',()=>{
 it('grava exportação e relê status sem modificar compras',async()=>{
  const {f,b}=fixture(),before=JSON.stringify(f.tables['noble_house_sheets']);
  const write=vi.fn(async(_folder,document)=>({fileId:'stable',document,etag:'real'}));const a:HouseExportAdapter={read:vi.fn(),write};
  const result=await exportBindingHouse(f.db,b.id,a);expect(result.synced).toBe(true);expect(write.mock.calls[0]?.[0]).toBe('technical');expect(f.tables['noble_house_drive_exports']?.[0]).toMatchObject({exported_version:1,status:'synced',file_id:'stable'});expect(JSON.stringify(f.tables['noble_house_sheets'])).toBe(before);
 });
 it('marca pendente quando uma compra muda versão durante exportação',async()=>{
  const {f,b}=fixture();const a:HouseExportAdapter={read:vi.fn(),write:async(_folder,document)=>{const sheet=f.tables['noble_house_sheets']?.[0];if(sheet)sheet['version']=2;return {fileId:'stable',document,etag:'real'};}};
  expect((await exportBindingHouse(f.db,b.id,a)).synced).toBe(false);expect(f.tables['noble_house_drive_exports']?.[0]?.['status']).toBe('pending');expect(f.tables['noble_house_sheets']?.[0]?.['version']).toBe(2);
 });
 it('sem ficha salva não chama o Drive',async()=>{
  const {f,b}=fixture();f.tables['noble_house_sheets']=[];const a:HouseExportAdapter={read:vi.fn(),write:vi.fn()};expect((await exportBindingHouse(f.db,b.id,a)).synced).toBe(false);expect(a.write).not.toHaveBeenCalled();
 });
 it('bloqueia pasta sem revisão e mantém ficha intacta',async()=>{
  const {f,b}=fixture();b.privacy_reviewed=false;const a:HouseExportAdapter={read:vi.fn(),write:vi.fn()};await expect(exportBindingHouse(f.db,b.id,a)).rejects.toThrow('não autorizada');expect(a.write).not.toHaveBeenCalled();
 });
 it('registra erro no banco quando a gravação no Drive falha',async()=>{
  const {f,b}=fixture();
  const a:HouseExportAdapter={read:vi.fn(),write:async()=>{throw new Error('Falha simulada no Drive');}};
  await expect(exportBindingHouse(f.db,b.id,a)).rejects.toThrow('Falha simulada no Drive');
  expect(f.tables['noble_house_drive_exports']?.[0]).toMatchObject({status:'error',error:'Falha simulada no Drive'});
 });
});