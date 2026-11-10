import type {Hex} from '../domain/types';
import type {VisualSquareMap,VisualTerrain,VisualToken} from './tokens';

/** UI-only terrain descriptions. The original engine is authoritative for passability,
 * cover and movement costs; this never derives or authorizes an action.
 */
const TERRAIN_LABELS:Readonly<Record<VisualTerrain,string>>={
 plain:'Planície',forest:'Floresta',hill:'Colina',rock:'Rocha',
 water:'Água',settlement:'Povoado',desert:'Deserto',marsh:'Pântano',
 road:'Estrada',bridge:'Ponte',coast:'Costa',ruins:'Ruínas',
 mountain:'Montanha',
};
export type VisualCellInspection=Readonly<{
 coordinates:string;terrain:string;features:readonly string[];
 occupant:string|null;side:string|null;
}>;
export function inspectVisualCell(map:VisualSquareMap,tokens:readonly VisualToken[],
 hex:Hex):VisualCellInspection|null{
 const tile=map.tiles.find(t=>t.q===hex.q&&t.r===hex.r);
 if(!tile)return null;
 const occupant=tokens.find(t=>
  (t.footprintCells?.length?t.footprintCells:[t.position])
   .some(cell=>cell.q===hex.q&&cell.r===hex.r));
 const road=tile.road||tile.terrain==='road';
 const bridge=tile.bridge||tile.terrain==='bridge';
 return {
  coordinates:hex.q+','+hex.r,
  terrain:TERRAIN_LABELS[tile.terrain]??'Terreno',
  features:[...(road?['Estrada']:[]),...(bridge?['Ponte']:[])],
  occupant:occupant?.name??null,
  side:occupant?(occupant.side==='attacker'?'Atacante':'Defensor'):null,
 };
}
