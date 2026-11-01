import {describe,expect,it} from 'vitest';
import {ageDashboardCsv,validateAgeDashboard} from '@/lib/calendar/character-ages';
const state=(age:number|null,year:number,status='ok')=>({
 age,status,as_of_year:year,life:'alive',reason:'Confirmado'
});
function sample(){
 return {current_year:1522,target_year:1523,truncated:false,
  totals:{total:2,nobles:2,alive:2,deceased:0,pending:1,conflicts:1,
   unknown:1,not_born:0,aged_nobles:1},
  characters:[
   {id:'id-evenhand',display_name:'Percival Evenhand',house_id:'evenhand',
    noble_roles:['Lorde'],race:'Humano',is_noble:true,
    visibility:'house',alive_status:'alive',review_status:'reviewed',
    confidence:'confirmed',birth_year:1492,death_year:null,
    before_age:state(30,1522),after_age:state(31,1523)},
   {id:'id-staghunt',display_name:'=HYPERLINK("evil")',house_id:'staghunt',
    noble_roles:[],race:null,is_noble:true,visibility:'gm',alive_status:'unknown',
    review_status:'conflict',confidence:'unverified',birth_year:1443,death_year:null,
    before_age:state(null,1522,'conflict'),after_age:state(null,1523,'conflict')},
  ]};
}
describe('Lote 7 · contrato de idades derivadas',()=>{
 it('aceita a idade de uma pessoa única em dois anos com status próprio',()=>{
  const d=validateAgeDashboard(sample(),1522,1523);
  expect(d.totals.aged_nobles).toBe(1);
  expect(d.characters[0]?.before_age.age).toBe(30);
  expect(d.characters[0]?.after_age.age).toBe(31);
  expect(d.characters[1]?.after_age.age).toBeNull();
 });
 it('rejeita respostas de versão temporal errada, fontes duplicadas e valor inventado',()=>{
  const d=sample();
  expect(()=>validateAgeDashboard(d,1523,1524)).toThrow();
  expect(()=>validateAgeDashboard({...d,characters:[d.characters[0],d.characters[0]]},1522,1523)).toThrow();
  const invalid=sample();
  invalid.characters[1]!.after_age=state(79,1523,'conflict');
  expect(()=>validateAgeDashboard(invalid,1522,1523)).toThrow();
 });
 it('exporta idades válidas no ano, sem fórmulas executáveis em CSV',()=>{
  const d=validateAgeDashboard(sample(),1522,1523);
  const csv=ageDashboardCsv(d);
  expect(csv).toContain('"Percival Evenhand"');
  expect(csv).toContain('"1522";"30";"ok";"1523";"31";"ok"');
  expect(csv).toContain('"\u0027=HYPERLINK(');
  expect(csv).not.toMatch(/(?:\r\n|^)=[A-Z]/);
 });
});
