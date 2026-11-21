import {useState} from 'react';
import {ListMusic,Square} from 'lucide-react';
import './house-playlist-button.css';

/**
 * House themes confirmed in the public Cormyr music catalogue
 * (public/cormyr/data.js, regions[].houses[].music).
 * Do not substitute a regional theme when a House has no registered song.
 */
const HOUSE_TRACKS:Record<string,{title:string;youtubeId:string}>={
 'von der harten':{title:'Casa Von der Harten',youtubeId:'bR66gczzEdk'},
 goldfin:{title:'Casa Goldfin',youtubeId:'M5bnGEYw3SY'},
 ashkar:{title:'Casa Ashkar',youtubeId:'GwbNwjCPhJw'},
 fewmerry:{title:'Casa Fewmerry',youtubeId:'kfq0BeCse98'},
 grantass:{title:'Casa Grantass',youtubeId:'XukublArJU4'},
 erdenor:{title:'Casa Erdenor',youtubeId:'n7GFlxcM3m8'},
 silversky:{title:'Casa Silversky',youtubeId:'d3Eh9irxUZQ'},
};

export function findHouseTrack(houseName:string){
 const key=houseName.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .trim().replace(/^casa\s+/i,'').replace(/\s+/g,' ').toLowerCase();
 return HOUSE_TRACKS[key]??null;
}

/**
 * Nothing is loaded or played until the visitor clicks the House's button.
 * YouTube's loop parameter for a single video requires playlist=<videoId>.
 * Leaving the House (key change/unmount) destroys the iframe and stops audio.
 */
export function HousePlaylistButton({houseName}:{houseName:string}){
 const track=findHouseTrack(houseName);
 const [active,setActive]=useState(false);
 const watchUrl=track?'https://www.youtube.com/watch?v='+track.youtubeId:null;
 const embedUrl=track?'https://www.youtube-nocookie.com/embed/'+track.youtubeId+
  '?autoplay=1&loop=1&playlist='+track.youtubeId+'&playsinline=1&rel=0':null;
 const unavailable='Esta Casa ainda não possui música própria vinculada ao catálogo.';
 return <div className="campaign-house-playlist">
  <button type="button" className="campaign-house-playlist__trigger"
   disabled={!track} title={track?active?'Parar a música da Casa':'Ouvir a música da Casa em repetição':unavailable}
   aria-label={track?(active?'Parar música da Casa '+houseName:'Reproduzir música da Casa '+houseName+' em loop'):unavailable}
   aria-pressed={track?active:undefined} onClick={()=>setActive(value=>!value)}>
   {active?<Square size={14} aria-hidden="true"/>:<ListMusic size={16} aria-hidden="true"/>}
   <span>Play list</span>
   {active&&<span className="campaign-house-playlist__live" aria-hidden="true"/>}
  </button>
  {active&&track&&embedUrl&&<aside className="campaign-house-playlist__panel"
   aria-label={'Reprodutor da Casa '+houseName}>
   <div className="campaign-house-playlist__head">
    <strong>{track.title}</strong>
    <button type="button" onClick={()=>setActive(false)} aria-label="Parar e fechar a música">Fechar</button>
   </div>
   <iframe key={track.youtubeId} src={embedUrl}
    title={'Música em loop — '+track.title}
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    referrerPolicy="strict-origin-when-cross-origin"
    allowFullScreen/>
   <div className="campaign-house-playlist__foot">
    <span>Repetição contínua · YouTube</span>
    <a href={watchUrl??'#'} target="_blank" rel="noopener noreferrer">Abrir no YouTube</a>
   </div>
   <p className="campaign-house-playlist__hint">
    Se o navegador bloquear o início, toque em reproduzir no vídeo.
   </p>
  </aside>}
 </div>;
}
