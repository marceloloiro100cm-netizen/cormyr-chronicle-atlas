import type {Training} from '../domain/types';
export type PresetUnit=Readonly<{typeId:string;name:string;count:number;training:Training}>;
export type ModelHouse=Readonly<{id:string;name:string;region:string;subtitle:string;description:string;units:readonly PresetUnit[]}>;
/** Casas MODELO: nunca consultar o registro real da casa, nem carregar seu inventário,
 * suas moedas, soldados, login, lei, calendário ou ficha militar. */
export const MODEL_HOUSES:readonly ModelHouse[]=Object.freeze([
 {id:'evenhand-model',name:'Evenhand · Modelo',region:'Helmlands',subtitle:'Exército de Hillmarch',
  description:'Linha defensiva, arqueiros e patrulheiros de campo.',
  units:[{typeId:'infantry',name:'Leões de Hillmarch',count:100,training:'trained'},
   {typeId:'archers',name:'Arqueiros da Muralha',count:70,training:'trained'},
   {typeId:'personal-guard',name:'Guarda do Castelo',count:45,training:'veteran'},
   {typeId:'scouts',name:'Patrulha do Immerflow',count:40,training:'trained'}]},
 {id:'ashkar-model',name:'Ashkar · Modelo',region:'Terras do Sul',subtitle:'Hoste da Fênix',
  description:'Cavalaria veloz, saqueadores e infantes agressivos.',
  units:[{typeId:'cavalry',name:'Cavaleiros da Fênix',count:20,training:'veteran'},
   {typeId:'raiders',name:'Incursores Escarlates',count:75,training:'trained'},
   {typeId:'infantry',name:'Lanceiros das Cinzas',count:110,training:'trained'},
   {typeId:'guerrillas',name:'Atiradores do Deserto',count:55,training:'trained'}]},
 {id:'phelles-model',name:'Phelles · Modelo',region:'Crownlands',subtitle:'Dragões Púrpura',
  description:'Guarda real e tropas equilibradas de Suzail.',
  units:[{typeId:'personal-guard',name:'Guarda Púrpura',count:80,training:'veteran'},
   {typeId:'crusaders',name:'Escudos da Coroa',count:90,training:'trained'},
   {typeId:'archers',name:'Besteiros de Suzail',count:70,training:'trained'},
   {typeId:'cavalry',name:'Cavaleiros Reais',count:20,training:'trained'}]},
 {id:'stonecastle-model',name:'Stonecastle · Modelo',region:'Ongul’s Water',subtitle:'Guardas do Rochedo',
  description:'Defesa resistente, guarnições e apoio de engenheiros.',
  units:[{typeId:'garrison',name:'Guarnição do Rochedo',count:110,training:'veteran'},
   {typeId:'engineers',name:'Engenheiros das Rochas',count:60,training:'trained'},
   {typeId:'infantry',name:'Alabardeiros da Abadia',count:100,training:'trained'},
   {typeId:'mercenaries',name:'Espadas Juramentadas',count:70,training:'trained'}]},
 {id:'torchwinter-model',name:'Torchwinter · Modelo',region:'Zundle',subtitle:'Guardas do Céu',
  description:'Ataque móvel e escaramuça em campos florestais.',
  units:[{typeId:'scouts',name:'Batedores do Céu',count:65,training:'veteran'},
   {typeId:'guerrillas',name:'Guerrilheiros de Zundle',count:65,training:'trained'},
   {typeId:'cavalry',name:'Lanças de Zundle',count:20,training:'trained'},
   {typeId:'archers',name:'Arcos do Penhasco',count:75,training:'trained'}]},
 {id:'grantass-model',name:'Grantass · Modelo',region:'Dragon Coast',subtitle:'Defensores das Torres',
  description:'Companhia de apoio, guarnição e combate misto.',
  units:[{typeId:'support',name:'Auxiliares de Campo',count:75,training:'trained'},
   {typeId:'garrison',name:'Sentinelas da Torre',count:95,training:'trained'},
   {typeId:'archers',name:'Vigias do Rio',count:80,training:'trained'},
   {typeId:'mercenaries',name:'Soldados de Contrato',count:80,training:'trained'}]},
]);
export function modelHouse(id:string):ModelHouse {
 const found=MODEL_HOUSES.find(h=>h.id===id);
 if(!found)throw new Error('Casa modelo não reconhecida.');
 return found;
}
