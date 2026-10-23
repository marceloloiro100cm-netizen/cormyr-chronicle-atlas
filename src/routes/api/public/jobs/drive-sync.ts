import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route=createFileRoute('/api/public/jobs/drive-sync')({server:{handlers:{POST:async({request})=>{
  const failure=await authenticateCronRequest(request);if(failure)return failure;
  const body:unknown=await request.json();
  if(!body||typeof body!=='object'||!('kind' in body)||body.kind!=='reconcile')return new Response('Invalid request',{status:400});
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {runDriveSync}=await import('@/lib/drive-executor.server');
  return Response.json(await runDriveSync(supabaseAdmin),{headers:{'Cache-Control':'no-store'}});
}}}});