import {useQuery} from '@tanstack/react-query';
import {Eye,Shield,Target,ChartNoAxesCombined} from 'lucide-react';
import {readSpyMissionOddsBrowser} from '@/lib/espionage/spy-target-browser';
import {REGIONS} from '@/lib/house/regions';
import './spy-mission-odds-card.css';

type Props={
 houseId:string;agentId:string;targetHouseId:string;
 agentName:string;agentAvailable:boolean;simulation:boolean;
 destinationRegion:string;travelRounds:number|null;originRegion:string|null;
 includeReturn:boolean;returnRounds:number|null;
};

/** Graph is deliberately based only on the authenticated server's single-target
 * summary. Never fetch a rival's raw sheet or build a full-target odds catalogue.
 */
export function SpyMissionOddsCard(props:Props){
 const enabled=Boolean(props.agentId&&props.targetHouseId&&props.agentAvailable);
 const query=useQuery({
  queryKey:['spy-mission-odds',props.houseId,props.agentId,props.targetHouseId],
  queryFn:()=>readSpyMissionOddsBrowser({
   houseId:props.houseId,agentId:props.agentId,targetHouseId:props.targetHouseId,
  }),
  enabled,retry:false,staleTime:30_000,
 });
 if(!props.targetHouseId)return null;
 const data=query.data;
 const success=data?.successPercent??0;
 // A missão termina após a viagem de ida mais 1 désdia de investigação.
 // Retorno, quando solicitado, é exibido separadamente e não muda a chance.
 const missionRounds=props.travelRounds===null?null:props.travelRounds+1;
 const returnTotal=missionRounds!==null&&props.returnRounds!==null
  ?missionRounds+props.returnRounds:null;
 const accent=success>=65?'#138b72':success>=30?'#b98726':'#b65045';
 const regionName=REGIONS[props.destinationRegion]?.name??props.destinationRegion;
 const sourceLabel=data?.source==='operational_sheet'?'Ficha operacional atual'
  :data?.source==='official_spreadsheet'?'Planilha oficial das casas'
  :'Estimativa regional provisória';
 return <section className="house-ledger" aria-label="Prévia gráfica de risco da missão"
  style={{marginTop:14,padding:'18px',border:'1px solid rgba(149,161,182,.45)',borderRadius:16}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
   <div>
    <p className="campaign-eyebrow">INTELIGÊNCIA · PRÉVIA DE MISSÃO</p>
    <h4 style={{margin:'6px 0 4px'}}><Target size={19} style={{display:'inline-block',verticalAlign:'middle'}}/>{' '}
     {data?.houseName??'Casa nobre selecionada'}</h4>
    <p className="house-caption" style={{margin:0}}>{props.agentName} · {regionName}</p>
   </div>
   <span style={{borderRadius:999,padding:'5px 10px',fontSize:12,
    border:'1px solid rgba(149,161,182,.5)'}}>Simulação de planejamento</span>
  </div>
  <div className="spy-mission-key-metrics" aria-label="Tempo e chance da missão">
   <div className="spy-mission-key-metric">
    <small>Tempo para executar a missão</small>
    <strong>{missionRounds===null?'Rota pendente':
     missionRounds+' '+(missionRounds===1?'désdia':'désdias')}</strong>
    <span>{missionRounds===null?'Aguardando trajeto autorizado':
     missionRounds*10+' dias ordinários · '+props.travelRounds+' de viagem + 1 de investigação'}</span>
    {props.includeReturn&&<span>{returnTotal===null?
     'Retorno ainda sem rota calculada':
     'Com retorno: '+returnTotal+' désdias · '+returnTotal*10+' dias ordinários'}</span>}
   </div>
   <div className="spy-mission-key-metric">
    <small>Chance estimada de sucesso</small>
    <strong aria-live="polite">{!enabled?'Selecione um agente':
     query.isPending?'Calculando…':query.isError?'Indisponível':
     data?success.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'Indisponível'}</strong>
    <span>Astúcia do agente × dificuldade da Casa nobre</span>
   </div>
  </div>
  {!enabled&&<p role="status" style={{marginTop:12}}>
   Selecione um espião disponível para calcular a chance oficial da Casa.
  </p>}
  {enabled&&query.isPending&&<p role="status">Calculando a resistência oficial e a chance de sucesso…</p>}
  {enabled&&query.isError&&<p role="alert">A resistência desta Casa não pôde ser consultada.
   Confira o agente, a autorização e os dados da Casa-alvo.</p>}
  {data&&enabled&&<div style={{display:'grid',gap:16,marginTop:14}}>
   <div style={{display:'flex',alignItems:'center',gap:24,flexWrap:'wrap'}}>
    <div role="progressbar" aria-label="Chance estimada de sucesso"
     aria-valuenow={success} aria-valuemin={0} aria-valuemax={100}
     style={{width:138,height:138,borderRadius:'50%',flexShrink:0,
      background:`conic-gradient(${accent} ${success}%, rgba(135,150,162,.22) 0)`,
      display:'grid',placeItems:'center'}}>
     <div style={{width:112,height:112,borderRadius:'50%',display:'grid',
      placeItems:'center',background:'var(--background, #101820)',color:'var(--foreground, #f4f5f6)'}}>
      <div style={{textAlign:'center'}}>
       <strong style={{display:'block',fontSize:31,lineHeight:1.15}}>{success.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</strong>
       <small>Chance estimada</small>
      </div>
     </div>
    </div>
    <div style={{flex:1,minWidth:210,display:'grid',gap:8}}>
     <div style={{display:'flex',gap:10,alignItems:'center'}}>
      <Shield size={20} color={accent}/>
      <div><strong>Dificuldade de espionagem: {data.houseDefense}</strong>
       <small style={{display:'block'}}>Gerada pela Lei da Casa + bônus gerais aplicáveis</small></div>
     </div>
     <div style={{display:'flex',gap:10,alignItems:'center'}}>
      <Eye size={20} color={accent}/>
      <div><strong>Astúcia contra dificuldade {data.testDifficulty} · {data.difficultyLabel}</strong>
       <small style={{display:'block'}}>{data.agentRank} · Astúcia {data.testDice} ({data.testDice} dados de seis faces)</small></div>
     </div>
     <div style={{display:'flex',gap:10,alignItems:'center'}}>
      <ChartNoAxesCombined size={20} color={accent}/>
      <div><strong>Chegar ao alvo: {props.travelRounds===null?'rota pendente':
       props.travelRounds===0?'já está na região':
       props.travelRounds+' désdia(s) de viagem'}</strong>
       <small style={{display:'block'}}>Investigação local: mais 1 désdia</small></div>
     </div>
    </div>
   </div>
   <div style={{height:9,background:'rgba(135,150,162,.22)',borderRadius:999,overflow:'hidden'}}
    role="img" aria-label={success.toLocaleString('pt-BR')+' por cento de chance estimada'}>
    <div style={{width:success+'%',height:'100%',background:accent,borderRadius:999}}/>
   </div>
   {(data.forgedDocuments||data.aceInTheHole)&&
    <div className="house-ledger" style={{padding:10}}>
     <strong>Proteções adquiridas do agente</strong>
     {data.forgedDocuments&&<p className="house-caption" style={{margin:'4px 0'}}>
      Documentos falsificados · reduz a gravidade de uma falha descoberta em um grau.
     </p>}
     {data.aceInTheHole&&<p className="house-caption" style={{margin:'4px 0'}}>
      Uma carta na manga · qualquer resultado de morte será convertido em prisão.
     </p>}
    </div>}
   {props.originRegion!==props.destinationRegion&&
    <p className="house-caption" style={{margin:0}}>
     O alvo pode ser planejado antes da viagem; o agente só poderá executar a investigação
     depois de chegar de fato a {regionName}. Não foi enviada nenhuma ordem.
    </p>}
   <details>
    <summary>Como calculamos essa chance?</summary>
    <p className="house-caption">
     Fonte da dificuldade: {sourceLabel}. A Lei gera dificuldade 6 até Lei 30,
     acrescida de 3 a cada 5 pontos completos acima de 30; só depois
     entram os bônus de construções gerais aplicáveis.
     A chance é a proporção exata de combinações de {data.testDice} dados de seis faces
     cuja soma seja maior ou igual a {data.testDifficulty}.
     A graduação do agente é {data.agentRank}, com Astúcia {data.testDice} (rolagem de {data.testDice} dados de seis faces).
     Não são adicionados dados fictícios de outras posses.
    </p>
   </details>
   <p className="house-caption" style={{margin:0}}>
    <strong>Estimativa, não garantia.</strong> O Narrador decide condições finais,
    modificadores de missão, descoberta e consequências. A simulação não cria uma missão.
   </p>
  </div>}
 </section>;
}
