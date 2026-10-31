'use strict';
(function(){
 const b=document.getElementById('parchment-toggle');if(!b)return;
 const set=value=>{document.body.classList.toggle('parchment-reading',value);b.setAttribute('aria-pressed',String(value));};
 b.addEventListener('click',()=>set(!document.body.classList.contains('parchment-reading')));
 // Only the user decides the reading mode, and it does not alter campaign data.
})();
