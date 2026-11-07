import {useState} from 'react';
import {Shield,ShieldCheck} from 'lucide-react';
import {vassalCrestUrl} from '@/lib/house/vassal-links';
import {REGIONS} from '@/lib/house/regions';
import type {BattleHouseDirectoryRow} from '@/lib/battle/adapters/house-directory';
import type {Side} from '@/lib/battle/domain/types';
import './battle-house-heraldry.css';

export type BattleHouseHeraldry=BattleHouseDirectoryRow;
export const battleHouseRegionLabel=(house:BattleHouseHeraldry)=>
 REGIONS[house.region]?.name??house.region??'Região não definida';
export const battleHouseClassLabel=(house:BattleHouseHeraldry)=>
 house.classification==='royal'?'Casa Real':
 house.classification==='major'?'Casa Maior':'Casa Nobre';

/** Always use the house's registered crest path; never derive one from a slug.
 * Image errors are isolated to that house and yield an accessible shield placeholder.
 * object-fit:contain in CSS preserves the entire original image and heraldry.
 */
export function BattleHouseCrest({house,size='small',decorative=false}:{
 house?:BattleHouseHeraldry|null|undefined;size?:'tiny'|'small'|'large';decorative?:boolean;
}){
 const url=vassalCrestUrl(house?.crest);
 const [broken,setBroken]=useState<string|null>(null);
 const hasImage=Boolean(url&&broken!==url);
 const name=house?.name??'Casa não selecionada';
 return <span className={'battle-house-crest battle-house-crest--'+size}
  data-house-crest={house?.id??'none'} title={'Brasão: '+name}>
  {hasImage?<img key={url} src={url!} alt={decorative?'':'Brasão da Casa '+name}
   aria-hidden={decorative?true:undefined} loading={size==='large'?'eager':'lazy'}
   decoding="async" onError={()=>setBroken(url)}/>:
   <Shield role={decorative?undefined:'img'} aria-label={decorative?undefined:
    'Brasão indisponível para '+name} aria-hidden={decorative?true:undefined}/>}
 </span>;
}

export function BattleHouseIdentityCard({house,sourceStatus,unitCount,men,selectedCount}:{
 house?:BattleHouseHeraldry|null|undefined;sourceStatus?:string;
 unitCount?:number;men?:number;selectedCount?:number;
}){
 const sourceLabel=sourceStatus==='recorded'?'Ficha militar cadastrada':
  sourceStatus==='scenario-roster'?'Exército documental de treinamento':
  sourceStatus==='empty'?'Sem unidades cadastradas':
  sourceStatus==='no-military-sheet'?'Sem ficha militar disponível':
  'Selecione uma Casa e consulte suas forças';
 return <section className="battle-heraldry-identity" aria-label="Casa selecionada">
  <header><ShieldCheck aria-hidden="true" size={20}/><h3>Casa Selecionada</h3></header>
  {house?<div className="battle-heraldry-identity-body">
   <BattleHouseCrest house={house} size="large"/>
   <div className="battle-heraldry-identity-text">
    <h4>{house.name}</h4>
    <p>{battleHouseClassLabel(house)} · {battleHouseRegionLabel(house)}</p>
    <div className="battle-heraldry-separator" aria-hidden="true"/>
    <p className="battle-heraldry-source" role="status">
     {sourceLabel}</p>
    {unitCount!==undefined&&<p className="battle-heraldry-unit-count">
     {unitCount} grupos · {men?.toLocaleString('pt-BR')??'0'} combatentes
     {selectedCount!==undefined&&<span> · {selectedCount} selecionados</span>}</p>}
   </div>
  </div>:<div className="battle-heraldry-empty">
   <Shield aria-hidden="true" size={50}/>
   <p>Escolha a região e a Casa para revelar seu brasão e suas forças.</p>
  </div>}
 </section>;
}

export function BattleHouseBanner({side,house,name,subtle=false}:{
 side:Side;house?:BattleHouseHeraldry|null|undefined;name?:string;subtle?:boolean;
}){
 const label=side==='attacker'?'Atacantes':'Defensores';
 return <div className={'battle-house-banner battle-house-banner--'+side+
  (subtle?' battle-house-banner--subtle':'')}
  aria-label={label+': '+(name||house?.name||'Exército não selecionado')}>
  <BattleHouseCrest house={house} size="small" decorative/>
  <span className="battle-house-banner-label">{label}:</span>
  <strong>{name||house?.name||'Exército não selecionado'}</strong>
 </div>;
}

export function BattleHouseVersus({houses,names}:{
 houses?:Partial<Record<Side,BattleHouseHeraldry|null>>|undefined;
 names:Record<Side,string>;
}){
 if(!houses?.attacker&&!houses?.defender)return null;
 return <div className="battle-house-versus" aria-label="Casas em confronto">
  <BattleHouseBanner side="attacker" house={houses.attacker} name={names.attacker} subtle/>
  <span className="battle-house-versus-mark" aria-hidden="true">×</span>
  <BattleHouseBanner side="defender" house={houses.defender} name={names.defender} subtle/>
 </div>;
}
