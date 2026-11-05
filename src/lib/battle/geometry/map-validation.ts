import type { BattleMap, Hex } from '../domain/types';
import { hexDistance, hexKey, hexNeighbors, insideMap } from './hex';
import { TERRAIN, tileIndex } from './terrain';
export function validateBattleMap(map:BattleMap):string[]{
  const issues:string[]=[];
  if(!((map.width===11&&map.height===9)||(map.width===15&&map.height===11)))
    issues.push('Dimensões permitidas: 11×9 ou 15×11');
  if(!Number.isInteger(map.width)||!Number.isInteger(map.height))return [...issues,'Tamanho não inteiro'];
  if(map.tiles.length!==map.width*map.height)issues.push('Grade incompleta');
  const known=tileIndex(map);
  if(known.size!==map.tiles.length)issues.push('Hexágonos duplicados');
  for(const tile of map.tiles){
    if(!insideMap(tile,map.width,map.height))issues.push('Hexágono fora da grade: '+hexKey(tile));
    if(!Object.hasOwn(TERRAIN,tile.terrain))issues.push('Terreno desconhecido: '+tile.terrain);
  }
  const allZones=new Set<string>();
  for(const side of ['attacker','defender'] as const){
    const zone=map.deployment[side];
    if(zone.length<5)issues.push('Implantação insuficiente para '+side);
    const own=new Set<string>();
    for(const hex of zone){
      const key=hexKey(hex);
      if(own.has(key))issues.push('Zona duplicada: '+key);
      own.add(key);
      if(allZones.has(key))issues.push('Zonas de implantação sobrepostas: '+key);
      allZones.add(key);
      const tile=known.get(key);
      if(!tile||!insideMap(hex,map.width,map.height))issues.push('Zona fora do mapa: '+key);
      else if(tile.terrain==='rock')issues.push('Rocha na implantação: '+key);
    }
  }
  // Regra V2: não iniciar em células diretamente adjacentes entre lados.
  for(const a of map.deployment.attacker)
    if(map.deployment.defender.some(b=>hexDistance(a,b)<2)){
      issues.push('Lados começam adjacentes');break;
    }
  // Exigir um caminho viável entre células iniciais, sem depender de unidades.
  const passable=new Set(map.tiles.filter(t=>t.terrain!=='rock').map(hexKey));
  const visited=new Set<string>(),front:Hex[]=[];
  for(const h of map.deployment.attacker)if(passable.has(hexKey(h))){
    visited.add(hexKey(h));front.push(h);
  }
  for(let i=0;i<front.length;i++){
    const node=front[i]!;
    for(const neighbor of hexNeighbors(node)){
      const key=hexKey(neighbor);
      if(!passable.has(key)||visited.has(key))continue;
      visited.add(key);front.push(neighbor);
    }
  }
  if(!map.deployment.defender.some(h=>visited.has(hexKey(h))))
    issues.push('Não existe caminho caminhável entre as zonas');
  return [...new Set(issues)];
}
export function assertBattleMap(map:BattleMap):void {
  const issues=validateBattleMap(map);
  if(issues.length)throw new Error('Mapa inválido: '+issues.join('; '));
}
