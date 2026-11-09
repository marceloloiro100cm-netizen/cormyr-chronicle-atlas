/**
 * Cormyr espionage: real-session/RLS smoke test for ISOLATED HOMOLOGATION.
 * Read only. Does not create agents, resolve missions, advance the Hub, or
 * change production. No service role key, no JWT impersonation.
 *
 * Required environment:
 * SPY_ACCEPTANCE_ENV=isolated-homologation
 * SPY_SUPABASE_URL, SPY_SUPABASE_ANON_KEY
 * SPY_TEST_PLAYER_EMAIL, SPY_TEST_PLAYER_PASSWORD
 * SPY_TEST_NARRATOR_EMAIL, SPY_TEST_NARRATOR_PASSWORD
 * SPY_TEST_OTHER_PLAYER_EMAIL, SPY_TEST_OTHER_PLAYER_PASSWORD
 * SPY_TEST_OWNER_HOUSE, SPY_TEST_OTHER_HOUSE
 * SPY_ALLOWED_HOMOLOGATION_HOST (exact hostname of an authorized isolated DB)
 */
import {createClient} from '@supabase/supabase-js';

const env=process.env;
const names=[
 'SPY_SUPABASE_URL','SPY_SUPABASE_ANON_KEY',
 'SPY_TEST_PLAYER_EMAIL','SPY_TEST_PLAYER_PASSWORD',
 'SPY_TEST_NARRATOR_EMAIL','SPY_TEST_NARRATOR_PASSWORD',
 'SPY_TEST_OTHER_PLAYER_EMAIL','SPY_TEST_OTHER_PLAYER_PASSWORD',
 'SPY_TEST_OWNER_HOUSE','SPY_TEST_OTHER_HOUSE',
 'SPY_ALLOWED_HOMOLOGATION_HOST',
];
const missing=names.filter(key=>!env[key]?.trim());
if(env.SPY_ACCEPTANCE_ENV!=='isolated-homologation'){
 console.error('RECUSADO: este ensaio exige SPY_ACCEPTANCE_ENV=isolated-homologation.');
 process.exit(2);
}
if(missing.length){
 console.error('NÃO EXECUTADO: configure as variáveis ausentes: '+missing.join(', '));
 process.exit(2);
}
if(env.SPY_TEST_OWNER_HOUSE===env.SPY_TEST_OTHER_HOUSE){
 console.error('NÃO EXECUTADO: Casas de teste devem ser diferentes.');
 process.exit(2);
}
const url=env.SPY_SUPABASE_URL;
let host;
try{host=new URL(url).hostname;}catch{console.error('URL de homologação inválida');process.exit(2);}
if(host!==env.SPY_ALLOWED_HOMOLOGATION_HOST){
 console.error('RECUSADO: host não corresponde à homologação autorizada.');
 process.exit(2);
}
const anon=env.SPY_SUPABASE_ANON_KEY;
const client=()=>createClient(url,anon,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
});

