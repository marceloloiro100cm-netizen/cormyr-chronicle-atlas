import type {BattleMap} from '../domain/types';
import {CORMYR_MINIATURE_TYPES,classifyMiniature,type VisualToken} from './tokens';
/** Artificial visual data. No engine imports, campaign IDs or official sources. */
export function miniatureDemo():{map:BattleMap;tokens:VisualToken[]}{
 const map:BattleMap={id:'visual-only-demo',schemaVersion:2,grid:'square',width:11,height:9,
  label:'Protótipo de miniaturas',deployment:{attacker:[],defender:[]},
  tiles:Array.from({length:99},(_,i)=>({q:i%11,r:Math.floor(i/11),
   terrain:i===13||i===24?'forest':i===74?'rock':i===82?'hill':'plain'}))};
 const tokens:VisualToken[]=[
  {id:'demo-infantry',kind:'infantry',name:'Infantaria',side:'attacker',position:{q:3,r:3},count:100,fallback:false},
  {id:'demo-archer',kind:'archer',name:'Arqueiros',side:'attacker',position:{q:6,r:3},count:70,fallback:false},
  {id:'demo-cavalry',kind:'cavalry',name:'Cavalaria',side:'defender',position:{q:3,r:6},count:20,fallback:false},
  {id:'demo-goblin',kind:'goblin',name:'Goblin · demo',side:'defender',position:{q:6,r:6},count:1,fallback:false},
 ];
 return {map,tokens};
}
/** Original read-only showcase for every canonical military category. No campaign data. */
export function miniatureCatalog():{map:BattleMap;tokens:VisualToken[]}{
 const original=miniatureDemo().map;
 const tiles=original.tiles.map(tile=>({...tile,terrain:'plain' as const}));
 const map:BattleMap={...original,id:'military-art-gallery',label:'17 miniaturas militares',tiles};
 const tokens= CORMYR_MINIATURE_TYPES.map((kind,i)=>({
  id:'demo-military-'+kind,name:kind.replace(/-/g,' '),
  side:(i<9?'attacker':'defender') as VisualToken['side'],
  position:{q:1+(i%9),r:i<9?3:6},
  ...classifyMiniature(kind),count:i+1,
  ...(kind==='warships'?{naval:true}:{}),
 }));
 return {map,tokens};
}
