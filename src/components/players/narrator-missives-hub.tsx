import {MissivasTab} from './missivas-tab';
import type {Panel} from './panel-data';

/** The Narrator's main menu. Mail management is deliberately independent of
 * the currently selected player house and precedes the global calendar. */
export const NARRATOR_MENU=[
  ['painel','Conselho das casas'],
  ['missivas','Missivas'],
  ['calendario','Calendário'],
  ['eventos','Eventos'],
  ['aventuras','Aventuras'],
] as const;

export function NarratorMissivasHub({
  data,me,onSave,onError,onManage,
}:{
  data:Panel;
  me:Panel['players'][number]|undefined;
  onSave:()=>void;
  onError:(message:string)=>void;
  onManage:(houseId:string)=>void;
}){
  const all=data.letters.filter(letter=>!letter.deleted_at);
  const total=all.length;
  const scheduled=all.filter(letter=>letter.publication_state==='scheduled').length;
  const drafts=all.filter(letter=>letter.publication_state==='draft').length;
  const openRound=data.rounds
    .filter(round=>round.status==='open')
    .sort((a,b)=>b.number-a.number)[0]?.number??null;
  return <section className="narrator-mail-hub" aria-label="Central de missivas do Narrador">
    <header className="narrator-mail-hub-heading">
      <p className="campaign-eyebrow">NARRADOR · CORRESPONDÊNCIA</p>
      <h2>Central de missivas</h2>
      <p>Gerencie a correspondência de todas as casas em um só lugar: escreva, programe entregas, consulte respostas e acompanhe as rodadas.</p>
    </header>
    <div className="narrator-mail-hub-overview" aria-label="Resumo de missivas">
      <div><strong>{total}</strong><span>Entregas cadastradas</span></div>
      <div><strong>{scheduled}</strong><span>Programadas</span></div>
      <div><strong>{drafts}</strong><span>Rascunhos</span></div>
      <div><strong>{openRound===null?'Fechada':openRound}</strong><span>Rodada atual</span></div>
    </div>
    <MissivasTab data={data} me={me} onSave={onSave} onError={onError} onManage={onManage}/>
  </section>;
}
