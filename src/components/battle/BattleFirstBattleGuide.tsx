import {useState} from 'react';
import {Button} from '@/components/ui/button';
import type {BattleRulesetMode} from '@/lib/battle/ruleset-modes';
import './battle-p2.css';

export const BATTLE_FIRST_GUIDE_KEY='cormyr-first-battle-v4-';
const INSTRUCTIONS:Record<BattleRulesetMode,readonly {title:string;body:string}[]>={
 adapted:[
  {title:'Escolha o confronto',body:'Use forças-modelo. O posicionamento pode ser automático.'},
  {title:'Movimente e ataque',body:'Toque no quadrado verde para mover ou no inimigo destacado para atacar.'},
  {title:'Confira o resultado',body:'Conclua os turnos; exporte o replay ou salve na conta quando disponível.'},
 ],
 got:[
  {title:'Prepare a guerra',body:'Escolha as tropas e inicie com um cenário rápido.'},
  {title:'Siga as fases do livro',body:'Use a indicação Agora para cerco, heróis e ordens. O motor resolve os testes.'},
  {title:'Registre a batalha',body:'Salve uma cópia neste navegador; nenhuma ficha oficial é alterada.'},
 ],
 dnd:[
  {title:'Escolha monstros',body:'Selecione atacante ou defensor, procure a criatura e informe a quantidade.'},
  {title:'Comece a batalha',body:'As pilhas entram automaticamente no mapa. Mova e ataque pelo d20 simplificado.'},
  {title:'Continue depois',body:'Use Salvar batalha e retome na conta privada do Narrador.'},
 ],
};
function alreadySeen(mode:BattleRulesetMode):boolean{
 try{return typeof window!=='undefined'&&window.localStorage.getItem(BATTLE_FIRST_GUIDE_KEY+mode)==='done';}
 catch{return false;}
}
/** Ajuda contextual de primeiro uso. Não dispara ações no motor nem exige conta. */
export function BattleFirstBattleGuide({mode}:{mode:BattleRulesetMode}){
 const [visible,setVisible]=useState(()=>!alreadySeen(mode));
 const [step,setStep]=useState(0);
 const pages=INSTRUCTIONS[mode];
 const complete=()=>{
  try{window.localStorage.setItem(BATTLE_FIRST_GUIDE_KEY+mode,'done');}catch{}
  setVisible(false);setStep(0);
 };
 if(!visible)return <Button type="button" variant="outline" size="sm"
  onClick={()=>{setStep(0);setVisible(true);}}>Como jogar</Button>;
 return <section className="battle-first-guide" aria-label="Tutorial da primeira batalha">
  <div className="battle-first-guide-head">
   <strong>Primeira batalha · {step+1}/{pages.length}</strong>
   <Button type="button" size="sm" variant="ghost" onClick={complete}>Pular</Button>
  </div>
  <h3>{pages[step]!.title}</h3>
  <p>{pages[step]!.body}</p>
  <div className="battle-first-guide-foot">
   {step>0&&<Button type="button" size="sm" variant="outline"
    onClick={()=>setStep(s=>s-1)}>Voltar</Button>}
   <Button type="button" size="sm" onClick={()=>{
    if(step+1>=pages.length)complete();
    else setStep(s=>s+1);
   }}>{step+1>=pages.length?'Entendi':'Próximo'}</Button>
  </div>
 </section>;
}
