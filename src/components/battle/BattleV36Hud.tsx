import type {BattleCommand,BattleStack,Side} from '@/lib/battle/domain/types';
import {livingCount} from '@/lib/battle/domain/morale';
import {commander} from '@/lib/battle/v3/commanders';
import {v36Timeline,v36CommanderIcon,v36CommanderResources,v36Casualties,v36UnitStatus}
 from '@/lib/battle/v3/presentation-v36';
import {v3SkillName,type V3Game,type V3UnitSkill} from '@/lib/battle/v3/engine';
import {Button} from '@/components/ui/button';
import {militaryUnitSymbolSrc} from '@/components/house/military-unit-symbol';
import type {V3Game as Game} from '@/lib/battle/v3/engine';

export type V36ActionMode='inspect'|'move'|'attack'|'skill'|'power';
export function BattleV36Initiative({game,onInspect}:{
 game:Game;onInspect:(id:string)=>void;
}){
 const timeline=v36Timeline(game.battle,14);
 return <section className="crusade-v36-initiative battle-surface" aria-label="Fila de iniciativa da Cruzada">
  <div className="crusade-v36-initiative-head">
   <strong>INICIATIVA</strong>
   <span>Rodada {game.battle.round}</span>
   <small>Ordem atual e previsão da próxima rodada</small>
  </div>
  <ol className="crusade-v36-turn-list">
   {timeline.map((item,i)=>{
    const unit=game.battle.stacks.find(s=>s.id===item.id);
    const icon=militaryUnitSymbolSrc(unit?.primaryTypeId);
    const divider=i>0&&timeline[i-1]?.round!==item.round;
    return <li key={item.round+'-'+item.id}
      className={'crusade-v36-turn'+(item.current?' current':'')+
       (item.side==='attacker'?' allied':' enemy')+(item.waiting?' waiting':'')}>
      {divider&&<span className="crusade-v36-round-divider">Rodada {item.round} · previsão</span>}
      <button type="button" title={item.name+' · iniciativa '+item.initiative+
        ' · '+item.count+' combatentes'}
       aria-label={(item.current?'Turno atual: ':'Turno previsto: ')+item.name+
        ', '+item.count+' combatentes, rodada '+item.round}
       aria-current={item.current?'step':undefined} onClick={()=>onInspect(item.id)}>
       {icon?<img src={icon} alt="" loading="lazy"/>:
        <span className="crusade-v36-turn-fallback">{item.name.slice(0,2).toUpperCase()}</span>}
       <b>{item.count}</b>
      </button>
      <small>{item.current?'ATUAL':item.waiting?'ESPERA':item.round>game.battle.round?'PRÓX.':''}</small>
     </li>;
   })}
  </ol>
 </section>;
}
export function BattleV36CommanderPanel({game,side,onPower,canPower,active}:{
 game:Game;side:Side;onPower:()=>void;canPower:boolean;active:BattleStack|null;
}){
 const id=game.commanders[side],leader=commander(id);
 const used=game.powerUses?.[side]??(game.usedPowers[side]?1:0);
 const pool=v36CommanderResources(id,game.progressions?.[side],used);
 const casualty=v36Casualties(game.battle,side);
 return <section className="crusade-v36-command-panel" aria-label="Comandante na mesa de guerra">
  <div className="crusade-v36-commander-identity">
   <div aria-hidden="true" className="crusade-v36-commander-emblem">{v36CommanderIcon(id)}</div>
   <div><p className="battle-eyebrow">TENDA DE COMANDO</p>
    <h2>{pool.name}</h2><p>{leader.title}</p></div>
  </div>
  <div className="crusade-v36-command-resources">
   <label>Ordens especiais de treino <strong>{pool.remaining}/{pool.capacity}</strong></label>
   <div role="progressbar" aria-label="Cargas de comando restantes" aria-valuemin={0}
    aria-valuemax={pool.capacity} aria-valuenow={pool.remaining}
    className="crusade-v36-command-meter"><span
     style={{width:(100*pool.remaining/pool.capacity)+'%'}}/></div>
   <small>Uso por batalha no motor V3. Energia mágica por rodada ainda não foi implementada.</small>
  </div>
  <div className="crusade-v36-field-hospital">
   <span aria-hidden="true">✚</span>
   <div><strong>Tendas dos Tillets</strong>
    <p>Baixas táticas: {casualty.casualties} de {casualty.initial} soldados</p>
    <small>Indicador visual. Não recupera nem altera baixas automaticamente.</small></div>
  </div>
  <div className="crusade-v36-fast-abilities">
   <h3>Habilidade do comandante</h3>
   <Button size="sm" variant="outline" disabled={!canPower||active?.side!==side}
    onClick={onPower} title={leader.powerDescription}>
    <span aria-hidden="true">{v36CommanderIcon(id)}</span> {leader.powerName}
   </Button>
   <p>{leader.powerDescription}</p>
  </div>
 </section>;
}
export function BattleV36ActionBar({active,canAct,mode,legal,skills,skill,
 onMode,onSkill,onAction,onFinish,onReset}:{
 active:BattleStack|null;canAct:boolean;mode:V36ActionMode;
 legal:readonly BattleCommand[];skills:readonly V3UnitSkill[];skill:V3UnitSkill|null;
 onMode:(mode:V36ActionMode)=>void;onSkill:(skill:V3UnitSkill)=>void;
 onAction:(command:BattleCommand)=>void;onFinish:()=>void;onReset:()=>void;
}){
 const allowed=(type:BattleCommand['type'])=>legal.some(c=>c.type===type);
 return <section className="crusade-v36-action-rail battle-surface"
  aria-label="Barra inferior de ações de batalha">
  <div className="crusade-v36-active-unit">
   <span className="crusade-v36-unit-insignia" aria-hidden="true">⚔</span>
   <div><small>UNIDADE EM ATIVAÇÃO</small><strong>{active?.name??'Aguardando batalha'}</strong>
    <span>{active?livingCount(active)+' combatentes · '+v36UnitStatus(active):'—'}</span></div>
  </div>
  <div className="crusade-v36-commands" role="group" aria-label="Ações da unidade">
   <Button size="sm" variant={mode==='move'?'default':'outline'}
    disabled={!canAct||!allowed('MOVE')} onClick={()=>onMode('move')}>◈ Mover</Button>
   <Button size="sm" variant={mode==='attack'?'default':'outline'}
    disabled={!canAct||!allowed('ATTACK')} onClick={()=>onMode('attack')}>⚔ Atacar</Button>
   <Button size="sm" variant="outline" disabled={!canAct||!active||!allowed('WAIT')}
    onClick={()=>active&&onAction({type:'WAIT',unitId:active.id})}>⌛ Esperar</Button>
   <Button size="sm" variant="outline" disabled={!canAct||!active||!allowed('DEFEND')}
    onClick={()=>active&&onAction({type:'DEFEND',unitId:active.id})}>⛨ Defender</Button>
   <Button size="sm" variant="outline" disabled={!canAct||!active}
    onClick={onFinish}>Fim de turno</Button>
   <Button size="sm" variant="ghost" disabled={mode==='inspect'}
    onClick={onReset}>Cancelar seleção</Button>
  </div>
  <div className="crusade-v36-unit-skills">
   <small>HABILIDADES DA UNIDADE</small>
   {skills.length===0?<span>Sem habilidade disponível</span>:skills.map(ability=>
    <Button key={ability} size="sm" variant={mode==='skill'&&skill===ability?'default':'outline'}
     disabled={!canAct} onClick={()=>onSkill(ability)}
     title={v3SkillName(ability)}>{v3SkillName(ability)}</Button>)}
  </div>
 </section>;
}
