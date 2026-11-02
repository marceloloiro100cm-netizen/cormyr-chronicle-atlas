import type {VassalWorkbook} from '@/lib/house/vassal-workbook';

/** Transcrição das abas Casa, NPCs da Casa e Exercito do arquivo
 * Ficha da Casa Qazir.xlsx enviado pelo Narrador. Server-only.
 * Não é um snapshot oficial do livro-caixa nem autoriza movimentações.
 */
export const QAZIR_WORKBOOK:VassalWorkbook={
 houseId:'qazir',name:'Qazir',suzerainId:'ashkar',region:'Dragon Coast',
 lord:'Rashid Qazir',heir:'Farid Qazir',motto:'Fire Finds a Way',
 foundation:1115,castle:'Alcácer da Vigília',city:'Safraya',
 source:'Ficha da Casa Qazir.xlsx · Casa, NPCs da Casa, Exercito',
 resources:{defense:30,influence:20,lands:80,law:20,population:20,power:20,wealth:10},
 assets:[
  {name:'Castelo Pequeno',group:'Fortificações',resource:'defense',cost:30},
  {name:'Apoio',group:'Exército',resource:'power',cost:7,detail:'Treinada · linha de investimento independente das três companhias listadas'},
  {name:'Planícies',group:'Terras',resource:'lands',cost:5},
  {name:'Pasto',group:'Terras',resource:'lands',cost:1},
  {name:'Córrego',group:'Terras',resource:'lands',cost:1},
  {name:'Lago Pequeno',group:'Terras',resource:'lands',cost:5},
  {name:'Ruína',group:'Terras',resource:'lands',cost:3},
  {name:'Estrada',group:'Terras',resource:'lands',cost:5},
  {name:'Povoado — Poço de Marwan',group:'Terras',resource:'lands',cost:10},
  {name:'Povoado — Passo da Lamparina',group:'Terras',resource:'lands',cost:10},
  {name:'Povoado — Salina Rubra',group:'Terras',resource:'lands',cost:10},
  {name:'Meistre',group:'Economia',resource:'wealth',cost:10},
 ],
 fortune:{law:-5,population:0,maester:3},
 people:[
  {name:'Rashid Qazir',role:'Lorde da Casa'},
  {name:'Lady Nadiya Qazir',role:'Consorte do Lorde'},
  {name:'Samira Qasir',role:'Filha de Rashid; Senhora de Ashkar por casamento'},
  {name:'Farid Qazir',role:'Primogênito e herdeiro'},
  {name:'Leila Qazir',role:'Administradora das águas'},
  {name:'Nadir al-Safa',role:'Capitão dos Guardas da Lamparina'},
 ],
 units:[
  {name:'Guardas da Lamparina',city:'Safraya',type:'Guarnição',training:'Treinada',
   commander:'Nadir al-Safa',fighting:3,marksmanship:2,agility:2,athletics:3,
   stealth:2,cunning:3,endurance:3,damage:'Atletismo +1',health:9,defense:6,armorPenalty:1,armor:1},
  {name:'Cavaleiros da Estrada da Lamparina',city:'Safraya',type:'Cavalaria',training:'Treinada',
   commander:'Farid Qazir',fighting:3,marksmanship:3,agility:3,athletics:3,
   stealth:2,cunning:2,endurance:3,damage:'Agilidade +1',health:9,defense:6,armorPenalty:2,armor:2},
  {name:'Batedores do Sal',city:'Safraya',type:'Batedores',training:'Treinada',
   commander:'Leila Qazir',fighting:2,marksmanship:3,agility:4,athletics:3,
   stealth:4,cunning:3,endurance:2,damage:'Agilidade +1',health:6,defense:9,armorPenalty:0,armor:0},
 ],
 history:[
  '1115 CV — Reabertura das cisternas e fundação de Safraya',
  'Pacto de vassalagem com Ashkar — data posterior não registrada',
  'Casamento de Samira Qazir com Kael Ashkar — aliança entre as casas',
  'Abertura da Estrada da Lamparina — data não registrada',
 ],
};
