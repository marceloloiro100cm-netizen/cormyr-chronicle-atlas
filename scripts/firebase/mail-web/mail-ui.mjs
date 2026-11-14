// Browser-only local preview. No Supabase, remote SDK, cookie or persisted token.
const $=id=>document.getElementById(id);
let token=null,session=null,busy=false,epoch=0,expires=null;
let cursors=[null],nextCursor=null,selected=null;
let pendingKey=null,pendingFingerprint=null;
const stateNames={draft:'Rascunho',scheduled:'Programada',delivered:'Entregue'};
const errors={
  login_failed:'Não foi possível entrar. Confira os dados da conta de teste.',
  access_denied:'Acesso negado ou revogado. Entre novamente com uma conta autorizada.',
  authentication_required:'Sua sessão terminou. Entre novamente.',
  invalid_request:'Confira os campos e a data de Harptos.',
  conflict:'A versão mudou ou a rodada está fechada. Atualize a caixa antes de continuar.',
  not_found:'Esta missiva não está disponível para sua conta.',
  body_too_large:'O texto excede o tamanho permitido.',
};
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function option(value,label){const el=node('option',label);el.value=value;return el;}
function notice(message=''){$('notice').textContent=message;}
function reset(){
  epoch++;token=null;session=null;selected=null;cursors=[null];nextCursor=null;
  pendingKey=null;pendingFingerprint=null;clearTimeout(expires);
  $('workspace').hidden=true;$('identity').hidden=true;$('login-panel').hidden=false;
  $('letters').replaceChildren();$('thread').replaceChildren();$('composer').hidden=true;
  $('compose-form').reset();$('login-form').reset();$('filters').reset();
  $('role').textContent='';$('round-status').textContent='';$('page-label').textContent='';
  $('origin-house').replaceChildren();$('recipient').replaceChildren();
}
async function api(action,body={}){
  const generation=epoch;
  const response=await fetch('/api/firebase-mail/'+action,{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
  });
  const result=await response.json();
  if(generation!==epoch)throw Error('Sessão encerrada.');
  if(!response.ok){
    if([401,403].includes(response.status)&&action!=='login')reset();
    throw Error(errors[result.error]||'Não foi possível concluir. Tente novamente.');
  }
  return result.data;
}
async function run(task){
  if(busy)return;busy=true;notice();
  const disabled=[...document.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]);
  disabled.forEach(([el])=>{el.disabled=true;});
  try{await task();}catch(e){notice(e instanceof Error&&e.name!=='TypeError'&&e.name!=='TimeoutError'?e.message:'Conexão interrompida. Tente novamente; o envio usa proteção contra duplicação.');}
  finally{
    disabled.forEach(([el,was])=>{if(el.isConnected)el.disabled=was;});
    busy=false;syncControls();
  }
}
function syncControls(){
  if(!session)return;
  $('new-letter').disabled=!session.initialized||!session.canCompose;
  $('previous').disabled=cursors.length===1;$('next').disabled=!nextCursor;
  $('initialize').hidden=session.role!=='narrador'||session.initialized;
  $('round-action').hidden=session.role!=='narrador'||!session.initialized;
  $('round-action').textContent=session.openRound===null?`Abrir rodada ${(session.lastRound??0)+1}`:`Encerrar rodada ${session.openRound}`;
}
function applySession(value){
  session=value;
  $('role').textContent=value.role==='narrador'?'Narrador':'Jogador';
  $('round-status').textContent=!value.initialized?'Correspondência de teste aguardando preparação.':value.openRound===null?'Rodada fechada · Rascunhos disponíveis':`Rodada ${value.openRound} aberta · Ambiente de teste`;
  const previous=$('origin-house').value;
  $('origin-label').hidden=value.role==='narrador';
  $('origin-house').replaceChildren(...value.originHouses.map(h=>option(h.id,h.name)));
  if(value.originHouses.some(h=>h.id===previous))$('origin-house').value=previous;
  $('recipient').replaceChildren(option('','Selecione um destinatário'),
    ...(value.role==='jogador'?[option('narrator','Narrador')]:[]),
    ...value.recipientHouses.map(h=>option('h:'+h.id,h.name)));
  syncControls();
}
const houseName=id=>session?.recipientHouses.find(h=>h.id===id)?.name||null;
function recipientName(letter){return letter.recipientKind==='narrator'?'Narrador':houseName(letter.recipientHouseId)||'Destinatário individual';}
function metadata(letter){return [letter.senderName||'Remetente histórico',
  'Para: '+recipientName(letter),letter.campaignDate?'Harptos: '+letter.campaignDate:'Data de campanha não registrada',
  stateNames[letter.publicationState]||'',letter.deliveryRound?'Rodada '+letter.deliveryRound:null].filter(Boolean).join(' · ');}
