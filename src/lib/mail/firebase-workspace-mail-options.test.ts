import {describe,it,expect} from 'vitest';
import {projectWorkspaceMailOptions,type WorkspaceMailTables} from './firebase-workspace-mail';

const fixture=():WorkspaceMailTables=>({
  campaign_players:[
    {id:'p1',user_id:'u1',name:'Player One',roster_house_id:'h1',
      active:true,require_password_change:false},
    {id:'p2',user_id:'u2',name:'Player Two',roster_house_id:'h2',
      active:true,require_password_change:false},
  ],
  campaign_houses:[{id:'h1',name:'Primeira Casa'},
    {id:'h2',name:'Segunda Casa'}],
  house_memberships:[{player_id:'p1',house_id:'h1'},
    {player_id:'p2',house_id:'h2'}],
  campaign_letters:[
    {id:'visible',sender_user_id:'u2',sender_player_id:'p2',
      sender_name:'Remetente',subject:'Visível',content:'Carta para H1',
      recipient_player_id:null,recipient_house_id:'h1',
      origin_house_id:'h2',court_member_id:'court-one',
      military_unit_id:'unit-one',letter_number:4,delivery_week:4,
      created_at:'2026-11-18T10:00:00Z',publication_state:'delivered'},
    {id:'hidden',sender_user_id:'u2',sender_player_id:'p2',
      sender_name:'Remetente',subject:'PRIVADO',content:'SEGREDO',
      recipient_player_id:null,recipient_house_id:'h2',
      origin_house_id:'h2',court_member_id:'court-private',
      military_unit_id:'unit-private',letter_number:9,delivery_week:9,
      created_at:'2026-11-18T10:00:00Z',publication_state:'delivered'},
  ],
  letter_replies:[],letter_receipts:[],
  letter_rounds:[{number:4,status:'open'}],
});
const player={uid:'u1',profile:'jogador' as const,playerId:'p1',
  memberHouseIds:['h1']};
const narrator={uid:'narrator',profile:'narrador' as const,
  playerId:null,memberHouseIds:[]};

describe('real Firebase mail filters follow original viewer ACL',()=>{
  it('never includes hidden letters, weeks or cross-House court IDs',()=>{
    const result=projectWorkspaceMailOptions(fixture(),player);
    expect(result.readOnly).toBe(true);
    expect(result.weeks).toEqual([4]);
    expect(result.courts.map(v=>v.id)).toEqual(['h2:court-one']);
    expect(result.units.map(v=>v.id)).toEqual(['h2:unit-one']);
    expect(JSON.stringify(result)).not.toContain('court-private');
    expect(JSON.stringify(result)).not.toContain('unit-private');
    expect(JSON.stringify(result)).not.toContain('PRIVADO');
  });
  it('narrator can see both histories without contents; an editor with a player identity is forbidden',()=>{
    const full=projectWorkspaceMailOptions(fixture(),narrator);
    expect(full.weeks).toEqual([9,4]);
    expect(new Set(full.courts.map(v=>v.id))).toEqual(
      new Set(['h2:court-one','h2:court-private']));
    expect(JSON.stringify(full)).not.toContain('SEGREDO');
    expect(()=>projectWorkspaceMailOptions(fixture(),{
      uid:'editor',profile:'editor' as unknown as 'jogador',
      playerId:'p1',memberHouseIds:[],
    })).toThrow();
  });
});
