type BattleSaveScope='adapted'|'got'|'dnd'|'v3';
const copy:Readonly<Record<BattleSaveScope,Readonly<{title:string;detail:string}>>>={
 adapted:{title:'Conta do Narrador',detail:'Use Salvar batalha durante o combate. O servidor precisa estar disponível.'},
 got:{title:'Este navegador',detail:'Use Salvar batalha. Cópias locais não são sincronizadas entre aparelhos.'},
 dnd:{title:'Conta do Narrador · privado',detail:'Use Salvar batalha. Retomada exige autenticação.'},
 v3:{title:'Arquivo local',detail:'Exporte o replay para continuar por importação neste ou em outro dispositivo.'},
};
/** Mesmo aviso de continuidade em cada sistema, sem alterar a persistência. */
export function BattleSaveScope({system}:{system:BattleSaveScope}){
 const info=copy[system];
 return <p className="battle-save-scope" role="note">
  <strong>{info.title}</strong><span>{info.detail}</span>
 </p>;
}
