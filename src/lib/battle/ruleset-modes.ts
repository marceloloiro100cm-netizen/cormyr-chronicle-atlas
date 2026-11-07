/** Seletor de sistemas do módulo de batalha. Não redefine partidas/replays antigos.
 * Os modos ainda não implementados nunca são roteados silenciosamente para PTE/V3.
 */
export const BATTLE_RULESET_OPTIONS=[
 {id:'got',label:'Game of Thrones',shortName:'Regras do livro',
  description:'Guerra dos Tronos RPG: Guerra, Disciplina, ordens, moral, formações e sobreviventes.',
  status:'partial',engine:'got-core'},
 {id:'adapted',label:'Adaptado',shortName:'Sistema atual de Cormyr',
  description:'Mantém o combate desenvolvido: PTE-2.0, Cruzada V3 e laboratório CRZ.',
  status:'available',engine:'pte-v3'},
 {id:'dnd',label:'D&D',shortName:'Combate simplificado',
  description:'Bônus de ataque, Classe de Armadura, pontos de vida, deslocamento e monstros de D&D.',
  status:'planned',engine:null},
] as const;

export type BattleRulesetMode=(typeof BATTLE_RULESET_OPTIONS)[number]['id'];
export type BattleRulesetOption=(typeof BATTLE_RULESET_OPTIONS)[number];

export function battleRulesetOption(id:BattleRulesetMode):BattleRulesetOption {
 const found=BATTLE_RULESET_OPTIONS.find(option=>option.id===id);
 if(!found)throw new Error('Sistema de regras desconhecido.');
 return found;
}
/** Modo pronto para guerra completa; núcleo GOT é testável separadamente. */
export function battleRulesetReady(id:BattleRulesetMode):boolean {
 return battleRulesetOption(id).status==='available';
}
