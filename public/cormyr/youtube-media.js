'use strict';
/** YouTube-only URL validation shared by the public catalogue and player. */
(function(root){
 const ID=/^[A-Za-z0-9_-]{11}$/;
 const VIDEO_HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com']);
 function parse(input){
  if(typeof input!=='string')return null;
  try{
   const url=new URL(input);
   if(url.protocol!=='https:'||url.username||url.password)return null;
   const host=url.hostname.toLowerCase();
   let id=null;
   if(host==='youtu.be'){
    const parts=url.pathname.split('/').filter(Boolean);
    if(parts.length===1)id=parts[0];
   }else if(VIDEO_HOSTS.has(host)){
    const parts=url.pathname.split('/').filter(Boolean);
    if(parts.length===1&&parts[0]==='watch')id=url.searchParams.get('v');
    else if(parts.length===2&&['shorts','live','embed'].includes(parts[0]))id=parts[1];
   }
   if(!id||!ID.test(id))return null;
   return {id,watchUrl:'https://www.youtube.com/watch?v='+id};
  }catch{return null;}
 }
 root.CORMYR_YOUTUBE=Object.freeze({parse});
})(window);
