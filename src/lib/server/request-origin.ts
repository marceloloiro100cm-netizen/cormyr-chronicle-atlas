/**
 * Same-origin check for Firebase API routes behind Firebase App Hosting.
 *
 * Behind App Hosting the server can see an internal URL in request.url
 * (internal host or http scheme), so comparing the browser Origin with
 * new URL(request.url).origin rejects every legitimate request with 403.
 * Accepted origins: request.url, the proxy-forwarded host/scheme and the
 * public domains of this project. Cross-site browsers cannot forge these
 * headers without a CORS preflight, which these routes never answer, and
 * every route still requires its own Firebase ID token.
 */
export const CORMYR_PUBLIC_ORIGINS=Object.freeze([
  'https://atlas.cormyr.com.br',
  'https://cormyr-preview--cormyr.us-east4.hosted.app',
]);

const HOST=/^[a-z0-9.-]{1,253}(?::\d{1,5})?$/i;
const ORIGIN=/^https:\/\/[a-z0-9.-]{1,253}(?::\d{1,5})?$/i;
const first=(value:string|null)=>(value??'').split(',')[0]?.trim()??'';

export function allowedRequestOrigins(request:Request,
  env:Record<string,string|undefined>=process.env):Set<string>{
  const allowed=new Set<string>(CORMYR_PUBLIC_ORIGINS);
  try{allowed.add(new URL(request.url).origin);}catch{/* invalid URL */}
  const host=first(request.headers.get('x-forwarded-host'))||
    first(request.headers.get('host'));
  const proto=first(request.headers.get('x-forwarded-proto'));
  if(HOST.test(host)){
    allowed.add(`https://${host.toLowerCase()}`);
    if(proto==='http')allowed.add(`http://${host.toLowerCase()}`);
  }
  for(const extra of (env['CORMYR_PUBLIC_ORIGINS']??'').split(',')){
    const value=extra.trim();
    if(ORIGIN.test(value))allowed.add(value.toLowerCase());
  }
  return allowed;
}

/** True when the browser says the call came from another site. */
export function crossOriginRejected(request:Request,
  env:Record<string,string|undefined>=process.env):boolean{
  if(request.headers.get('sec-fetch-site')==='cross-site')return true;
  const origin=request.headers.get('origin');
  if(origin===null)return false;
  return !allowedRequestOrigins(request,env).has(origin.toLowerCase());
}
