import type {BattleStack} from '../domain/types';

export type CommanderPower =
  | 'rally' | 'blessing' | 'mounted-order' | 'arcane-lance' | 'shield-drill'
  | 'smoke' | 'field-medicine' | 'sabotage' | 'supplies' | 'dread';
export type CommanderCategory='all'|'line'|'ranged'|'mounted'|'scouts'|'support';
export type CommanderStat='attack'|'defense'|'armor'|'movementHex'|'damagePerSoldier'|'moraleTypeModifier';
export type CommanderId =
  | 'tillet'|'noble'|'knight'|'war-mage'|'purple-dragon'
  | 'ranger'|'priest'|'engineer'|'quartermaster'|'ashkar-raider';
export type Commander=Readonly<{
 id:CommanderId;name:string;title:string;style:string;lore:string;
 passive:Readonly<{category:CommanderCategory;stat:CommanderStat;value:number}>;
 power:CommanderPower;powerName:string;powerDescription:string;powerTarget:'ally'|'enemy';
}>;
/** Personagens ORIGINAIS de demonstração, sem copiar nomes, arte ou dados de Pathfinder.
 * Até a aprovação do Narrador, não representam personagens reais da Corte.
 */
export const V3_COMMANDERS:readonly Commander[]=Object.freeze([
 {id:'tillet',name:'Mestre Tillet',title:'Preceptor de Arabel',style:'Disciplina de linha',
  lore:'Estratégia, instrução marcial e ordens precisas.',
  passive:{category:'line',stat:'defense',value:1},power:'rally',powerName:'Reagrupar',
  powerDescription:'Restaura o ânimo e coloca um agrupamento aliado em guarda.',powerTarget:'ally'},
 {id:'noble',name:'Lady Mirena Arundel',title:'Senhora dos Estandartes',style:'Liderança nobre',
  lore:'Mobiliza juramentos e coesão entre tropas.',
  passive:{category:'all',stat:'attack',value:1},power:'blessing',powerName:'Juramento da Coroa',
  powerDescription:'Concede +1 dano individual a uma pilha aliada nesta batalha.',powerTarget:'ally'},
 {id:'knight',name:'Sir Roderic Vael',title:'Cavaleiro do Immerflow',style:'Choque de cavalaria',
  lore:'Marchas velozes, ruptura de linhas e contra-ataques.',
  passive:{category:'mounted',stat:'movementHex',value:1},power:'mounted-order',powerName:'Ordem de Investida',
  powerDescription:'Concede +2 de ataque a um agrupamento aliado.',powerTarget:'ally'},
 {id:'war-mage',name:'Vespera dos Sete Véus',title:'Maga de Guerra',style:'Artilharia arcana',
  lore:'Estuda fórmulas de guerra sob os preceitos de Mystra.',
  passive:{category:'ranged',stat:'attack',value:1},power:'arcane-lance',powerName:'Lança Arcana',
  powerDescription:'Causa dano tático direto a uma tropa inimiga a até quatro hexágonos.',powerTarget:'enemy'},
 {id:'purple-dragon',name:'Capitã Elira Thal',title:'Oficial Dragão Púrpura',style:'Defesa real',
  lore:'Treinamento rigoroso e defesa em formação.',
  passive:{category:'all',stat:'defense',value:1},power:'shield-drill',powerName:'Formação Real',
  powerDescription:'Coloca a tropa aliada em guarda e melhora sua armadura.',powerTarget:'ally'},
 {id:'ranger',name:'Ronan Olho-de-Falcão',title:'Patrulheiro da Floresta',style:'Reconhecimento',
  lore:'Pistas, emboscadas e posicionamento de escaramuças.',
  passive:{category:'scouts',stat:'movementHex',value:1},power:'smoke',powerName:'Cortina de Fumaça',
  powerDescription:'Reduz o alcance do inimigo selecionado.',powerTarget:'enemy'},
 {id:'priest',name:'Irmã Caela de Helm',title:'Capelã de Campanha',style:'Proteção e cura',
  lore:'Apoio espiritual e cuidados aos feridos.',
  passive:{category:'all',stat:'moraleTypeModifier',value:5},power:'field-medicine',powerName:'Mão Protetora',
  powerDescription:'Recupera ferimentos de combatentes ainda vivos; não ressuscita baixas.',powerTarget:'ally'},
 {id:'engineer',name:'Brokk dos Caminhos',title:'Engenheiro de Cerco',style:'Logística de terreno',
  lore:'Conhece máquinas e fragilidades de armaduras e barricadas.',
  passive:{category:'support',stat:'armor',value:1},power:'sabotage',powerName:'Sabotagem',
  powerDescription:'Reduz a armadura de um alvo inimigo.',powerTarget:'enemy'},
 {id:'quartermaster',name:'Seris do Conclave',title:'Intendente de Waukeen',style:'Suprimentos',
  lore:'Mantém linhas de transporte e estoques durante a marcha.',
  passive:{category:'support',stat:'movementHex',value:1},power:'supplies',powerName:'Ração de Marcha',
  powerDescription:'Aumenta o movimento e recupera o ânimo de uma tropa aliada.',powerTarget:'ally'},
 {id:'ashkar-raider',name:'Kael das Cinzas',title:'Capitão das Terras Quentes',style:'Guerra de assalto',
  lore:'Comanda tropas móveis com ímpeto e intimidação.',
  passive:{category:'mounted',stat:'attack',value:1},power:'dread',powerName:'Grito da Fênix',
  powerDescription:'Abala a moral de uma tropa inimiga.',powerTarget:'enemy'},
] satisfies Commander[]);

const LINE=new Set(['infantry','personal-guard','crusaders','garrison','mercenaries','levies','criminals']);
const RANGED=new Set(['archers','scouts','guerrillas']);
const MOUNTED=new Set(['cavalry','raiders']);
const SCOUTS=new Set(['scouts','guerrillas','raiders']);
const SUPPORT=new Set(['support','engineers','garrison']);
export function commander(id:CommanderId):Commander {
 const found=V3_COMMANDERS.find(c=>c.id===id);
 if(!found)throw new Error('Comandante de teste desconhecido.');
 return found;
}
export function commanderAppliesTo(stack:BattleStack,category:CommanderCategory):boolean{
 if(category==='all')return true;
 if(category==='line')return LINE.has(stack.primaryTypeId);
 if(category==='ranged')return RANGED.has(stack.primaryTypeId);
 if(category==='mounted')return MOUNTED.has(stack.primaryTypeId);
 if(category==='scouts')return SCOUTS.has(stack.primaryTypeId);
 return SUPPORT.has(stack.primaryTypeId);
}
export function applyCommanderPassive(stack:BattleStack,id:CommanderId):BattleStack{
 const c=commander(id),p=c.passive;
 if(!commanderAppliesTo(stack,p.category))return stack;
 const bounds:Record<CommanderStat,number>={
  attack:15,defense:15,armor:10,movementHex:6,damagePerSoldier:15,moraleTypeModifier:10,
 };
 const next=Math.min(bounds[p.stat],stack[p.stat]+p.value);
 return {...stack,[p.stat]:next};
}
