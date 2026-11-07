import type {BattleStack,Hex} from '../domain/types';
import {hexKey} from '../geometry/hex';

/** O mesmo critério de presença deve ser usado nos cliques do tabuleiro e nos caminhos.
 * Debandada conserva o estado para histórico, mas nunca ocupa um hexágono.
 */
export function fieldUnitAtHex<T extends Pick<BattleStack,'position'|'currentHp'|'moraleState'>>(
 stacks:readonly T[],hex:Hex,
):T|undefined{
 const key=hexKey(hex);
 return stacks.find(s=>s.currentHp>0&&s.moraleState!=='routed'&&hexKey(s.position)===key);
}
