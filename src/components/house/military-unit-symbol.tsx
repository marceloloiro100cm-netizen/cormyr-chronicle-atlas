import {Shield} from 'lucide-react';
import {UNIT_TYPES} from '@/lib/house/engine';

/**
 * Official military unit banners, provided by the Cormyr narrator in Google Drive.
 * One asset per canonical unit type, independent of noble-house heraldry.
 * Files are committed locally to keep them available without Google Drive login.
 */
const SYMBOLS:Record<string,{file:string;field:string;name:string}>={
 support:{file:'01_apoio.jpg',field:'#304a61',name:'Apoio · tenda de campanha'},
 archers:{file:'02_arqueiros.jpg',field:'#2b4d36',name:'Arqueiros · arco e flecha'},
 scouts:{file:'03_batedores.jpg',field:'#62482f',name:'Batedores · exploração'},
 cavalry:{file:'04_cavalaria.jpg',field:'#74382e',name:'Cavalaria · cavalo de guerra'},
 criminals:{file:'05_criminosos.jpg',field:'#282b33',name:'Criminosos · clandestinidade'},
 crusaders:{file:'06_cruzados.jpg',field:'#796341',name:'Cruzados · cruz de campanha'},
 engineers:{file:'07_engenheiros.jpg',field:'#584063',name:'Engenheiros · ferramentas de cerco'},
 special:{file:'08_especial.jpg',field:'#344b63',name:'Especial · estrela dos caminhos'},
 'personal-guard':{file:'09_guarda_pessoal.jpg',field:'#947029',name:'Guarda pessoal · coroa protegida'},
 garrison:{file:'10_guarnicao.jpg',field:'#4f4c4e',name:'Guarnição · torre defensiva'},
 guerrillas:{file:'11_guerrilheiros.jpg',field:'#365241',name:'Guerrilheiros · serpente'},
 infantry:{file:'12_infantaria.jpg',field:'#752d31',name:'Infantaria · armas cruzadas'},
 sailors:{file:'13_marinheiros.jpg',field:'#25576b',name:'Marinheiros · âncora'},
 mercenaries:{file:'14_mercenarios.jpg',field:'#60482f',name:'Mercenários · moedas'},
 warships:{file:'15_navios_de_guerra.jpg',field:'#273f5b',name:'Navios de guerra · navio à vela'},
 levies:{file:'16_plebeus_recrutados.jpg',field:'#846a45',name:'Plebeus recrutados · serviço comum'},
 raiders:{file:'17_saqueadores.jpg',field:'#a34c24',name:'Saqueadores · tocha de ataque'},
};

const ASSET_ROOT='/assets/military-units/';
export const MILITARY_SYMBOL_TYPES=Object.freeze(Object.keys(SYMBOLS));

/** The equipment choice determines the emblem of a mixed unit. */
export function unitSymbolType(types:string[],equipmentTypeId?:string){
 return types.includes(equipmentTypeId??'')&&SYMBOLS[equipmentTypeId??'']
  ? equipmentTypeId! : types.find(type=>SYMBOLS[type])??'';
}

export function militaryUnitSymbolSrc(typeId?:string):string|undefined {
 const file=SYMBOLS[typeId??'']?.file;
 return file?ASSET_ROOT+file:undefined;
}

export function MilitaryUnitSymbol({typeId,size='large'}:{typeId?:string;size?:'large'|'small'}){
 const mark=SYMBOLS[typeId??''];
 const src=militaryUnitSymbolSrc(typeId);
 return <div role="img" aria-label={'Símbolo militar: '+(mark?.name??'Unidade militar de tipo não identificado')}
  className={'military-unit-symbol military-unit-symbol--'+size}
  style={{backgroundColor:mark?.field??'#66566a'}}>
  {src
   ? <img src={src} alt="" className="military-unit-artwork"
      loading={size==='small'?'lazy':'eager'} decoding="async"/>
   : <Shield className="military-unit-pictogram" aria-hidden="true"/>}
 </div>;
}

/** Fails CI when a catalog type lacks its own official image. */
export function missingMilitarySymbols(){
 return UNIT_TYPES.filter(type=>!SYMBOLS[type.id]).map(type=>type.id);
}
