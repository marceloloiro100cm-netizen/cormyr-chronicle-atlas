import {RESOURCE_NAMES} from '@/lib/house/types';
import {formatDate,parseDate} from '@/lib/calendar/harptos';
import {SPY_INTELLIGENCE_RESOURCE_KEYS,
 type SpyIntelligenceObjective} from './spy-intelligence-rules';
import {spyIntelligenceFreshness} from './spy-intelligence-freshness';
import type {SpyDossier} from './spy-dossier.functions';

const objectiveNames:Record<SpyIntelligenceObjective,string>={
 house_resources:'Recursos',army:'Exército',possessions:'Posses',
};
const displayDate=(value:string)=>
 parseDate(value)?formatDate(value):'Data não confirmada';
const cleanText=(value:unknown,fallback='Informação registrada'):string=>
 typeof value==='string'&&value.trim().length>0
  ?value.trim().replace(/[\x00-\x1F\x7F]/g,' ').slice(0,180)
  :fallback;

/** Estatísticas apenas sobre descobertas autorizadas nesta resposta.
 * Nunca consulta a ficha original do alvo nem calcula total real de tropas.
 */
export function spyDossierDisclosureSummary(
 dossier:SpyDossier,officialDate:string|null,
){
 const known=dossier.findings;
 const byObjective=(type:SpyIntelligenceObjective)=>
  known.filter(f=>f.objective===type).length;
 const stale=known.filter(f=>{
  const tier=spyIntelligenceFreshness(f.verifiedDate,officialDate).tier;
  return tier==='review'||tier==='old';
 }).length;
 return {
  resources:byObjective('house_resources'),
  army:byObjective('army'),possessions:byObjective('possessions'),
  stale,total:known.length,
 };
}

/** Preparado exclusivamente a partir do snapshot permitido pela RPC.
 * Não exporta tabelas internas, eventos revogados, IDs ou auditoria do Narrador.
 */
export function buildSpyDossierReport(
 dossier:SpyDossier,officialDate:string|null,
):string{
 const s=spyDossierDisclosureSummary(dossier,officialDate);
 const lines=[
  'CORMYR · RELATÓRIO DE INTELIGÊNCIA',
  'CONFIDENCIAL · CASA '+cleanText(dossier.ownerHouseName),
  '',
  'Alvo: Casa '+cleanText(dossier.targetHouseName),
  'Região: '+cleanText(dossier.targetRegion,'Não informada'),
  'Cobertura: '+s.resources+'/7 recursos; '+s.army+' unidades conhecidas; '+
   s.possessions+' posses conhecidas',
  'Registros com mais de 30 dias de campanha: '+s.stale,
  '',
  'Os dados representam descobertas históricas; não são o inventário atual do alvo.',
 ];
 for(const objective of ['house_resources','army','possessions'] as const){
  lines.push('',objectiveNames[objective].toUpperCase());
  const rows=dossier.findings.filter(f=>f.objective===objective);
  if(objective==='house_resources'){
   for(const key of SPY_INTELLIGENCE_RESOURCE_KEYS){
    const row=rows.find(f=>f.key===key);
    if(!row){lines.push(RESOURCE_NAMES[key]+': Desconhecido');continue;}
    const value=row.snapshot['value'];
    const printed=typeof value==='number'&&Number.isFinite(value)
     ?String(value):'Dado sem valor confirmado';
    lines.push(RESOURCE_NAMES[key]+': '+printed+
     ' · confirmado '+displayDate(row.verifiedDate));
   }
  }else{
   if(rows.length===0)lines.push('Nenhuma descoberta nesta modalidade.');
   for(const row of rows){
    const name=cleanText(row.snapshot['name'],'Registro conhecido');
    const category=cleanText(row.snapshot['category'],'');
    lines.push('- '+name+(category?' ('+category+')':'')+
     ' · confirmado '+displayDate(row.verifiedDate));
   }
  }
 }
 lines.push('','Documento de uso interno. Não revela dados desconhecidos ou revogados.');
 return lines.join('\n');
}
export type SpyVersionRow={
 id:string;dateKey:string;objective:SpyIntelligenceObjective;
 subject:string;action:'revealed'|'refreshed'|'other';
 previous:string|null;next:string|null;
};
/** A história é apresentada sem valores anteriores aos jogadores.
 * O banco já omite snapshots revogados; esta filtragem acrescenta proteção.
 * Só o Narrador pode inspecionar a variação registrada na auditoria.
 */
export function spyDossierVersionRows(
 dossier:SpyDossier,narrator=false,
):SpyVersionRow[]{
 const allowed=new Set(dossier.findings.map(f=>f.objective+':'+f.key));
 const rows=dossier.history.filter(h=>narrator||
  allowed.has(h.objective+':'+h.key));
 const value=(snapshot:Record<string,unknown>|null)=>{
  if(!snapshot)return null;
  const raw=snapshot['value'];
  if(typeof raw==='number'&&Number.isFinite(raw))return String(raw);
  const name=snapshot['name'];
  return typeof name==='string'&&name.trim()?cleanText(name):null;
 };
 return rows.map(event=>({
  id:event.id,dateKey:event.dateKey,objective:event.objective,
  subject:event.objective==='house_resources'
   ?cleanText((RESOURCE_NAMES as Record<string,string>)[event.key],event.key)
   :cleanText(dossier.findings.find(f=>f.objective===event.objective&&f.key===event.key)
    ?.snapshot['name'],event.key),
  action:event.action==='revealed'?'revealed':
   event.action==='refreshed'?'refreshed':'other',
  previous:narrator?value(event.oldSnapshot):null,
  next:narrator?value(event.newSnapshot):null,
 }));
}
