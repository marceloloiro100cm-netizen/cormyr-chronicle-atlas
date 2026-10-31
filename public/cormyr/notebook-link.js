'use strict';
(function(){
 const button=document.getElementById('copy-notebook-link');
 const status=document.getElementById('notebook-link-status');
 const link=document.querySelector('#view-notebook-lm a.notebook-link[href^="https://notebook.google.com/notebook/"]');
 if(!button||!status||!link)return;
 button.addEventListener('click',async()=>{
  try{
   await navigator.clipboard.writeText(link.href);
   status.textContent='Link copiado.';
  }catch{
   status.textContent='Não foi possível copiar automaticamente. Use o menu de contexto do link.';
  }
 });
})();