const player=client(),otherPlayer=client(),narrator=client(),anonymous=client();
async function login(db,email,password,label){
 const result=await db.auth.signInWithPassword({email,password});
 if(result.error||!result.data.user)throw Error(label+': autenticação falhou.');
 return result.data.user.id;
}
async function allowed(db,rpc,args,label){
 const res=await db.rpc(rpc,args);
 if(res.error)throw Error(label+': consulta não autorizada ou indisponível.');
 return res.data;
}
async function denied(db,rpc,args,label){
 const result=await db.rpc(rpc,args);
 if(!result.error)throw Error(label+': vazamento de autorização (consulta permitida).');
 return true;
}
async function main(){
 const [playerId,otherId,narratorId]=await Promise.all([
  login(player,env.SPY_TEST_PLAYER_EMAIL,env.SPY_TEST_PLAYER_PASSWORD,'jogador A'),
  login(otherPlayer,env.SPY_TEST_OTHER_PLAYER_EMAIL,env.SPY_TEST_OTHER_PLAYER_PASSWORD,'jogador B'),
  login(narrator,env.SPY_TEST_NARRATOR_EMAIL,env.SPY_TEST_NARRATOR_PASSWORD,'narrador'),
 ]);
 if(new Set([playerId,otherId,narratorId]).size!==3)
  throw Error('Contas de jogador A, jogador B e narrador devem ser distintas.');
 const pHouse=env.SPY_TEST_OWNER_HOUSE;
 const other=env.SPY_TEST_OTHER_HOUSE;
 const own=await allowed(player,'spy_house_management',{p_house:pHouse},
  'Leitura de agentes da própria Casa');
 if(own?.houseId!==pHouse)throw Error('Ficha autorizada retornou Casa incorreta.');
 console.log('OK: jogador A vê apenas sua própria Casa.');
 const otherManagement=await allowed(otherPlayer,'spy_house_management',{p_house:other},
  'Leitura de agentes da Casa B');
 if(otherManagement?.houseId!==other)throw Error('Casa B retornou dados de outra Casa.');
 await denied(otherPlayer,'spy_house_management',{p_house:pHouse},
  'Leitura de agentes da Casa A pelo jogador B');
 console.log('OK: jogador B acessa sua Casa e não consulta agentes da Casa A.');
 await denied(player,'spy_house_management',{p_house:other},
  'Leitura dos agentes de Casa alheia');
 await denied(player,'spy_intelligence_read',{p_house:other},
  'Consulta de dossiê de Casa alheia');
 await denied(otherPlayer,'spy_intelligence_read',{p_house:pHouse},
  'Consulta do dossiê da Casa A pelo jogador B');
 async function checkPlayerDossier(db,house){
  const records=await allowed(db,'spy_intelligence_read',{p_house:house},
   'Dossiê pertencente à Casa de teste');
  if(!Array.isArray(records)||records.some(d=>
   d.ownerHouseId!==house||d.adminHistory?.length>0||
   d.history?.some(x=>x.oldSnapshot!==null||
    Object.keys(x.newSnapshot??{}).length!==0)))
   throw Error('Dossiê da Casa contém dados de outra Casa ou histórico administrativo.');
  return records.length;
 }
 const [aCount,bCount]=await Promise.all([
  checkPlayerDossier(player,pHouse),
  checkPlayerDossier(otherPlayer,other),
 ]);
 console.log('OK: dossiês privados e históricos filtrados: Casa A='+aCount+
  ', Casa B='+bCount+'.');
 await denied(player,'spy_narrator_operations_dashboard',{},
  'Painel global do Narrador por jogador');
 await denied(player,'spy_narrator_incident_history',{},
  'Arquivo secreto por jogador');
 await denied(otherPlayer,'spy_narrator_operations_dashboard',{},
  'Painel global do Narrador por Casa B');
 await denied(otherPlayer,'spy_intelligence_admin_pending',{},
  'Fila de dossiês administrativos por Casa B');
 await denied(player,'spy_intelligence_admin_pending',{},
  'Fila de dossiês administrativos por jogador A');
 await denied(anonymous,'spy_narrator_operations_dashboard',{},
  'Painel global por anônimo');
 console.log('OK: o papel de Narrador não pode ser utilizado por jogador nem anônimo.');
 const [operations,incidents,reviewQueue,narratorDossiers]=await Promise.all([
  allowed(narrator,'spy_narrator_operations_dashboard',{},
   'Painel global do Narrador'),
  allowed(narrator,'spy_narrator_incident_history',{},
   'Histórico confidencial de incidentes'),
  allowed(narrator,'spy_intelligence_admin_pending',{},
   'Fila de dossiês em processamento'),
  allowed(narrator,'spy_intelligence_read',{p_house:null},
   'Dossiês de todo o reino para Narrador'),
 ]);
 if(![operations,incidents,reviewQueue,narratorDossiers].every(Array.isArray))
  throw Error('Painel de Narrador retornou dados incompatíveis.');
 if(narratorDossiers.some(d=>!d.ownerHouseId))
  throw Error('Dossiê do Narrador sem Casa investigadora.');
 console.log('OK: Narrador autorizado. Operações='+operations.length+
  ', dossiês='+narratorDossiers.length+', prêmios pendentes='+reviewQueue.length+
  ', incidentes='+incidents.length+'.');
 const clock=await allowed(player,'get_campaign_calendar',{},
  'Calendário oficial do HUB');
 if(!clock||!Number.isSafeInteger(clock.version)||clock.version<1)
  throw Error('HUB de homologação sem calendário oficial, teste positivo bloqueado.');
 console.log('OK: Hub Temporal disponível na homologação, versão '+clock.version+'.');
 console.log('ACEITE DE LEITURA APROVADO. Não houve qualquer mutação no banco.');
}
main().catch(error=>{
 console.error('ACEITE REPROVADO: '+error.message);
 process.exitCode=1;
});
