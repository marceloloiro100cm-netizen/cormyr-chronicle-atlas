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
  ['Essa Coroa','Crownlands','populares'],
  ['Vou-me Embora pra Sossal','Stonelands','populares'],
  ['Música dos Dragões Azuis','Crownlands','populares']
 ];
 const lyrics=[
  ['A Balada Libertina do Guardião de Helm','Helmlands','Na noite fria e escura o cavaleiro seguia\\nHorrores e agruras ele nada conhecia'],
  ['Badalos Elementais','Veilstone','Badalando nas colinas no vale eu vou\\nMeu rumo eu vou seguir'],
  ['Cante uma Canção a Elturel','Horselands','Cante uma canção a Elturel\\nDe água, bosques e colinas']
 ];
 // Músicas Populares reúne canções de bardos independentemente dos temas regionais. Cada vídeo é mapeado
 // to its exact YouTube video ID rather than to a playlist position.
 const directVideos={
  'A Balada Libertina do Guardião de Helm':'https://www.youtube.com/watch?v=4RuKLjM1QcU',
  'Essa Coroa':'https://www.youtube.com/watch?v=HM4a9vYrdDU',
  'Vou-me Embora pra Sossal':'https://www.youtube.com/watch?v=b34LSA3yDak',
  'Cante uma Canção a Elturel':'https://www.youtube.com/watch?v=xoOtYuebA9k',
  'Terra dos Cavalos':'https://www.youtube.com/watch?v=f4L0mCHpOv8',
  'Nova música de Cormyr':'https://www.youtube.com/watch?v=wioZhfoQMAs',
  'Nova música de Cormyr — WrXc5zCbMHA':'https://www.youtube.com/watch?v=WrXc5zCbMHA',
  'Nova música de Cormyr — qw9FgNYr7hE':'https://www.youtube.com/watch?v=qw9FgNYr7hE',
  'O Truta':'https://www.youtube.com/watch?v=a5DitnxYUZM',
  'Nova música de Cormyr — uPYfE1gKDcg':'https://www.youtube.com/watch?v=uPYfE1gKDcg'
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
   id:'lyrics-'+i,title,category:'populares',region,
   lyrics:lyrics.replace(/\\n/g,'\n'),url:''
  })),
  attachVideo({id:'cancioneiro-terra-dos-cavalos',title:'Terra dos Cavalos',
   category:'populares',region:'Horselands',url:''}),
  // Title not confirmed by YouTube metadata; keep this entry distinct until verified.
  attachVideo({id:'youtube-wioZhfoQMAs',title:'Nova música de Cormyr',
   category:'populares',region:'Cormyr',url:''}),
  // Título provisório até confirmação de metadados oficiais do vídeo.
  attachVideo({id:'youtube-WrXc5zCbMHA',title:'Nova música de Cormyr — WrXc5zCbMHA',
   category:'populares',region:'Cormyr',url:''}),
  // Título temporário, sem presumir uma identidade que o YouTube não confirmou.
  attachVideo({id:'youtube-qw9FgNYr7hE',title:'Nova música de Cormyr — qw9FgNYr7hE',
   category:'populares',region:'Cormyr',url:''}),
  // Título confirmado pelo Narrador; registrar como música popular, sem associação à fé de Adlar.
  attachVideo({id:'o-truta',title:'O Truta',
   category:'populares',region:'Cormyr',url:''}),
  // Título provisório: não atribuir um título oficial sem confirmação da fonte.
  attachVideo({id:'youtube-uPYfE1gKDcg',title:'Nova música de Cormyr — uPYfE1gKDcg',
   category:'populares',region:'Cormyr',url:''})
 ];
})();
