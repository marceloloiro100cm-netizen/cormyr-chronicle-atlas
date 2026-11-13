/** Synthetic, non-sensitive fixture for unit tests and rules integration. */
const row=(id,edition,state,options={})=>({
  id,edition_no:String(edition),
  campaign_date:options.date||'1522-01-01',
  title:'Private edition title',subtitle:'Article subtitle',
  template:'classico',font_style:options.font||'classico',state,
  blocks:JSON.stringify([{kind:'text',text:options.text||'Private story'}]),
  pdf_path:null,version:'1',publication_revision:'0',
  created_at:'2026-11-13 00:00:00+00',updated_at:null,
  published_at:state==='published'?'2026-11-13 01:00:00+00':null,
  publish_on:options.publishOn??null,
});
const tab=(table,rows,columns)=>({
  table,rows,columns:columns||Object.keys(rows[0]||{id:''}),
});
const extra=[
  'campaign_newspaper_revisions','campaign_newspaper_reads',
  'campaign_newspaper_commissions','campaign_newspaper_staff',
  'campaign_newspaper_story_models','campaign_newspaper_engravings',
];

export function syntheticNewspaperSource(){
  const editions=[
    row('published-id',1,'published',{text:'Visible published content'}),
    row('draft-id',2,'draft',{text:'Private draft content',publishOn:'1524-F-shieldmeet',font:'gotica'}),
    row('archived-id',3,'archived',{font:'romana'}),
    row('cancelled-id',4,'cancelled'),
  ];
  return [
    tab('public.campaign_newspapers',editions),
    ...extra.map(name=>tab('public.'+name,[],['id','private_value'])),
    tab('public.campaign_newspaper_settings',[{
      id:'t',title:'A Folha Sem Selo',subtitle:'Jornal do reino',
      template:'gazeta',font_style:'romana',
    }]),
  ];
}
