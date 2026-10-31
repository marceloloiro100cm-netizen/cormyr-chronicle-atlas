/**
 * Lote 13 · auditoria somente leitura da pilha de Pull Requests do Hub.
 *
 * --report: valida o manifesto local.
 * --live: consulta a API GET do GitHub; não cria/fecha/mescla PRs.
 * --gate: falha até possuir cadeia coerente e todos os predecessores
 *         integrados. Mesmo nesse caso NÃO certifica deploy de produção.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const defaultStackPath=resolve(dirname(fileURLToPath(import.meta.url)),
 '../docs/hub-temporal-pr-stack.json');
export const readTemporalStack=()=>JSON.parse(readFileSync(defaultStackPath,'utf8'));

export function auditTemporalStack(manifest,livePulls=null){
 const errors=[],warnings=[];
 const seq=manifest?.sequence;
 if(!Array.isArray(seq)||seq.length<2)errors.push('Manifesto de PRs ausente ou incompleto');
 else{
  const seen=new Set(),branches=new Set();
  for(let i=0;i<seq.length;i++){
   const row=seq[i];
   if(!Number.isInteger(row?.pr)||typeof row?.head!=='string'||!row.head||
    typeof row?.base!=='string'||!row.base)errors.push('Entrada de PR malformada');
   if(seen.has(row.pr))errors.push('PR duplicada: #'+row.pr);
   if(branches.has(row.head))errors.push('Branch de origem duplicada: '+row.head);
   seen.add(row.pr);branches.add(row.head);
   const expected=i===0?'main':seq[i-1].head;
   if(row.base!==expected)errors.push('Base incorreta na PR #'+row.pr);
  }
  if(seen.has(129)||manifest.excluded_alternative_prs?.includes(129)!==true)
   errors.push('A versão concorrente #129 não foi explicitamente excluída');
  if(manifest.repository!=='marceloloiro100cm-netizen/cormyr-chronicle-atlas')
   errors.push('Repositório não corresponde ao Atlas da campanha');
 }
 if(livePulls===null)warnings.push('Estado vivo do GitHub não verificado');
 else if(Array.isArray(seq)){
  for(const item of seq){
   const live=livePulls.get(item.pr);
   if(!live){errors.push('PR #'+item.pr+' não pôde ser verificada');continue;}
   if(live.head!==item.head||live.base!==item.base)
    errors.push('Branch/base da PR #'+item.pr+' divergiu do manifesto');
   if(live.state!=='open'&&!live.merged)
    errors.push('PR #'+item.pr+' foi fechada sem integração');
   if(!live.mergeable&&live.state==='open')
    warnings.push('PR #'+item.pr+' requer resolução antes do merge');
  }
  const open=seq.filter(x=>!livePulls.get(x.pr)?.merged).map(x=>x.pr);
  if(open.length)warnings.push(
   'PRs ainda não mescladas: '+open.map(n=>'#'+n).join(', '));
 }
 return {
  format_version:1,
  chain_consistent:errors.length===0,
  live_verified:livePulls!==null&&errors.length===0,
  all_merged:livePulls!==null&&Array.isArray(seq)&&
   seq.every(x=>livePulls.get(x.pr)?.merged===true),
  release_authorized:false,
  migration_reconciliation_required:true,
  merge_automated:false,
  count:seq?.length??0,
  errors,warnings,
 };
}

export async function fetchTemporalStackLive(manifest,fetcher=fetch,token=''){
 const map=new Map();
 for(const {pr} of manifest.sequence){
  const result=await fetcher(
   'https://api.github.com/repos/'+manifest.repository+'/pulls/'+pr,{
    headers:{
     'Accept':'application/vnd.github+json',
     ...(token?{'Authorization':'Bearer '+token}:{}),
     'X-GitHub-Api-Version':'2022-11-28',
    },
    signal:AbortSignal.timeout(12000),
   });
  if(!result.ok)throw new Error('GitHub API não respondeu à verificação da PR #'+pr+
   ' (HTTP '+result.status+')');
  const value=await result.json();
  map.set(pr,{
   head:value.head?.ref,base:value.base?.ref,
   state:value.state,merged:value.merged===true||value.merged_at!==null,
   mergeable:value.mergeable!==false,
  });
 }
 return map;
}

export async function runTemporalStackAudit(argv,fetcher=fetch,token=''){
 if(argv.some(v=>!['--report','--live','--gate'].includes(v)))
  throw new Error('Argumento inválido. Use --report, --live ou --gate');
 const manifest=readTemporalStack();
 const live=argv.includes('--live')||argv.includes('--gate');
 let results=null,fetchError=null;
 if(live)try{results=await fetchTemporalStackLive(manifest,fetcher,token);}
 catch(error){fetchError=error instanceof Error?error.message:String(error);}
 const report=auditTemporalStack(manifest,results);
 if(fetchError)report.errors.push('Consulta ao GitHub indisponível: '+fetchError);
 const gate=argv.includes('--gate');
 return {report,exitCode:gate&&(!report.chain_consistent||!report.all_merged||
  !report.live_verified||!!fetchError)?2:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {report,exitCode}=await runTemporalStackAudit(
   process.argv.slice(2),fetch,process.env.GITHUB_TOKEN??'');
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=exitCode;
 }catch(error){
  process.stderr.write('Cadeia de PRs não verificada: '+
   (error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=2;
 }
}
