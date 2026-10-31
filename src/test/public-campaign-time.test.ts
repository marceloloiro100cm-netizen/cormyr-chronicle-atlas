import {describe,expect,it} from 'vitest';
import {publicCampaignTimeProjection} from '@/lib/calendar/public-time';
import {dateKey} from '@/lib/calendar/harptos';

describe('Hub Temporal · Lote 5 · contrato de projeção pública',()=>{
 it('expõe apenas data, versão e rótulos derivados sem outros dados privados',()=>{
  const source={
   year:1522,month:0,day:11,festival:null,version:4,
   published_week:99,last_round:96,auto_advance:false,updated_by:'segredo',
   house_sheets:[{houseId:'a',treasury:100}],letter_drafts:['privada'],
  };
  const result=publicCampaignTimeProjection(source);
  expect(result).toEqual({
   year:1522,month:0,day:11,festival:null,version:4,
   date:'1522-01-11',period:'2ª désdia · Hammer · 1522 CV',
   label:'11 de Hammer · 1522 CV',
  });
  expect(JSON.stringify(result)).not.toContain('segredo');
  expect(JSON.stringify(result)).not.toContain('letter');
 });
 it('preserva datas intercalares sem inventar quarta désdia',()=>{
  const time=publicCampaignTimeProjection({year:1524,month:6,day:30,festival:'shieldmeet',version:5});
  expect(time.date).toBe('1524-F-shieldmeet');
  expect(time.period).toMatch(/Shieldmeet/);
  expect(time.period).not.toContain('4ª');
  expect(dateKey(time)).toBe(time.date);
 });
 it('rejeita calendário ausente, campo inválido, data incoerente ou ano impossível',()=>{
  for(const input of [null,[],{},{
   year:1522,month:0,day:11,festival:null,version:-1
  },{
   year:1522,month:13,day:11,festival:null,version:1
  },{
   year:1523,month:6,day:30,festival:'shieldmeet',version:1
  },{
   year:1524,month:0,day:30,festival:'greengrass',version:1
  },{
   year:1522,month:0,day:31,festival:null,version:1
  }])expect(()=>publicCampaignTimeProjection(input)).toThrow();
 });
 it('não inventa data histórica para uma resposta incompleta',()=>{
  expect(()=>publicCampaignTimeProjection({year:1522,month:0,day:1,version:1})).toThrow();
  expect(()=>publicCampaignTimeProjection({year:1522,month:0,festival:null,version:1})).toThrow();
 });
});
