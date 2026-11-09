import type { BattleMap, MapTile, Terrain } from '../domain/types';
import { offsetToAxial } from './hex';
export type BattleScenarioId = 'plain-open' | 'contested-woods' | 'border-hills' | 'narrow-passage' | 'bridge-crossing' | 'fortress-gate';
export const SCENARIOS:Readonly<Record<BattleScenarioId,string>>={
  'plain-open':'Planície aberta',
  'contested-woods':'Bosque disputado',
  'border-hills':'Colinas da fronteira',
  'narrow-passage':'Passagem estreita',
  'bridge-crossing':'Travessia de ponte (barreira)',
  'fortress-gate':'Portão fortificado (muralha simplificada)',
};
export function createScenario(id:BattleScenarioId,width:11|15=11,grid:'hex'|'square'='square'):BattleMap {
  const height:9|11=width===11?9:11;
  const tiles:MapTile[]=[];
  const mid=Math.floor(width/2),center=Math.floor(height/2);
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    let terrain:Terrain='plain';
    if(id==='contested-woods' && col>=3&&col<=width-4 &&
       ((col+2*row)%5===0||(col+row)%7===0))terrain='forest';
    if(id==='border-hills' && col>=3&&col<=width-4){
      if((col+row)%8===0)terrain='rock';
      else if((2*col+row)%4===0)terrain='hill';
    }
    if(id==='narrow-passage' && col===mid && Math.abs(row-center)>1)
      terrain='rock';
    if(id==='bridge-crossing'&&col===mid&&row!==center)terrain='rock';
    // Muralha de rocha intransponível por tropas terrestres; portão aberto ao centro.
    if(id==='fortress-gate'&&
      ((col===width-4&&row>=1&&row<=height-2&&row!==center)||
       (col>=width-4&&(row===1||row===height-2))))terrain='rock';
    tiles.push({...(grid==='square'?{q:col,r:row}:offsetToAxial(col,row)),terrain});
  }
  const deployment={
    attacker:tiles.filter(t=>{const col=grid==='square'?t.q:t.q+Math.floor((t.r-(t.r&1))/2);return col<=1;})
      .map(t=>({q:t.q,r:t.r})),
    defender:tiles.filter(t=>{const col=grid==='square'?t.q:t.q+Math.floor((t.r-(t.r&1))/2);return col>=width-2;})
      .map(t=>({q:t.q,r:t.r})),
  };
  return {id,label:SCENARIOS[id],schemaVersion:2,width,height,tiles,deployment,...(grid==='square'?{grid:'square' as const}:{})};
}
