type BattleSaveScope='adapted'|'got'|'dnd'|'v3';
const copy:Readonly<Record<BattleSaveScope,Readonly<{title:string;detail:string}>>>={
 adapted:{title:'Salvo na conta do Narrador',detail:'Replay verificado no servidor, quando disponível.'},
 got:{title:'Salvo neste navegador',detail:'As cópias locais não aparecem em outros dispositivos.'},
 dnd:{title:'Salvo na conta do Narrador',detail:'Partida privada, retomada após autenticação.'},
 v3:{title:'Salvo como arquivo',detail:'Exporte o replay e importe-o novamente ao continuar.'},
};
/** Mesmo aviso de continuidade em cada sistema, sem alterar a persistência. */
export function BattleSaveScope({system}:{system:BattleSaveScope}){
 const info=copy[system];
 return <p className="battle-save-scope" role="note">
  <strong>{info.title}</strong><span>{info.detail}</span>
 </p>;
}
