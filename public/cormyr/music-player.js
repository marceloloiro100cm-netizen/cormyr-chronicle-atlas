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
 function stop(){
  sequence++;
  if(activePlayer){try{activePlayer.destroy();}catch{/* old player already gone */}activePlayer=null;}
  container.replaceChildren();
  panel.hidden=true;lyrics.hidden=true;lyrics.textContent='';
  source.hidden=true;source.removeAttribute('href');message('');
 }
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
 function createFrame(video){
  const frame=document.createElement('iframe');
  const params=new URLSearchParams({
   enablejsapi:'1',origin:window.location.origin,playsinline:'1',rel:'0'
  });
  frame.src='https://www.youtube-nocookie.com/embed/'+video.id+'?'+params.toString();
  frame.title='Bardo da Corte: '+title.textContent;
  frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen=true;
  frame.loading='eager';
  return frame;
 }
 close.addEventListener('click',stop);
 window.addEventListener('pagehide',stop);
 document.addEventListener('click',async event=>{
  const button=event.target?.closest?.('button[data-bard-preview]');
  if(!button)return;
  window.CORMYR_CLOSE_PLAYLIST?.();
  event.preventDefault();
  const video=youtube.parse(button.dataset.bardPreview);
  if(!video)return;
  stop();const request=sequence;
  const linked=button.closest('.music-actions')?.querySelector('a.music-button[href]');
  title.textContent=button.dataset.bardTitle||linked?.querySelector('span:nth-child(2)')?.childNodes[0]?.textContent?.trim()||'Música de Cormyr';
  source.href=video.watchUrl;source.hidden=false;
  panel.hidden=false;
  message('Carregando o reprodutor do YouTube…');
  try{
   const YT=await loadApi();
   if(request!==sequence)return;
   const frame=createFrame(video);
   container.replaceChildren(frame);
   activePlayer=new YT.Player(frame,{
    events:{
     onReady:()=>{if(request===sequence)message('Player pronto. Toque em reproduzir no vídeo.');},
     onError:e=>{if(request===sequence)message((messages[e.data]||'Falha desconhecida no reprodutor do YouTube.')+' Use “Abrir no YouTube”.');},
     onAutoplayBlocked:()=>{if(request===sequence)message('Reprodução automática bloqueada. Toque em reproduzir no vídeo.');},
     onStateChange:e=>{
      if(request!==sequence)return;
      if(e.data===1)message('Reproduzindo pelo YouTube.');
      else if(e.data===2)message('Reprodução pausada.');
      else if(e.data===0)message('Música finalizada.');
     }
    }
   });
  }catch(error){
   if(request===sequence){container.replaceChildren();message('Não foi possível iniciar o reprodutor. Use “Abrir no YouTube”.');}
  }
 });
})();
