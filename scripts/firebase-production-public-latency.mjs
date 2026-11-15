/**
 * Tiny anonymous public API latency probe from GitHub Actions, not a Cloud
 * load test. Exactly 9 GETs, no tokens, no cookies, no response body output.
 * Metrics are geographically specific to the runner and never authorize cutover.
 */
import {pathToFileURL} from 'node:url';

export const PUBLIC_ORIGIN='https://atlas.cormyr.com.br';
export const PUBLIC_LATENCY_ENDPOINTS=Object.freeze([
  {name:'time',path:'/api/public/time'},
  {name:'catalog',path:'/api/public/catalog'},
  {name:'translations',path:'/api/public/translations?locale=en'},
]);
export const PUBLIC_LATENCY_REPEATS=3;
const percentile=(numbers,p)=>{
  if(!numbers.length)return null;
  const sorted=[...numbers].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
};

export async function measurePublicFirebaseLatency({
  fetcher=fetch,clock=()=>performance.now(),
}={}){
  const checks=[];
  for(const endpoint of PUBLIC_LATENCY_ENDPOINTS){
    const url=new URL(endpoint.path,PUBLIC_ORIGIN).href;
    for(let attempt=1;attempt<=PUBLIC_LATENCY_REPEATS;attempt++){
      const start=clock();
      try{
        const response=await fetcher(url,{
          method:'GET',credentials:'omit',redirect:'manual',cache:'no-store',
          headers:{Accept:'application/json'},signal:AbortSignal.timeout(12_000),
        });
        const durationMs=Math.max(0,Math.round(clock()-start));
        const json=(response.headers.get('content-type')||'').toLowerCase()
          .startsWith('application/json');
        // Never read or print campaign response bodies.
        try{await response.body?.cancel();}catch{}
        checks.push({
          name:endpoint.name,attempt,status:response.status,
          durationMs,passed:response.status===200&&json,
        });
      }catch{
        checks.push({
          name:endpoint.name,attempt,status:null,
          durationMs:null,passed:false,
        });
      }
    }
  }
  const successfulDurations=checks.filter(c=>c.passed).map(c=>c.durationMs);
  return {
    scope:'ANONYMOUS_PUBLIC_API_SHORT_LATENCY_PROBE',
    origin:PUBLIC_ORIGIN,
    requestCount:checks.length,
    expectedRequestCount:PUBLIC_LATENCY_ENDPOINTS.length*PUBLIC_LATENCY_REPEATS,
    publicRoutesResponding:checks.every(c=>c.passed),
    p50Ms:percentile(successfulDurations,0.50),
    p95Ms:percentile(successfulDurations,0.95),
    measuredFrom:'GitHub Actions runner; not a player location',
    cloudLoadTestPassed:false,
    realAuthenticatedPerformanceVerified:false,
    readyForCutover:false,
    productionWrites:0,
    checks,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await measurePublicFirebaseLatency();
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.publicRoutesResponding)process.exitCode=1;
}
