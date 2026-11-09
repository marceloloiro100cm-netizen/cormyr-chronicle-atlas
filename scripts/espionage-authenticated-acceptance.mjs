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
 */
import {createClient} from '@supabase/supabase-js';

const env=process.env;
const names=[
 'SPY_SUPABASE_URL','SPY_SUPABASE_ANON_KEY',
 'SPY_TEST_PLAYER_EMAIL','SPY_TEST_PLAYER_PASSWORD',
 'SPY_TEST_NARRATOR_EMAIL','SPY_TEST_NARRATOR_PASSWORD',
 'SPY_TEST_OTHER_PLAYER_EMAIL','SPY_TEST_OTHER_PLAYER_PASSWORD',
 'SPY_TEST_OWNER_HOUSE','SPY_TEST_OTHER_HOUSE',
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
 const [playerId,otherPlayerId,narratorId]=await Promise.all([
  login(player,env.SPY_TEST_PLAYER_EMAIL,env.SPY_TEST_PLAYER_PASSWORD,'jogador A'),
  login(otherPlayer,env.SPY_TEST_OTHER_PLAYER_EMAIL,env.SPY_TEST_OTHER_PLAYER_PASSWORD,'jogador B'),
  login(narrator,env.SPY_TEST_NARRATOR_EMAIL,env.SPY_TEST_NARRATOR_PASSWORD,'narrador'),
 ]);
 if(new Set([playerId,otherPlayerId,narratorId]).size!==3)
  throw Error('O aceite exige três contas reais de teste distintas.');
 const pHouse=env.SPY_TEST_OWNER_HOUSE;
 const other=env.SPY_TEST_OTHER_HOUSE;
 const own=await allowed(player,'spy_house_management',{p_house:pHouse},
  'Leitura de agentes da própria Casa');
 if(own?.houseId!==pHouse)throw Error('Ficha autorizada retornou Casa incorreta.');
 console.log('OK: jogador A vê apenas a própria Casa.');
 const ownDossiers=await allowed(player,'spy_intelligence_read',{p_house:pHouse},
  'Dossiês da própria Casa A');
 if(!Array.isArray(ownDossiers)||
   ownDossiers.some(d=>d.ownerHouseId!==pHouse||d.adminHistory?.length))
  throw Error('Dossiê A violou isolamento ou expôs auditoria administrativa.');
 const otherOwn=await allowed(otherPlayer,'spy_intelligence_read',{p_house:other},
  'Dossiês da própria Casa B');
 if(!Array.isArray(otherOwn)||
   otherOwn.some(d=>d.ownerHouseId!==other||d.adminHistory?.length))
  throw Error('Dossiê B violou isolamento ou expôs auditoria administrativa.');
 const otherAgents=await allowed(otherPlayer,'spy_house_management',{p_house:other},
  'Agentes da própria Casa B');
 if(otherAgents?.houseId!==other)
  throw Error('Ficha da Casa B não retornou propriedade correta.');
 await denied(player,'spy_house_management',{p_house:other},
  'Leitura dos agentes de Casa alheia');
 await denied(player,'spy_intelligence_read',{p_house:other},
  'Consulta de dossiê de Casa alheia');
 await denied(otherPlayer,'spy_house_management',{p_house:pHouse},
  'Jogador B não pode consultar agentes da Casa A');
 await denied(otherPlayer,'spy_intelligence_read',{p_house:pHouse},
  'Jogador B não pode consultar dossiê da Casa A');
 await denied(otherPlayer,'spy_narrator_operations_dashboard',{},
  'Jogador B não pode abrir a Central');
 await denied(otherPlayer,'spy_intelligence_admin_pending',{},
  'Jogador B não pode consultar prêmios pendentes');
 console.log('OK: jogadores A e B não acessam Casas adversárias nem ações administrativas.');
 await denied(player,'spy_narrator_operations_dashboard',{},
  'Painel global do Narrador por jogador');
 await denied(player,'spy_narrator_incident_history',{},
  'Arquivo secreto por jogador');
 await denied(anonymous,'spy_narrator_operations_dashboard',{},
  'Painel global por anônimo');
 console.log('OK: o papel de Narrador não pode ser utilizado por jogador nem anônimo.');
 const operations=await allowed(narrator,'spy_narrator_operations_dashboard',{},
  'Painel global do Narrador');
 if(!Array.isArray(operations))throw Error('Painel global retornou estrutura inválida.');
 const adminDossiers=await allowed(narrator,'spy_intelligence_read',{p_house:null},
  'Dossiês da campanha para Narrador');
 const pendingAwards=await allowed(narrator,'spy_intelligence_admin_pending',{},
  'Reprocessamento exclusivo do Narrador');
 const incidents=await allowed(narrator,'spy_narrator_incident_history',{},
  'Histórico exclusivo do Narrador');
 if(!Array.isArray(adminDossiers)||!Array.isArray(pendingAwards)||
    !Array.isArray(incidents))
  throw Error('Painel confidencial do Narrador retornou dados inválidos.');
 if(!ownDossiers.length)
  throw Error('Aceite incompleto: monte em homologação uma missão concluída da Casa A e confirme seu dossiê.');
 if(!adminDossiers.some(d=>d.ownerHouseId===pHouse))
  throw Error('Narrador não recebeu o dossiê de A já verificado para o jogador.');

 console.log('OK: Narrador autorizado, '+operations.length+' operações visíveis e '+adminDossiers.length+' dossiês.');
 const clock=await allowed(player,'get_campaign_calendar',{},
  'Calendário oficial do HUB');
 if(!clock||!Number.isSafeInteger(clock.version)||clock.version<1)
  throw Error('HUB de homologação sem calendário oficial, teste positivo bloqueado.');
 console.log('OK: Hub Temporal disponível na homologação, versão '+clock.version+'.');
 console.log('ACEITE REAL DE LEITURA APROVADO para duas Casas e Narrador. Não houve qualquer mutação no banco.');
}
main().catch(error=>{
 console.error('ACEITE REPROVADO: '+error.message);
 process.exitCode=1;
});
