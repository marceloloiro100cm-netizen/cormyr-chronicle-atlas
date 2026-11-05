import {Button} from '@/components/ui/button';
import {commander,type CommanderId} from '@/lib/battle/v3/commanders';
import {v3CommanderLevel,v3CommanderTalents,V3_COMMANDER_LEVEL_XP,
 type V3CommanderProgress,type V3TalentId} from '@/lib/battle/v3/commander-progression';

export function BattleV3CommanderHall({id,progress,onChoose}:{
 id:CommanderId;progress:V3CommanderProgress;onChoose:(talent:V3TalentId)=>void;
}){
 const level=v3CommanderLevel(progress.xp);
 const unspent=level-1-progress.selectedTalents.length;
 const next=V3_COMMANDER_LEVEL_XP[level];
 return <section className="crusade-commander-hall" aria-label={'Treinamento '+commander(id).name}>
  <h4>Academia de comando · Nível {level}</h4>
  <p className="battle-note">XP de simulação: <strong>{progress.xp}</strong>
   {next!==undefined?' / '+next+' para o próximo nível':' · Patente máxima'} · Pontos livres: {unspent}
  </p>
  <div className="crusade-talent-grid">
   {v3CommanderTalents(id).map(t=>{
    const learned=progress.selectedTalents.includes(t.id);
    const canBuy=!learned&&level>=t.minLevel&&unspent>0;
    return <article key={t.id} className={'crusade-talent'+(learned?' learned':'')}>
     <strong>{t.name}</strong>
     <small>Nível {t.minLevel}{learned?' · Aprendido':''}</small>
     <p>{t.description}</p>
     <Button size="sm" variant="outline" disabled={!canBuy}
      onClick={()=>onChoose(t.id)}>
      {learned?'Adquirido':canBuy?'Aprender talento':'Bloqueado'}
     </Button>
    </article>;
   })}
  </div>
 </section>;
}
