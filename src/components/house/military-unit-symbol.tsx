import {
 Anchor, Castle, Coins, Compass, Cross, Crosshair, Crown, Flame,
 Footprints, KeyRound, Leaf, PawPrint, Pickaxe, Shield, Ship, Swords, Tent, Wheat,
 type LucideIcon
} from 'lucide-react';
import { UNIT_TYPES } from '@/lib/house/engine';

/**
 * Original heraldic pictograms for the 17 unit types of Cormyr.
 * These are military role badges, not the noble family's coat of arms.
 * Keys match UNIT_TYPES.id, never translated labels or an image URL.
 */
const SYMBOLS:Record<string,{icon:LucideIcon|null;field:string;name:string}>={
 support:{icon:Tent,field:'#304a61',name:'Apoio · tenda de campanha'},
 archers:{icon:Crosshair,field:'#2b4d36',name:'Arqueiros · alvo de flechas'},
 scouts:{icon:PawPrint,field:'#62482f',name:'Batedores · rastro de animal'},
 cavalry:{icon:null,field:'#74382e',name:'Cavalaria · cavalo de guerra'},
 criminals:{icon:KeyRound,field:'#282b33',name:'Criminosos · chave clandestina'},
 crusaders:{icon:Cross,field:'#796341',name:'Cruzados · cruz de campanha'},
 engineers:{icon:Pickaxe,field:'#584063',name:'Engenheiros · ferramenta de cerco'},
 special:{icon:Compass,field:'#344b63',name:'Especial · estrela dos caminhos'},
 'personal-guard':{icon:Crown,field:'#947029',name:'Guarda pessoal · coroa protegida'},
 garrison:{icon:Castle,field:'#4f4c4e',name:'Guarnição · fortaleza'},
 guerrillas:{icon:Leaf,field:'#365241',name:'Guerrilheiros · folha das matas'},
 infantry:{icon:Swords,field:'#752d31',name:'Infantaria · armas cruzadas'},
 sailors:{icon:Anchor,field:'#25576b',name:'Marinheiros · âncora'},
 mercenaries:{icon:Coins,field:'#60482f',name:'Mercenários · moedas'},
 warships:{icon:Ship,field:'#273f5b',name:'Navios de guerra · navio à vela'},
 levies:{icon:Wheat,field:'#846a45',name:'Plebeus recrutados · trigo das aldeias'},
 raiders:{icon:Flame,field:'#a34c24',name:'Saqueadores · tocha de ataque'},
};
export const MILITARY_SYMBOL_TYPES=Object.freeze(Object.keys(SYMBOLS));
export function unitSymbolType(types:string[],equipmentTypeId?:string){
 return types.includes(equipmentTypeId??'')&&SYMBOLS[equipmentTypeId??'']
  ? equipmentTypeId! : types.find(type=>SYMBOLS[type])??'';
}
export function MilitaryUnitSymbol({typeId,size='large'}:{typeId?:string;size?:'large'|'small'}){
 const mark=SYMBOLS[typeId??''];
 const Icon=mark?.icon??Shield;
 const description=mark?.name??'Unidade militar de tipo não identificado';
 return <div role="img" aria-label={'Símbolo militar: '+description}
  className={'military-unit-symbol military-unit-symbol--'+size}
  style={{backgroundColor:mark?.field??'#66566a'}}>
  <svg viewBox="0 0 80 92" className="military-unit-banner" aria-hidden="true">
   <path d="M5 5H75V57Q74 69 40 87Q6 69 5 57Z" fill="none" stroke="#d7b67b" strokeWidth="3"/>
   <path d="M10 10H70V55Q70 65 40 81Q10 65 10 55Z" fill="none" stroke="#f0dcb0" strokeWidth="1" opacity=".6"/>
  </svg>
  {typeId==='cavalry'
   ? <svg viewBox="0 0 64 64" className="military-unit-pictogram military-unit-horse" aria-hidden="true">
      <path d="M16 47L20 38L18 27L25 16L37 11L44 16L42 25L49 31L46 41L38 40L37 48Z" fill="#ecd3a0" stroke="#f4dfba" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M28 17L25 9L21 17M38 17L39 9L43 17" fill="#ecd3a0" stroke="#f4dfba" strokeWidth="2"/>
      <path d="M39 29L44 29M22 36L27 39" stroke="#533b36" strokeWidth="3" strokeLinecap="round"/>
      <path d="M13 51H51" stroke="#f4dfba" strokeWidth="3" strokeLinecap="round"/>
     </svg>
   : <Icon className="military-unit-pictogram" aria-hidden="true" strokeWidth={2.2}/>}
 </div>;
}
/** Used by tests so an unmapped catalog type cannot silently show the generic shield. */
export function missingMilitarySymbols(){
 return UNIT_TYPES.filter(type=>!SYMBOLS[type.id]).map(type=>type.id);
}