async function loadList(){
  $('letters').replaceChildren();selected=null;
  $('thread').replaceChildren(node('p','Selecione uma missiva para ler a conversa.','empty'));
  if(!session.initialized){$('letters').append(node('p','O Narrador precisa preparar a correspondência de teste.','empty'));return;}
  const data=await api('list',{folder:$('folder').value,source:$('source').value,
    query:$('query').value,pageSize:12,cursor:cursors.at(-1)});
  nextCursor=data.nextCursor;
  if(!data.items.length)$('letters').append(node('p','Nenhuma missiva nesta seleção.','empty'));
  for(const letter of data.items){
    const card=node('button',undefined,'letter-card');card.type='button';card.dataset.letterId=letter.id;card.setAttribute('aria-pressed','false');
    card.append(node('strong',letter.subject||'Sem assunto'),node('span',metadata(letter)),
      node('span',(letter.source==='imported'?'Histórico importado':'Nova missiva')+' · '+(letter.readAt?'Lida':letter.senderIsViewer?'Enviada por você':'Não lida')));
    card.addEventListener('click',()=>run(()=>openThread(letter.id)));
    $('letters').append(card);
  }
  $('page-label').textContent=`Página ${cursors.length}`;
}
async function refresh(){
  // Remove old private content before checking current permissions again.
  $('thread').replaceChildren();$('letters').replaceChildren();
  applySession(await api('session'));cursors=[null];nextCursor=null;await loadList();
}
function requestKey(payload){
  const fingerprint=JSON.stringify(payload);
  if(fingerprint!==pendingFingerprint){pendingFingerprint=fingerprint;pendingKey=crypto.randomUUID();}
  return pendingKey;
}
function labeled(text,tag,id,value=''){
  const label=node('label',text),input=node(tag);input.id=id;input.value=value;input.required=true;
  if(tag==='textarea'){input.rows=5;input.maxLength=100000;}
  label.append(input);return {label,input};
}
async function openThread(id){
  $('thread').replaceChildren();selected=null;
  const data=await api('thread',{letterId:id});
  if(!data.letter.senderIsViewer&&data.letter.publicationState==='delivered'){
    await api('read',{letterId:id});data.letter.readAt=new Date().toISOString();
  }
  selected=data.letter;
  document.querySelectorAll('.letter-card').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.letterId===id)));
  const panel=$('thread'),letter=data.letter;
  panel.append(node('span',letter.source==='imported'?'ACERVO HISTÓRICO':'CORRESPONDÊNCIA NOVA','badge'),
    node('h2',letter.subject||'Sem assunto'),node('p',metadata(letter),'meta'),node('p',letter.content,'message-body'));
  if(letter.readAt)panel.append(node('p','Leitura registrada para sua conta.','meta'));
  for(const reply of data.replies){
    const block=node('article',undefined,'reply');
    block.append(node('h3',reply.authorName||'Resposta'),node('p',stateNames[reply.publicationState]||'','meta'),node('p',reply.content,'message-body'));panel.append(block);
  }
  if(letter.source==='runtime'&&letter.senderIsViewer&&letter.publicationState==='draft'){
    const form=node('form');form.id='edit-form';
    const subject=labeled('Assunto do rascunho','input','edit-subject',letter.subject);
    subject.input.maxLength=180;
    const content=labeled('Texto do rascunho','textarea','edit-content',letter.content);
    const save=node('button','Salvar alterações');save.type='submit';
    form.append(subject.label,content.label,save);
    form.addEventListener('submit',e=>{e.preventDefault();run(async()=>{
      await api('edit-draft',{id:letter.id,version:letter.version,subject:subject.input.value,content:content.input.value});
      await openThread(letter.id);notice('Rascunho atualizado.');
    });});
    const publish=node('button','Enviar rascunho','quiet');publish.type='button';
    publish.addEventListener('click',()=>run(async()=>{
      if(subject.input.value!==letter.subject||content.input.value!==letter.content){notice('Salve as alterações antes de enviar.');return;}
      const result=await api('schedule-draft',{id:letter.id,version:letter.version});
      await refresh();await openThread(letter.id);notice(result.state==='delivered'?'Missiva entregue.':'Missiva programada para a próxima rodada.');
    }));form.append(publish);panel.append(form);
  }
  if(!letter.senderIsViewer&&letter.publicationState==='delivered'){
    const form=node('form');form.id='reply-form';form.append(node('h3','Responder'));
    const date=labeled('Data da resposta (Harptos)','input','reply-date');date.input.placeholder='1522-01-01';
    const content=labeled('Sua resposta','textarea','reply-content');
    const send=node('button','Enviar resposta');send.type='submit';
    form.append(date.label,content.label,send);
    form.addEventListener('submit',e=>{e.preventDefault();run(async()=>{
      const payload={letterId:id,content:content.input.value,campaignDate:date.input.value};
      const result=await api('reply',{...payload,requestKey:requestKey({action:'reply',...payload})});
      pendingFingerprint=null;pendingKey=null;await openThread(id);
      notice(result.state==='scheduled'?'Resposta programada para a próxima rodada.':'Resposta entregue.');
    });});panel.append(form);
  }
  panel.setAttribute('tabindex','-1');panel.focus({preventScroll:true});
}
$('login-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const result=await api('login',{email:$('email').value,password:$('password').value});
  $('password').value='';token=result.idToken;applySession(result.session);
  $('login-panel').hidden=true;$('workspace').hidden=false;$('identity').hidden=false;
  expires=setTimeout(()=>{reset();notice('Sessão expirada. Entre novamente.');},Math.max(1,Math.min(result.expiresIn||3600,3600)-30)*1000);
  await loadList();
});});
$('logout').addEventListener('click',()=>{reset();notice('Sessão encerrada.');});
$('refresh').addEventListener('click',()=>run(refresh));
$('filters').addEventListener('submit',e=>{e.preventDefault();run(async()=>{cursors=[null];nextCursor=null;await loadList();});});
$('next').addEventListener('click',()=>run(async()=>{if(nextCursor){cursors.push(nextCursor);await loadList();}}));
$('previous').addEventListener('click',()=>run(async()=>{if(cursors.length>1){cursors.pop();await loadList();}}));
$('initialize').addEventListener('click',()=>run(async()=>{await api('initialize');await refresh();notice('Correspondência de teste preparada.');}));
$('round-action').addEventListener('click',()=>run(async()=>{
  await api(session.openRound===null?'open-round':'close-round',{number:session.openRound??session.lastRound+1});
  await refresh();notice('Rodada de teste atualizada.');
}));
$('new-letter').addEventListener('click',()=>{$('composer').hidden=false;$('subject').focus();});
$('cancel-compose').addEventListener('click',()=>{$('composer').hidden=true;});
$('compose-form').addEventListener('submit',e=>{
  e.preventDefault();const asDraft=e.submitter?.value==='draft';
  run(async()=>{
    const payload={originHouseId:session.role==='narrador'?null:$('origin-house').value,
      recipients:[$('recipient').value],subject:$('subject').value,content:$('content').value,
      campaignDate:$('compose-date').value,asDraft};
    const result=await api('send',{...payload,requestKey:requestKey({action:'send',...payload})});
    pendingFingerprint=null;pendingKey=null;$('compose-form').reset();$('composer').hidden=true;
    await refresh();await openThread(result.ids[0]);
    notice(result.state==='draft'?'Rascunho salvo.':result.state==='scheduled'?'Missiva programada para a próxima rodada.':'Missiva entregue.');
  });
});
window.addEventListener('pagehide',reset);
