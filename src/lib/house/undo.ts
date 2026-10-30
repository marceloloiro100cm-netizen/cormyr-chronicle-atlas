/** Resolve an undo chain without permitting a new roll of audit-sensitive dice.
 * Rows must be ordered newest-first. A second consecutive undo targets the
 * second-most-recent ordinary operation, rather than undoing the previous undo.
 */
export function selectUndoSnapshot<T extends {action:string;before_state:unknown}>(
 rows:readonly T[],
):T{
 const consecutive=rows.findIndex(row=>row.action!=='undo');
 if(consecutive<0)throw new Error('Histórico insuficiente para desfazer.');
 const actions=rows.filter(row=>row.action!=='undo');
 const target=actions[consecutive];
 if(!target?.before_state)throw new Error('Nada mais para desfazer.');
 if(['roll','foundation_roll','history_roll','member_bonus'].includes(target.action))
  throw new Error('Rolagens auditadas não podem ser desfeitas para tentar novamente.');
 if(target.action==='import'||target.action==='submit')
  throw new Error('Importações e decisões de revisão exigem correção do Narrador.');
 return target;
}
