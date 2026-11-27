// Narrator-only material: the browser may supply a Firebase ID token
// via the future authenticated portal adapter. Legacy Supabase tokens are
// never extracted from localStorage or forwarded to Cloud endpoints.
(function(){
  const start=()=>{const s=document.createElement('script');s.src='app.js?v=20261127hist1';document.body.appendChild(s);};
  if(window.CORMYR_ARCHIVE_ONLY){start();return;}
  const provider=window.CORMYR_FIREBASE_ID_TOKEN_PROVIDER;
  if(typeof provider!=='function'){start();return;}
  Promise.resolve().then(()=>provider()).then(token=>{
    if(typeof token!=='string'||token.length<10||token.length>10000)return null;
    return fetch('/api/public/gm-content',{
      method:'GET',headers:{Authorization:'Bearer '+token},
      credentials:'omit',cache:'no-store',redirect:'error',
    }).then(r=>r.ok?r.json():null);
  }).then(c=>{
    if(c&&window.CORMYR_DATA&&Array.isArray(c.events)&&Array.isArray(c.adventures)){
      window.CORMYR_DATA.events=c.events;
      window.CORMYR_DATA.adventures=c.adventures;
    }
  }).catch(()=>{}).finally(start);
})();
