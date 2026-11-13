/** Public synthetic fixture: NO campaign identities or data. */
const BCRYPT='$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
const t=(table,rows,columns=Object.keys(rows[0]||{id:''}))=>({table,rows,columns});
const temporalNames=[
  'campaign_calendar_audit','campaign_time_operations',
  'campaign_temporal_consumers','campaign_temporal_deliveries',
  'campaign_temporal_delivery_resolutions',
  'campaign_temporal_effect_checkpoints',
];
const newspaperNames=[
  'campaign_newspapers','campaign_newspaper_revisions',
  'campaign_newspaper_reads','campaign_newspaper_commissions',
  'campaign_newspaper_staff','campaign_newspaper_story_models',
  'campaign_newspaper_engravings','campaign_newspaper_settings',
];
export function syntheticSource(){
  const users=[
    {id:'narrator',email:'narrator@example.invalid',encrypted_password:BCRYPT},
    {id:'player',email:'player@example.invalid',encrypted_password:BCRYPT},
  ];
  const tables=[
    t('auth.users',users),
    t('auth.identities',[],['id','user_id','provider','provider_id']),
    t('public.user_roles',[{id:'admin-role',user_id:'narrator',role:'admin'}]),
    t('public.campaign_access_profiles',[
      {user_id:'narrator',profile:'narrador',active:'t'},
      {user_id:'player',profile:'jogador',active:'t'},
    ]),
    t('public.campaign_houses',[
      {id:'house-a',name:'Casa A',castle:null,crest:null,season:'2',active:'t'},
    ]),
    t('public.campaign_players',[{
      id:'player-a',user_id:'player',name:'Jogador',
      active:'t',require_password_change:'f',roster_house_id:'house-a',
    }]),
    t('public.house_memberships',[{
      player_id:'player-a',house_id:'house-a',
      can_edit:'t',can_edit_attributes:'f',
    }]),
    t('public.campaign_letters',[],[
      'id','sender_user_id','recipient_player_id','recipient_house_id',
      'subject','content','created_at',
    ]),
    t('public.campaign_calendar',[{
      id:'t',year:'1522',month:'0',day:'1',festival:null,
      auto_advance:'t',version:'1',last_round:null,
    }]),
    ...temporalNames.map(x=>t('public.'+x,[],['id'])),
    ...newspaperNames.map(x=>t('public.'+x,[],['id'])),
  ];
  return tables;
}

