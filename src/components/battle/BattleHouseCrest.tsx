import {useState} from 'react';
import {Shield} from 'lucide-react';
import {vassalCrestUrl} from '@/lib/house/vassal-links';
import type {BattleHouseDirectoryRow} from '@/lib/battle/adapters/house-directory';
import type {Side} from '@/lib/battle/domain/types';
import './battle-house-crests.css';

export type BattleHouseIdentity=Pick<BattleHouseDirectoryRow,'id'|'name'|'crest'> & {region?:string};

/** Only real house assets: never derive a crest from a name or show another house's art.
 * Use contain to preserve full shields, banners and differing source aspect ratios.
 */
export function BattleHouseCrest({house,size='small'}:{
 house:BattleHouseIdentity;size?:'small'|'medium'|'large';
}){
 const [failedUrl,setFailedUrl]=useState<string|null>(null);
 const src=vassalCrestUrl(house.crest);
 return <span className={'battle-house-crest battle-house-crest--'+size} data-house-crest={house.id}>
  {src&&failedUrl!==src?
   <img src={src} alt={'Brasão da Casa '+house.name}
    loading={size==='large'?'eager':'lazy'} decoding="async"
    onError={()=>setFailedUrl(src)}/>:
   <span className="battle-house-crest__fallback" role="img"
    aria-label={'Brasão indisponível para a Casa '+house.name}>
    <Shield aria-hidden="true"/>
   </span>}
 </span>;
}

export function BattleHouseRibbon({house,side,variant='ribbon'}:{
 house:BattleHouseIdentity;side:Side;variant?:'ribbon'|'compact';
}){
 return <div className={'battle-house-ribbon battle-house-ribbon--'+variant}
  aria-label={(side==='attacker'?'Atacante':'Defensor')+': Casa '+house.name}>
  <BattleHouseCrest house={house} size={variant==='compact'?'small':'medium'}/>
  <span className="battle-house-ribbon__text">
   <small>{side==='attacker'?'ATACANTE':'DEFENSOR'}</small>
   <strong>{house.name}</strong>
  </span>
 </div>;
}

export function BattleHouseRibbons({houses}:{
 houses:Readonly<Record<Side,readonly BattleHouseIdentity[]>>;
}){
 if(!houses.attacker.length&&!houses.defender.length)return null;
 return <div className="battle-house-ribbons" aria-label="Brasões dos exércitos participantes">
  {(['attacker','defender'] as const).map(side=>
   <div key={side} className="battle-house-ribbons__side">
    {houses[side].length?houses[side].map(h=>
     <BattleHouseRibbon key={h.id} house={h} side={side}/>):
     <span className="battle-house-ribbons__model">
      {side==='attacker'?'Atacante':'Defensor'} · Forças-modelo
     </span>}
   </div>)}
 </div>;
}

export function BattleSelectedHouseCard({house,unitCount,menCount,status,side}:{
 house:BattleHouseDirectoryRow|null;
 unitCount:number;menCount:number;
 status:'pending'|'recorded'|'scenario-roster'|'empty'|'no-military-sheet';
 side:Side;
}){
 return <aside className="battle-house-selected-card" aria-label="Casa selecionada">
  <h4>Casa selecionada</h4>
  {house?<div className="battle-house-selected-card__identity">
   <BattleHouseCrest house={house} size="large"/>
   <div>
    <strong>{house.name}</strong>
    <span>{house.region||'Região não classificada'}</span>
    <small>{status==='recorded'?'Ficha militar operacional':
     status==='scenario-roster'?'Exército documental para simulação':
     status==='pending'?'Consultando unidades…':'Sem unidades disponíveis'}</small>
   </div>
  </div>:
  <p className="battle-house-selected-card__empty">
   Selecione uma Região e uma Casa para exibir seu brasão oficial.
  </p>}
  {house&&<div className="battle-house-selected-card__count" aria-label="Resumo do exército">
   <span><strong>{unitCount}</strong> unidades</span>
   <span><strong>{menCount.toLocaleString('pt-BR')}</strong> de efetivo listado</span>
  </div>}
  <div className="battle-house-selected-card__side">
   <small>Lado da batalha</small>
   {house?<BattleHouseRibbon house={house} side={side} variant="compact"/>:
    <p>{side==='attacker'?'Atacante':'Defensor'} · Selecione uma Casa</p>}
  </div>
 </aside>;
}
