/**
 * Presentation-only readiness signals for the Firebase pilot.
 * Do not use this client-side helper to authorize writes or cutover.
 * Each label describes only what the current browser session observed.
 */
export type FirebasePilotProfile='jogador'|'editor'|'narrador';
export type FirebasePilotSignalStatus='conferido'|'pendente'|'nao-aplicavel';
export type FirebasePilotSignal={
  key:'session'|'isolation'|'house'|'calendar'|'mail';
  label:string;
  status:FirebasePilotSignalStatus;
  detail:string;
};
export type FirebasePilotSignalInput={
  profile:FirebasePilotProfile;
  sessionConfirmed:boolean;
  snapshotReconciliationPending:boolean;
  roleSelfTestPassed:boolean;
  houseLoaded:boolean;
  calendarLoaded:boolean;
  mailboxLoaded:boolean;
  mailCanSend:boolean;
};

/** A green signal does not establish Cloud-wide or cross-user release readiness. */
export function describeFirebasePilotSignals(input:FirebasePilotSignalInput):{
  signals:FirebasePilotSignal[];
  readyForPlayers:false;
  readyForCutover:false;
}{
  const flag=(key:FirebasePilotSignal['key'],label:string,
    confirmed:boolean,passDetail:string,pendingDetail:string):FirebasePilotSignal=>({
    key,label,status:confirmed?'conferido':'pendente',
    detail:confirmed?passDetail:pendingDetail,
  });
  const signals:FirebasePilotSignal[]=[
    flag('session','Sessão Firebase',input.sessionConfirmed,
      'Perfil consultado no servidor nesta sessão.',
      'É necessário autenticar e validar a conta no servidor.'),
    flag('isolation','Isolamento de perfis',input.roleSelfTestPassed,
      'A verificação desta conta passou; outras contas ainda requerem testes.',
      'Execute o teste de permissões desta conta.'),
  ];
  if(input.profile==='editor'){
    signals.push({key:'house',label:'Ficha da Casa',status:'nao-aplicavel',
      detail:'O perfil editorial não tem permissão para consultar fichas privadas.'});
    signals.push({key:'calendar',label:'Calendário reservado',
      status:'nao-aplicavel',
      detail:'O perfil editorial não consulta o calendário privado.'});
    signals.push({key:'mail',label:'Missivas',status:'nao-aplicavel',
      detail:'O correio privado não é disponibilizado ao Editor.'});
  }else{
    signals.push(flag('house','Ficha de Casa',input.houseLoaded,
      'Uma ficha autorizada foi consultada nesta sessão.',
      'Selecione uma Casa permitida e aguarde a leitura da ficha.'));
    signals.push(flag('calendar','Calendário',input.calendarLoaded,
      'Calendário consultado nesta sessão (somente leitura).',
      'Calendário não consultado ou indisponível.'));
    signals.push(flag('mail','Missivas',
      input.mailboxLoaded&&input.mailCanSend,
      'Caixa consultada e API de envio habilitada; entrega ainda depende de aceite real.',
      'Leitura da caixa ou envio de missivas indisponível.'));
  }
  // Historical migration snapshots are not live-reconciled operational state.
  // Even when every individual signal is green, never advertise public GO.
  if(input.snapshotReconciliationPending)
    signals.push({key:'session',label:'Reconciliação do snapshot',
      status:'pendente',detail:'O acervo histórico não foi homologado como estado operacional.'});
  return {signals,readyForPlayers:false,readyForCutover:false};
}
