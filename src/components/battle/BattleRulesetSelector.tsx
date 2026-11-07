import type {BattleRulesetMode} from '@/lib/battle/ruleset-modes';
import {BATTLE_RULESET_OPTIONS,battleRulesetOption} from '@/lib/battle/ruleset-modes';

/** Escolha declarativa de regras; nenhum motor, replay ou ficha é convertido ao selecionar. */
export function BattleRulesetSelector({value,onChange}:{
 value:BattleRulesetMode;onChange:(value:BattleRulesetMode)=>void;
}){
 const selected=battleRulesetOption(value);
 return <fieldset className="battle-ruleset-selector" aria-label="Sistema de regras da batalha">
  <legend>Escolha o sistema de batalha</legend>
  <p className="battle-ruleset-intro">Os sistemas são independentes. A escolha não converte
   batalhas anteriores nem modifica as fichas oficiais.</p>
  <div className="battle-ruleset-grid">
   {BATTLE_RULESET_OPTIONS.map(option=><label key={option.id}
    className={'battle-ruleset-card'+(value===option.id?' is-selected':'')}>
    <span className="battle-ruleset-head">
     <input type="radio" name="battle-ruleset" value={option.id}
      checked={value===option.id} onChange={()=>onChange(option.id)}/>
     <strong>{option.label}</strong>
    </span>
    <span className="battle-ruleset-subtitle">{option.shortName}</span>
    <span className="battle-ruleset-description">{option.description}</span>
    <span className="battle-ruleset-status">
     {option.status==='available'?'Disponível · sistema atual':option.status==='partial'?
      'Núcleo jogável · cobertura do livro em desenvolvimento':'Em desenvolvimento · próximo lote'}
    </span>
   </label>)}
  </div>
  <p role="status" aria-live="polite" className="battle-note">
   {selected.status==='available'?
    'Modo Adaptado selecionado: a preparação e os motores atuais permanecem disponíveis.':
    selected.status==='partial'?
     'Game of Thrones selecionado: motor independente disponível para testes; regras avançadas pendentes. Não será substituído pelo Adaptado.':
     selected.label+' selecionado para configuração. Este modo ainda não executa combates; não será substituído pelo Adaptado.'}
  </p>
 </fieldset>;
}
