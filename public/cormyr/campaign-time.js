/* Atlas estático: somente leitura de /api/public/time, sem JWT e sem dados privados. */
'use strict';
(function(){
 const current=document.getElementById('public-campaign-current-time');
 if(!current)return;
 let lastVersion=-1;
 const FALLBACK='Calendário oficial indisponível';
 function render(data){
  if(!data||typeof data!=='object'||!Number.isInteger(data.version)||data.version<0||
     typeof data.period!=='string'||typeof data.label!=='string'||
     !/^\d{4}-(?:\d{2}-\d{2}|F-[a-z-]+)$/.test(data.date||''))throw Error('Resposta temporal inválida');
  if(data.version<lastVersion)return; // Resposta atrasada nunca rebaixa o painel.
  lastVersion=data.version;
  current.textContent=data.period;
  current.dataset.version=String(data.version);
 }
 async function sync(){
  try{
   const response=await fetch('/api/public/time',{method:'GET',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Data indisponível');
   const body=await response.json();
   render(body);
  }catch{
   // Nunca inventar 1522 nem exibir um dado persistido indefinidamente.
   current.textContent=FALLBACK;
   delete current.dataset.version;
   lastVersion=-1;
  }
 }
 void sync();
 const interval=setInterval(()=>{if(!document.hidden)void sync();},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync();});
 window.addEventListener('focus',()=>{if(!document.hidden)void sync();});
 window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
})();
