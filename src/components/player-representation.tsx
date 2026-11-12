import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {dateKey} from '@/lib/calendar/harptos';
import {datedMail} from '@/lib/calendar/mail';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {CampaignContent} from '@/components/campaign-content';
import {NobleHouseHub} from '@/components/house/hub';
import {HouseIdentity} from '@/components/players/house-identity';
import {heraldicHouseKey,type HeraldicHouse} from '@/lib/house/heraldry';
import {isNarrativeNpc} from '@/lib/house/narrative-npc';
import type {Database,Json} from '@/integrations/supabase/types';
type RecordRow=Database['public']['Tables']['campaign_records']['Row'];
type Letter=Database['public']['Tables']['campaign_letters']['Row'];
type Reply=Database['public']['Tables']['letter_replies']['Row'];
type Panel={player:{name:string;user_id:string|null};records:RecordRow[];letters:Letter[];replies:Reply[];houses:{id:string;name:string;region:string|null;crest:string|null;lord_name:string|null;castle:string|null}[];week:number|null};
export function PlayerRepresentation({onReturn,onHouseTheme}:{onReturn:()=>void;onHouseTheme?:(theme:HeraldicHouse|null)=>void}){
 const [panel,setPanel]=useState<Panel|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[representedHouse,setRepresentedHouse]=useState('');
 const replyAction=useRef<'draft'|'send'>('send');
 async function read(){const r=await supabase.rpc('campaign_representation_action',{p_action:'read',p_args:{}});if(r.error){setMessage(r.error.message);return;}setPanel(r.data as unknown as Panel);}
 useEffect(()=>{read();},[]);
 useEffect(()=>{
  const houses=panel?.houses??[];
  const selected=houses.find(h=>h.id===(representedHouse||houses[0]?.id));
  onHouseTheme?.(selected?heraldicHouseKey(selected.name):null);
 },[panel,representedHouse,onHouseTheme]);
 async function action(name:string,args:Json,campaignDate?:string){setBusy(true);try{const r=await (campaignDate?datedMail('representation',{p_action:name,p_args:args},campaignDate):supabase.rpc('campaign_representation_action',{p_action:name,p_args:args}));if(r.error)throw r.error;setMessage('Ação administrativa registrada.');await read();}catch(error){setMessage(error instanceof Error?error.message:'Não foi possível executar.');}finally{setBusy(false);}}
 return <section><div className="campaign-round sticky top-0 z-20" role="status"><strong>Representação administrativa · {panel?.player.name??'Carregando'}</strong><Button variant="outline" onClick={async()=>{const r=await supabase.rpc('stop_campaign_representation');if(r.error)setMessage(r.error.message);else onReturn();}}>Voltar ao narrador</Button></div><p role="status">{message}</p>{panel&&<><section className="house-panel"><h2>Ficha da Casa · Visão do jogador representado</h2><p>Prévia somente de leitura. Os controles administrativos não são exibidos nem executados.</p><div className="campaign-toolbar">{panel.houses.filter(h=>h.id===(representedHouse||panel.houses[0]?.id)).map(h=><HouseIdentity key={h.id} house={h}/>)}{panel.houses.length>1&&<select aria-label="Trocar casa representada" value={representedHouse||panel.houses[0]?.id||''} onChange={e=>setRepresentedHouse(e.target.value)}>{panel.houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select>}</div>{panel.houses.filter(h=>h.id===(representedHouse||panel.houses[0]?.id)).map(h=><NobleHouseHub key={h.id} representationMode house={h} canEdit={false} npcs={panel.records.filter(r=>r.house_id===h.id&&isNarrativeNpc(r)).map(r=>({id:r.id,title:r.title}))} courtMembers={panel.records.filter(r=>r.house_id===h.id&&isNarrativeNpc(r)).map(r=>({id:r.id,title:r.title}))} records={panel.records.filter(r=>r.house_id===h.id)}/>)}</section><h2>Missivas de {panel.player.name}</h2>{panel.letters.map(letter=><details className="campaign-letter" key={letter.id}><summary>Semana {letter.delivery_week} · {letter.subject} · {letter.publication_state==='scheduled'?'Aguardando abertura':'Entregue'}</summary><CampaignContent content={letter.content}/>{panel.replies.filter(r=>r.letter_id===letter.id&&!r.deleted_at).map(r=><div key={r.id}><strong>{r.author_name}</strong><CampaignContent content={r.content}/></div>)}<form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
 const draft=replyAction.current==='draft';replyAction.current='send';
 action('reply',{letter:letter.id,reply:String(f.get('reply')||'')||null,content:String(f.get('content')),key:crypto.randomUUID(),draft},String(f.get('campaign_date')));}}>
 <RepresentationDate/>
 <label>Responder a
 <select name="reply" aria-label={'Mensagem à qual responder em '+letter.subject}>
   <option value="">Missiva original</option>
   {panel.replies.filter(r=>r.letter_id===letter.id&&!r.deleted_at&&r.publication_state==='delivered'
      &&r.author_user_id!==panel.player.user_id&&r.recipient_user_id===panel.player.user_id)
     .map(r=><option key={r.id} value={r.id}>Resposta de {r.author_name} — {r.content.slice(0,80)}</option>)}
 </select></label>
 <label>Resposta<textarea name="content" required/></label>
 <div className="campaign-actions"><Button name="action" value="draft" variant="outline" disabled={busy} onClick={()=>{replyAction.current='draft';}}>Salvar rascunho como jogador</Button>
 <Button disabled={busy||panel.week===null} onClick={()=>{replyAction.current='send';}}>Responder como jogador</Button></div>
 </form></details>)}<h2>Nova missiva</h2><form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action((e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='draft'?'draft':'send',{subject:String(f.get('subject')),content:String(f.get('content')),house:String(f.get('house')),key:crypto.randomUUID()},String(f.get('campaign_date')));}}><RepresentationDate/><label>Casa destinatária<input name="house" placeholder="ID da casa ou vazio para Narrador"/></label><label>Assunto<input name="subject" required/></label><label>Texto<textarea name="content" required/></label><div className="campaign-actions"><Button variant="outline" name="action" value="draft" disabled={busy}>Salvar rascunho</Button><Button disabled={busy||panel.week===null}>Enviar como jogador</Button></div></form><h2>Documentos autorizados</h2>{panel.records.map(record=><details className="campaign-add" key={record.id}><summary>{record.title}</summary><CampaignContent content={record.content}/><form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action('save_record',{id:record.id,version:record.version,title:String(f.get('title')),content:String(f.get('content'))});}}><label>Título<input name="title" defaultValue={record.title} required/></label><label>Texto<textarea name="content" defaultValue={record.content} required/></label><Button disabled={busy}>Salvar como jogador</Button></form></details>)}</>}</section>;
}

function RepresentationDate(){const [date,setDate]=useState('');const {data:currentTime}=useCampaignTime();return <CampaignDatePicker value={date} referenceDate={currentTime?dateKey(currentTime):undefined} onChange={setDate}/>;}
