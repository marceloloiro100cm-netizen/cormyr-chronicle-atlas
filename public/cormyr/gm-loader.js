// Loads narrator-only content (Eventos, Aventuras) from the authenticated
// server before starting app.js. Visitors and players receive nothing.
(function(){
  const start=()=>{const s=document.createElement('script');s.src='app.js';document.body.appendChild(s);};
  let tok=null;
  try{const raw=localStorage.getItem('sb-qkdznngbkwodsbpkpoax-auth-token');tok=raw&&JSON.parse(raw).access_token;}catch(e){}
  if(!tok){start();return;}
  fetch('/api/public/gm-content',{headers:{Authorization:'Bearer '+tok},cache:'no-store'})
    .then(r=>r.ok?r.json():null)
    .then(c=>{if(c&&window.CORMYR_DATA){window.CORMYR_DATA.events=c.events||[];window.CORMYR_DATA.adventures=c.adventures||[];}})
    .catch(()=>{})
    .finally(start);
})();
