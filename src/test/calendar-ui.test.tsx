import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {CampaignCalendar} from '@/components/calendar/calendar';
const rpc=vi.hoisted(()=>vi.fn(async(name:string)=>name==='get_campaign_calendar'?{data:{year:1522,month:0,day:11,festival:null,auto_advance:true,version:1},error:null}:{data:[{id:'one',date:'1522-01-02',title:'Convocação da corte',kind:'mail'}],error:null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>rpc(args[0] as string)}}));
afterEach(cleanup);
it('shows daily events on hover, focus and touch, keeping narrator controls private',async()=>{
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CampaignCalendar/></QueryClientProvider>);
 const day=await screen.findByRole('button',{name:/2 de Hammer.*1 evento/});
 fireEvent.mouseEnter(day);expect(screen.getByText('Convocação da corte')).toBeInTheDocument();
 fireEvent.focus(screen.getByRole('button',{name:/3 de Hammer/}));expect(screen.queryByText('Convocação da corte')).not.toBeInTheDocument();
 fireEvent.click(day);expect(screen.getByText('Convocação da corte')).toBeInTheDocument();
 expect(screen.queryByText('Ajustar calendário da campanha')).not.toBeInTheDocument();
 await waitFor(()=>expect(screen.getByRole('button',{name:/11 de Hammer/})).toHaveAttribute('aria-current','date'));
});
