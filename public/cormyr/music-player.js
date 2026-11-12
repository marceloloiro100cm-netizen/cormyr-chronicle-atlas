'use strict';
/**
 * Bardo da Corte: one YouTube IFrame API player, created only after a click.
 * Player errors are reported rather than treated as a working video.
 */
(function(){
 const panel=document.getElementById('bard-player');
 const container=document.getElementById('bard-player-media');
 const title=document.getElementById('bard-title');
 const source=document.getElementById('bard-open-source');
 const close=document.getElementById('bard-close');
 const lyrics=document.getElementById('bard-lyrics');
 const status=document.getElementById('bard-status');
 const youtube=window.CORMYR_YOUTUBE;
 if(!panel||!container||!title||!source||!close||!lyrics||!status||!youtube)return;
 let activePlayer=null,sequence=0,apiPromise=null;
 const messages={
  2:'O YouTube rejeitou o identificador deste vídeo.',
  5:'O vídeo não pôde ser reproduzido neste navegador.',
  100:'O vídeo não foi encontrado; pode estar privado ou ter sido removido.',
  101:'O proprietário bloqueou a reprodução deste vídeo fora do YouTube.',
  150:'O proprietário bloqueou a reprodução deste vídeo fora do YouTube.',
  153:'O YouTube não reconheceu a identificação de origem do reprodutor. Abra o vídeo diretamente no YouTube.'
 };
 function message(value){status.textContent=value;}
 let stop=function(){
  sequence++;
  if(activePlayer){try{activePlayer.destroy();}catch{/* old player already gone */}activePlayer=null;}
  container.replaceChildren();
  panel.hidden=true;lyrics.hidden=true;lyrics.textContent='';
  source.hidden=true;source.removeAttribute('href');message('');
 };
 function loadApi(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(apiPromise)return apiPromise;
  apiPromise=new Promise((resolve,reject)=>{
   let settled=false;
   const previous=window.onYouTubeIframeAPIReady;
   const timer=window.setTimeout(()=>finish(new Error('Tempo limite para carregar a API do YouTube.')),12000);
   function finish(error){
    if(settled)return;
    settled=true;window.clearTimeout(timer);
    if(error)reject(error);else resolve(window.YT);
   }
   window.onYouTubeIframeAPIReady=function(){
    if(typeof previous==='function')try{previous();}catch{/* unrelated player */ }
    if(window.YT?.Player)finish(null);
    else finish(new Error('A API do YouTube respondeu sem um reprodutor.'));
   };
   const script=document.createElement('script');
   script.src='https://www.youtube.com/iframe_api';script.async=true;
   script.onerror=()=>finish(new Error('Não foi possível carregar a API do YouTube.'));
   document.head.append(script);
  }).catch(error=>{apiPromise=null;throw error;});
  return apiPromise;
 }
 function createFrame(video,autoplay){
  const frame=document.createElement('iframe');
  const params=new URLSearchParams({
   enablejsapi:'1',origin:window.location.origin,playsinline:'1',rel:'0'
  });
  if(autoplay)params.set('autoplay','1');
  if(video.playlistId)params.set('list',video.playlistId);
  frame.src='https://www.youtube-nocookie.com/embed/'+(video.playlistId?'videoseries':video.id)+'?'+params.toString();
  frame.title='Bardo da Corte: '+title.textContent;
  frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen=true;
  frame.loading='eager';
  return frame;
 }
 close.addEventListener('click',()=>stop());
 window.addEventListener('pagehide',()=>stop());
 let currentUrl='',currentState='stopped';
 function setState(value){
  currentState=value;
  try{if(typeof CustomEvent==='function')document.dispatchEvent(new CustomEvent('cormyr:bard-state',{detail:{state:value,url:currentUrl}}));}catch{/* listeners are optional */}
 }
 const baseStop=stop;
 stop=function(){baseStop();currentUrl='';setState('stopped');};
 async function open(video,label,url,autoplay){
  window.CORMYR_CLOSE_PLAYLIST?.();
  stop();const request=sequence;
  currentUrl=url||video.watchUrl;
  title.textContent=label||'Música de Cormyr';
  source.href=video.playlistId?currentUrl:video.watchUrl;source.hidden=false;
  panel.hidden=false;
  setState('loading');
  message('Carregando o reprodutor do YouTube…');
  try{
   const YT=await loadApi();
   if(request!==sequence)return;
   const frame=createFrame(video,autoplay);
   container.replaceChildren(frame);
   activePlayer=new YT.Player(frame,{
    events:{
     onReady:()=>{
      if(request!==sequence)return;
      if(autoplay){try{activePlayer.playVideo();}catch{/* player not ready */}message('Iniciando a reprodução…');}
      else message('Player pronto. Toque em reproduzir no vídeo.');
     },
     onError:e=>{if(request===sequence){message((messages[e.data]||'Falha desconhecida no reprodutor do YouTube.')+' Use “Abrir no YouTube”.');setState('error');}},
     onAutoplayBlocked:()=>{if(request===sequence){message('Reprodução automática bloqueada. Toque em reproduzir no vídeo.');setState('paused');}},
     onStateChange:e=>{
      if(request!==sequence)return;
      if(e.data===1){message('Reproduzindo pelo YouTube.');setState('playing');}
      else if(e.data===2){message('Reprodução pausada.');setState('paused');}
      else if(e.data===0){message('Música finalizada.');setState('ended');}
     }
    }
   });
  }catch(error){
   if(request===sequence){container.replaceChildren();message('Não foi possível iniciar o reprodutor. Use “Abrir no YouTube”.');setState('error');}
  }
 }
 window.CORMYR_BARD={
  state:()=>currentState,
  url:()=>currentUrl,
  stop,
  play(url,label){
   const video=youtube.parse(url);
   if(!video)return false;
   open(video,label,video.watchUrl,true);return true;
  },
  playPlaylist(playlistUrl,label){
   let id='';
   try{id=new URL(playlistUrl).searchParams.get('list')||'';}catch{id='';}
   if(!/^[A-Za-z0-9_-]{10,}$/.test(id))return false;
   open({playlistId:id,watchUrl:playlistUrl},label,playlistUrl,true);return true;
  },
  toggle(){
   if(!activePlayer)return false;
   try{
    if(currentState==='playing')activePlayer.pauseVideo();else activePlayer.playVideo();
    return true;
   }catch{return false;}
  }
 };
 document.addEventListener('click',event=>{
  const button=event.target?.closest?.('button[data-bard-preview]');
  if(!button)return;
  event.preventDefault();
  const video=youtube.parse(button.dataset.bardPreview);
  if(!video)return;
  const linked=button.closest('.music-actions')?.querySelector('a.music-button[href]');
  const label=button.dataset.bardTitle||linked?.querySelector('span:nth-child(2)')?.childNodes[0]?.textContent?.trim()||'Música de Cormyr';
  open(video,label,video.watchUrl,false);
 });
})();
