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
 * SPY_TEST_OWNER_HOUSE, SPY_TEST_OTHER_HOUSE
 */
import {createClient} from '@supabase/supabase-js';

const env=process.env;
const names=[
 'SPY_SUPABASE_URL','SPY_SUPABASE_ANON_KEY',
 'SPY_TEST_PLAYER_EMAIL','SPY_TEST_PLAYER_PASSWORD',
 'SPY_TEST_NARRATOR_EMAIL','SPY_TEST_NARRATOR_PASSWORD',
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

const player=client(),narrator=client(),anonymous=client();
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
 const [playerId,narratorId]=await Promise.all([
  login(player,env.SPY_TEST_PLAYER_EMAIL,env.SPY_TEST_PLAYER_PASSWORD,'jogador'),
  login(narrator,env.SPY_TEST_NARRATOR_EMAIL,env.SPY_TEST_NARRATOR_PASSWORD,'narrador'),
 ]);
 if(playerId===narratorId)throw Error('Contas de jogador e narrador devem ser distintas.');
 const pHouse=env.SPY_TEST_OWNER_HOUSE;
 const other=env.SPY_TEST_OTHER_HOUSE;
 const own=await allowed(player,'spy_house_management',{p_house:pHouse},
  'Leitura de agentes da própria Casa');
 if(own?.houseId!==pHouse)throw Error('Ficha autorizada retornou Casa incorreta.');
 console.log('OK: jogador vê apenas sua própria Casa.');
 await denied(player,'spy_house_management',{p_house:other},
  'Leitura dos agentes de Casa alheia');
 await denied(player,'spy_intelligence_read',{p_house:other},
  'Consulta de dossiê de Casa alheia');
 console.log('OK: jogador não acessa agentes nem dossiês alheios.');
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
 console.log('OK: Narrador autorizado, '+operations.length+' operações visíveis.');
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
