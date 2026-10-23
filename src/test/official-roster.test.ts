import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const url=process.env['SUPABASE_URL'],key=process.env['SUPABASE_SERVICE_ROLE_KEY'];
describe.skipIf(!url||!key)('Official second-season roster',()=>{
  function client(){
    if(!url||!key)throw new Error('Test connection missing');
    return createClient<Database>(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>{const h=new Headers(init?.headers);if(key.startsWith('sb_')&&h.get('Authorization')===`Bearer ${key}`)h.delete('Authorization');h.set('apikey',key);return fetch(input,{...init,headers:h});}}});
  }
  it('stores exactly the eight official players, houses and lord names',async()=>{
    const {data,error}=await client().from('campaign_players').select('name,roster_house_id,lord_name').not('roster_source','is',null).order('name');
    expect(error).toBeNull();
    expect(data).toEqual([
      {name:'Carlos Castellan',roster_house_id:'hardcourt',lord_name:'Genevieve Hardcourt'},
      {name:'Cla Vasconcellos',roster_house_id:'erdenor',lord_name:'Aldaeric Erdenor'},
      {name:'Douglas Tondo',roster_house_id:'everlost',lord_name:null},
      {name:'Gabriel Chiomento',roster_house_id:'grantass',lord_name:'Rowena Grantass'},
      {name:'Isaías Weber',roster_house_id:'silverky',lord_name:'Ashladd Silversky'},
      {name:'Marcelo Belem',roster_house_id:'ashkar',lord_name:'Kael Ashkar'},
      {name:'Otávio Moraes',roster_house_id:'goldfin',lord_name:'Hektor Goldfin'},
      {name:'Theo Wasem',roster_house_id:'fewmerry',lord_name:'Bassu Fewmerry'},
    ]);
    const houses=await client().from('campaign_houses').select('name').eq('active',true).eq('season',2).order('name');
    expect(houses.data?.map(h=>h.name)).toEqual(['Ashkar','Erdenor','Everlost','Fewmerry','Goldfin','Grantass','Hardcourt','Silverky']);
  });
  it('keeps Everlost lord null and leaves uncertain archive matches unlinked',async()=>{
    const {data,error}=await client().from('campaign_houses').select('*').in('id',['silverky','hardcourt','everlost']);expect(error).toBeNull();
    expect(data?.find(h=>h.id==='everlost')?.lord_name).toBeNull();
    for(const id of ['silverky','hardcourt']){const house=data?.find(h=>h.id===id);expect(house).toBeDefined();expect(house?.archive_house_id).toBeNull();expect(house?.crest).toBeNull();expect(house?.folder_id).toBeTruthy();expect(house?.castle).toBeNull();expect(house?.review_note).toBeTruthy();}
  });
  it('links each official player to exactly the account and house authorized by the admin',async()=>{
    const db=client();const players=await db.from('campaign_players').select('id,user_id,roster_house_id').not('roster_source','is',null);expect(players.error).toBeNull();expect(players.data).toHaveLength(8);expect(players.data?.every(p=>p.user_id!==null)).toBe(true);
    const links=await db.from('house_memberships').select('player_id,house_id').in('player_id',(players.data??[]).map(p=>p.id));expect(links.error).toBeNull();expect(links.data).toHaveLength(8);
    for(const p of players.data??[]){const own=(links.data??[]).filter(l=>l.player_id===p.id);expect(own).toHaveLength(1);expect(own[0]?.house_id).toBe(p.roster_house_id);}
  });
  it('attaches castles and archive assets only for the six exact house matches',async()=>{
    const {data,error}=await client().from('campaign_houses').select('id,castle,archive_house_id,crest').in('id',['erdenor','everlost','fewmerry','goldfin','grantass','ashkar']);expect(error).toBeNull();expect(data).toHaveLength(6);
    const expected:Record<string,string|null>={erdenor:'Goldenbull tower',everlost:null,fewmerry:'Torre Alta das Bandeiras e Salão Giratório',goldfin:'The Nightfall',grantass:'Torre sem Escadas',ashkar:'Cinzaria'};
    for(const house of data??[]){expect(house.archive_house_id).toBe(house.id);expect(house.castle).toBe(expected[house.id]);expect(house.crest).toMatch(/^\/cormyr\/assets\//);}
  });
});