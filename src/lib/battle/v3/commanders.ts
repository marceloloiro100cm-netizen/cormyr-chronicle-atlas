import type {BattleStack} from '../domain/types';

export type CommanderPower =
  | 'rally' | 'blessing' | 'mounted-order' | 'arcane-lance' | 'shield-drill'
  | 'smoke' | 'field-medicine' | 'sabotage' | 'supplies' | 'dread';
export type CommanderCategory='all'|'line'|'ranged'|'mounted'|'scouts'|'support';
export type CommanderStat='attack'|'defense'|'armor'|'movementHex'|'damagePerSoldier'|'moraleTypeModifier';
export type CommanderId =
  | 'tillet'|'noble'|'knight'|'war-mage'|'purple-dragon'
  | 'ranger'|'priest'|'engineer'|'quartermaster'|'ashkar-raider'
  | 'adventurer'|'hero'|'tempus-priest'|'arms-master'|'archer-captain'
  | 'veteran-mercenary'|'assassin'|'warlord'|'war-bard'|'necromancer';
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
 {id:'adventurer',name:'Aventureiro',title:'Veterano das Estradas',style:'Improviso tático',
  lore:'Transforma obstáculos em rotas de oportunidade e apoia escaramuças.',
  passive:{category:'scouts',stat:'movementHex',value:1},power:'supplies',powerName:'Preparação de Viagem',
  powerDescription:'Melhora o deslocamento e a coesão de uma tropa aliada.',powerTarget:'ally'},
 {id:'hero',name:'Herói',title:'Defensor de Cormyr',style:'Coragem inspiradora',
  lore:'Inspira a linha quando o confronto parece perdido.',
  passive:{category:'all',stat:'moraleTypeModifier',value:3},power:'rally',powerName:'Grito de Resistência',
  powerDescription:'Reagrupa e protege uma formação aliada.',powerTarget:'ally'},
 {id:'tempus-priest',name:'Sacerdote de Tempus',title:'Capelão da Batalha',style:'Fervor guerreiro',
  lore:'Invoca a determinação de Tempus em campo de combate.',
  passive:{category:'line',stat:'attack',value:1},power:'blessing',powerName:'Bênção de Tempus',
  powerDescription:'Aumenta o dano de uma formação aliada.',powerTarget:'ally'},
 {id:'arms-master',name:'Mestre de Armas',title:'Instrutor de Veteranos',style:'Disciplina marcial',
  lore:'Treina escudos e coordena o posicionamento de veteranos.',
  passive:{category:'line',stat:'defense',value:1},power:'shield-drill',powerName:'Treino de Escudos',
  powerDescription:'Fortalece a armadura e a guarda de uma tropa aliada.',powerTarget:'ally'},
 {id:'archer-captain',name:'Capitão de Arqueiros',title:'Comandante dos Atiradores',style:'Disparos coordenados',
  lore:'Concentra as ordens de fogo no ponto mais vulnerável.',
  passive:{category:'ranged',stat:'attack',value:1},power:'smoke',powerName:'Cobertura de Flechas',
  powerDescription:'Compromete o alcance de um agrupamento inimigo.',powerTarget:'enemy'},
 {id:'veteran-mercenary',name:'Mercenário Veterano',title:'Capitão da Companhia Livre',style:'Resistência de campanha',
  lore:'Conhece os perigos do choque prolongado entre exércitos.',
  passive:{category:'all',stat:'armor',value:1},power:'rally',powerName:'Manter a Linha',
  powerDescription:'Restabelece a moral e reforça a defesa de uma tropa.',powerTarget:'ally'},
 {id:'assassin',name:'Assassino',title:'Mestre de Infiltração',style:'Guerra de sabotagem',
  lore:'Enfraquece a prontidão de unidades isoladas.',
  passive:{category:'scouts',stat:'attack',value:1},power:'sabotage',powerName:'Ataque Cirúrgico',
  powerDescription:'Reduz a armadura de um agrupamento inimigo.',powerTarget:'enemy'},
 {id:'warlord',name:'Senhor da Guerra',title:'General dos Estandartes',style:'Comando de assalto',
  lore:'Conduz ofensivas disciplinadas e manobras de ruptura.',
  passive:{category:'all',stat:'attack',value:1},power:'mounted-order',powerName:'Ordem de Ruptura',
  powerDescription:'Melhora o ataque da formação aliada selecionada.',powerTarget:'ally'},
 {id:'war-bard',name:'Bardo de Guerra',title:'Arauto dos Exércitos',style:'Música e disciplina',
  lore:'Mantém a coragem dos estandartes por meio de cantos de guerra.',
  passive:{category:'all',stat:'moraleTypeModifier',value:4},power:'rally',powerName:'Canção dos Estandartes',
  powerDescription:'Reagrupa uma formação e concede guarda adicional.',powerTarget:'ally'},
 {id:'necromancer',name:'Necromante',title:'Arcanista das Sombras',style:'Terror estratégico',
  lore:'Emprega a ameaça de sombras como pressão psicológica de combate.',
  passive:{category:'support',stat:'attack',value:1},power:'dread',powerName:'Sussurro dos Mortos',
  powerDescription:'Abala o ânimo de um agrupamento inimigo.',powerTarget:'enemy'},
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
