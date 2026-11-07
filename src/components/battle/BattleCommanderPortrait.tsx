import {useEffect,useState} from 'react';
import {BATTLE_COMMANDER_PORTRAITS,commanderPortraitUrl,
 type BattlePortraitId} from '@/lib/battle/v3/commander-portraits';
import './battle-commander-portraits.css';

/** Retratos locais, sem chamadas ao Drive no navegador.
 * Se o asset estiver ausente, preserva um fallback acessível.
 */
export function BattleCommanderPortrait({id,className='',eager=false}:{
 id:BattlePortraitId;className?:string;eager?:boolean;
}){
 const [broken,setBroken]=useState(false);
 useEffect(()=>setBroken(false),[id]);
 const role=BATTLE_COMMANDER_PORTRAITS[id].role;
 return <div className={'battle-commander-portrait '+className}
  role="group" aria-label={'Retrato de '+role}>
  {broken?<div className="battle-commander-portrait-fallback"
   aria-label={'Retrato indisponível: '+role} role="img">
   <span aria-hidden="true">♜</span>
  </div>:<img src={commanderPortraitUrl(id)} alt={'Comandante: '+role}
   loading={eager?'eager':'lazy'} decoding="async" onError={()=>setBroken(true)}/>}
 </div>;
}
