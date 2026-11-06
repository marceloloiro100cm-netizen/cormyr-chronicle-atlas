'use strict';
/** The music catalogue uses YouTube exclusively; no external file-hosting fallback. */
(function(){
 const data=window.CORMYR_DATA,yt=window.CORMYR_YOUTUBE;
 if(!data||!yt)return;
 function normalize(songs){
  if(!Array.isArray(songs))return;
  for(const song of songs){
   const parsed=yt.parse(song?.url);
   if(parsed){song.url=parsed.watchUrl;song.videoId=parsed.id;}
   else if(song){song.url='';song.linkStatus='youtube-invalid';}
  }
 }
 normalize(data.kingdomMusic);
 for(const region of data.regions||[]){
  normalize(region.music);
  for(const house of region.houses||[])normalize(house.music);
 }
 // No YouTube video was mapped to these titles in the original catalogue.
 // Preserve their titles as pending entries instead of inventing links.
 const pending=[
  ['O Nó de Sangue — A Balada da Escota Vermelha','Mareforte','casa'],
  ['A Força Vem do Povo','Yellander','casa'],
  ['A Milonga das Vozes que Ficam','Mistwind / Yellander','casa'],
  ['Essa Coroa','Crownlands','cancioneiro'],
  ['Vou-me Embora pra Sossal','Stonelands','cancioneiro'],
  ['Música dos Dragões Azuis','Crownlands','cancioneiro']
 ];
 const lyrics=[
  ['A Balada Libertina do Guardião de Helm','Helmlands','Na noite fria e escura o cavaleiro seguia\\nHorrores e agruras ele nada conhecia'],
  ['Badalos Elementais','Veilstone','Badalando nas colinas no vale eu vou\\nMeu rumo eu vou seguir'],
  ['Cante uma Canção a Elturel','Horselands','Cante uma canção a Elturel\\nDe água, bosques e colinas']
 ];
 data.soundtrack=[
  ...pending.map(([title,region,category],i)=>({id:'pending-'+i,title,region,category,url:'',linkStatus:'youtube-pending'})),
  ...lyrics.map(([title,region,lyrics],i)=>({id:'lyrics-'+i,title,category:'cancioneiro',region,lyrics:lyrics.replace(/\\n/g,'\n'),url:''}))
 ];
})();
