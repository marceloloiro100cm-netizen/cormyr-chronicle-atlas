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
 // Links received from the Narrator on 06/11/2026. Preserve pending songs where no video ID was supplied.
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
 // The Cancioneiro is independent of regional themes. Each video is mapped
 // to its exact YouTube video ID rather than to a playlist position.
 const directVideos={
  'A Balada Libertina do Guardião de Helm':'https://www.youtube.com/watch?v=4RuKLjM1QcU',
  'Essa Coroa':'https://www.youtube.com/watch?v=HM4a9vYrdDU',
  'Cante uma Canção a Elturel':'https://www.youtube.com/watch?v=xoOtYuebA9k',
  'Terra dos Cavalos':'https://www.youtube.com/watch?v=f4L0mCHpOv8',
  'Nova música de Cormyr':'https://www.youtube.com/watch?v=wioZhfoQMAs',
  'Nova música de Cormyr — WrXc5zCbMHA':'https://www.youtube.com/watch?v=WrXc5zCbMHA'
 };
 function attachVideo(song){
  const parsed=yt.parse(directVideos[song.title]||'');
  if(parsed){song.url=parsed.watchUrl;song.videoId=parsed.id;delete song.linkStatus;}
  return song;
 }
 data.soundtrack=[
  ...pending.map(([title,region,category],i)=>attachVideo({
   id:'pending-'+i,title,region,category,url:'',linkStatus:'youtube-pending'
  })),
  ...lyrics.map(([title,region,lyrics],i)=>attachVideo({
   id:'lyrics-'+i,title,category:'cancioneiro',region,
   lyrics:lyrics.replace(/\\n/g,'\n'),url:''
  })),
  attachVideo({id:'cancioneiro-terra-dos-cavalos',title:'Terra dos Cavalos',
   category:'cancioneiro',region:'Horselands',url:''}),
  // Title not confirmed by YouTube metadata; keep this entry distinct until verified.
  attachVideo({id:'youtube-wioZhfoQMAs',title:'Nova música de Cormyr',
   category:'playlist',region:'Cormyr',url:''}),
  // Título provisório até confirmação de metadados oficiais do vídeo.
  attachVideo({id:'youtube-WrXc5zCbMHA',title:'Nova música de Cormyr — WrXc5zCbMHA',
   category:'playlist',region:'Cormyr',url:''})
 ];
})();
