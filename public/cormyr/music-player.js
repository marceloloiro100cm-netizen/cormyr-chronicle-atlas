'use strict';
/** Persistent one-at-a-time music player. Only user clicks create an iframe. */
(function(){
 const player=document.getElementById('bard-player');
 const container=document.getElementById('bard-player-media');
 const title=document.getElementById('bard-title');
 const source=document.getElementById('bard-open-source');
 const close=document.getElementById('bard-close');
 const lyrics=document.getElementById('bard-lyrics');
 if(!player||!container||!title||!source||!close||!lyrics)return;
 function media(url){
  try{
   const parsed=new URL(url);
   const host=parsed.hostname.toLowerCase();
   if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)){
    const id=parsed.searchParams.get('v');
    if(id&&/^[A-Za-z0-9_-]{11}$/.test(id))return 'https://www.youtube-nocookie.com/embed/'+id;
   }
   if(host==='youtu.be'){
    const id=parsed.pathname.slice(1);
    if(/^[A-Za-z0-9_-]{11}$/.test(id))return 'https://www.youtube-nocookie.com/embed/'+id;
   }
   // Google Drive /preview is not a reliable embedded video player:
   // MP4, MP3 and MPEG files may fail due to cookies, codecs or viewer restrictions.
   // Direct Drive links must open in a fresh tab instead of being intercepted.
   if(host==='drive.google.com')return null;
  }catch{/* invalid URL never becomes an iframe */}
  return null;
 }
 function stop(){container.replaceChildren();player.hidden=true;lyrics.hidden=true;lyrics.textContent='';}
 close.addEventListener('click',stop);
 document.addEventListener('click',event=>{
  const link=event.target.closest('a.music-button[href]');
  if(!link)return;
  const url=link.href,embed=media(url);
  if(!embed){
   // For Drive (and unsupported media), preserve target="_blank" and the original source URL.
   // Stop any previous embedded video so two unrelated tracks never play simultaneously.
   if(new URL(url).hostname==='drive.google.com')stop();
   return;
  }
  event.preventDefault();
  stop();
  const track=(window.CORMYR_DATA?.soundtrack||[]).find(t=>t.url===url);
  title.textContent=track?.title||link.querySelector('span:nth-child(2)')?.childNodes[0]?.textContent?.trim()||'Música de Cormyr';
  source.href=url;source.hidden=false;
  if(track?.lyrics){lyrics.textContent=track.lyrics;lyrics.hidden=false;}
  const frame=document.createElement('iframe');frame.src=embed;frame.title='Reprodução solicitada: '+title.textContent;
  frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.allow='encrypted-media; picture-in-picture';frame.allowFullscreen=true;
  container.append(frame);player.hidden=false;
 });
})();
