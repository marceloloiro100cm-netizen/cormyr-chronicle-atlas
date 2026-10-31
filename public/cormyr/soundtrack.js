'use strict';
// Cormyr soundtrack documented in Pacote de Implementação Front-End (2026-10).
// Media may require Google Drive sharing permissions; links are never made public here.
(function(){
 const data=window.CORMYR_DATA;if(!data)return;
 const tracks=[
  ['O Trono do Dragão','regiao','Crownlands','1F62FBJ4H9ZoqRJr-MbcYTUJK_9o6IcTh'],
  ['Horselands — As Pradarias do Norte','regiao','Horselands','1TcCHKhDFH66iZ52b6oM8o1clJ3snXmzp'],
  ['Dragon Coast — Costa do Dragão','regiao','Dragon Coast','1DIh3i6oN_bkYW2QxAox8_SHlpwsGR7Hy'],
  ['Shieldmark — A Marca do Escudo','regiao','Shieldmark','1RVlE6IZV9Jke1dgpULq6DJI3ef1arpjF'],
  ['Helmlands — Terras de Helm','regiao','Helmlands','1H5wZwNgEJm4vLxhPkOSQBobfiJ5Au6QU'],
  ['Elfhold — A Floresta de Hullack','regiao','Elfhold','1fy92gssHulZRAHTQOHMoRkGo9d1u4cTQ'],
  ['Stonelands — As Terras Petras','regiao','Stonelands','1FRuVZ-P-0RjW5f5GjGlGq4PlQLaNLCxM'],
  ['Veilstone — Os Picos das Storm Horns','regiao','Veilstone','1pb4yrsY-FPFhf7jQo4ZUZySTHIsMMvak'],
  ['Casa Erdenor — We Grow','casa','Erdenor','173tYv3n2M4A7LnQ4Sj9NLR7LQ4pkmiv-'],
  ['Casa Silversky — O Peso do Cobre','casa','Silversky','1LXeOoHd4Hw4Jx085XIRWK6r5KHKh3qX2'],
  ['Casa Fewmerry','casa','Fewmerry','1NQ-0mjsBZ6A2bL2RuYul4qe_pCpgrVTL'],
  ['Casa Grantass','casa','Grantass','1-ojD7XbCb3Q6kjVf9oMbm8-y0dHUJRKy'],
  ['Casa Goldfin','casa','Goldfin','1z3dLnKwqCOvDQHQ7kOh3Ry40NFLIkC85'],
  ['Casa Ashkar','casa','Ashkar','1eI-7st4mgKhotiD3vVYN7nUV7LIcEZt1'],
  ['O Nó de Sangue — A Balada da Escota Vermelha','casa','Mareforte','1OjyQDxfoXssih2PzlHIUKv9LoSFp2z6_'],
  ['A Força Vem do Povo','casa','Yellander','1Ym4ev2PlmqwT4JxkKNDt2iNIY5TLhOVq'],
  ['A Milonga das Vozes que Ficam','casa','Mistwind / Yellander','1V41VSi9UYYYmudIcVCGtdGlBoKiKBli2'],
  ['Essa Coroa','cancioneiro','Crownlands','1rvZCesm7DyMUyTxa-X_a1JwxzB6XV2Zy'],
  ['Vou-me Embora pra Sossal','cancioneiro','Stonelands','1RZ8AQsrXsmPyZbs8CSHNSuiZjrQ0ANot'],
  ['Música dos Dragões Azuis','cancioneiro','Crownlands','15H2HIEnkXGaC500zB7Cu4oia0Vb3eNlU']
 ];
 const lyrics=[
  ['A Balada Libertina do Guardião de Helm','Helmlands','Na noite fria e escura o cavaleiro seguia\nHorrores e agruras ele nada conhecia'],
  ['Badalos Elementais','Veilstone','Badalando nas colinas no vale eu vou\nMeu rumo eu vou seguir'],
  ['Cante uma Canção a Elturel','Horselands','Cante uma canção a Elturel\nDe água, bosques e colinas']
 ];
 // The public catalogue already has per-song video IDs in the requested playlist.
 // Reuse only exact region/house entries. Do not guess a video ID for other songs.
 const PLAYLIST='PLNkPwXjMDaCw';
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const sources=new Map();
 function register(kind,name,songs){
  if(!Array.isArray(songs)||songs.length!==1)return;
  const song=songs[0];if(!song?.url)return;
  try{
   const url=new URL(song.url);
   if(!['www.youtube.com','youtube.com','m.youtube.com'].includes(url.hostname))return;
   if(!/^[\w-]{11}$/.test(url.searchParams.get('v')||''))return;
   if(url.searchParams.get('list')!==PLAYLIST)return;
   sources.set(kind+'|'+norm(name),song);
  }catch{/* Unrecognized links are not assigned by approximation. */}
 }
 register('regiao','Crownlands',data.kingdomMusic);
 for(const region of data.regions||[]){
  register('regiao',region.name,region.music);
  for(const house of region.houses||[])register('casa',house.name,house.music);
 }
 data.soundtrack=[
  ...tracks.map(([title,category,region,driveId],i)=>{
   const driveUrl='https://drive.google.com/file/d/'+driveId+'/view';
   const original=sources.get(category+'|'+norm(region));
   // Attach an explicit recording fallback to the existing regional/house song.
   if(original){original.driveUrl=driveUrl;original.driveTitle=title;}
   return {
    id:'track-'+i,title,category,region,driveId,driveUrl,
    youtubeUrl:original?.url||null,
    url:original?.url||driveUrl,
    linkStatus:original?'catalogued-playlist-video':'drive-only'
   };
  }),
  ...lyrics.map(([title,region,lyrics],i)=>({id:'lyrics-'+i,title,category:'cancioneiro',region,lyrics,url:''}))
 ];
})();
