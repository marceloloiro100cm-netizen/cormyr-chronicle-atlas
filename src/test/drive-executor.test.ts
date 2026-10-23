import {it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import type {Database} from '@/integrations/supabase/types';
import {runDriveSync} from '@/lib/drive-executor.server';
import type {DriveAdapter} from '@/lib/drive-sync';
it('does not consult or write the provider when no mapping is authorized',async()=>{
 const db=createClient<Database>('http://fixture.invalid','fixture',{auth:{persistSession:false},global:{fetch:async()=>Response.json([])}});
 const adapter:DriveAdapter={list:vi.fn(),read:vi.fn(),write:vi.fn()};
 const result=await runDriveSync(db,adapter);expect(result.synced).toBe(0);expect(adapter.list).not.toHaveBeenCalled();expect(adapter.write).not.toHaveBeenCalled();
});
