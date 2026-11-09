/**
 * P0 — verificação de autenticação Supabase com dois JWTs reais.
 * Nunca cria contas, altera credenciais, chama service_role ou grava fichas.
 * Requer variáveis/secrets do environment protegido no GitHub Actions.
 */
import {createClient} from '@supabase/supabase-js';

const required=[
 'BATTLE_E2E_SUPABASE_URL','BATTLE_E2E_PUBLIC_KEY','BATTLE_E2E_EXPECTED_HOST',
 'BATTLE_E2E_NARRATOR_EMAIL','BATTLE_E2E_NARRATOR_PASSWORD',
 'BATTLE_E2E_PLAYER_EMAIL','BATTLE_E2E_PLAYER_PASSWORD',
];
for(const key of required)if(!process.env[key]){
 process.stderr.write('P0 inconclusivo: falta configuração protegida '+key+'\\n');
 process.exit(2);
}
const host=new URL(process.env.BATTLE_E2E_SUPABASE_URL).hostname;
if(host!==process.env.BATTLE_E2E_EXPECTED_HOST){
 process.stderr.write('P0 interrompido: ambiente Supabase divergente do host esperado.\\n');
 process.exit(2);
}
function make(){
 return createClient(process.env.BATTLE_E2E_SUPABASE_URL,
  process.env.BATTLE_E2E_PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false,
   detectSessionInUrl:false}});
}
async function login(client,email,password,label){
 const result=await client.auth.signInWithPassword({email,password});
 if(result.error||!result.data.user)throw new Error(label+': falha de login autenticado.');
 return result.data.user.id;
}
async function isTrue(client,func,label){
 const r=await client.rpc(func);
 if(r.error)throw new Error(label+': RPC de autorização indisponível.');
 return r.data===true;
}
async function rows(client,table){
 const r=await client.from(table).select('id').limit(60);
 if(r.error)throw new Error(table+': RLS/SELECT indisponível.');
 return r.data??[];
}
const narrator=make(),player=make();
try{
 const gmId=await login(narrator,process.env.BATTLE_E2E_NARRATOR_EMAIL,
  process.env.BATTLE_E2E_NARRATOR_PASSWORD,'Narrador');
 const playerId=await login(player,process.env.BATTLE_E2E_PLAYER_EMAIL,
  process.env.BATTLE_E2E_PLAYER_PASSWORD,'Jogador');
 if(gmId===playerId)throw new Error('P0: as contas de teste não podem ser iguais.');
 if(!await isTrue(narrator,'is_campaign_admin','Narrador'))
  throw new Error('P0: conta narradora sem privilégio atual.');
 if(await isTrue(player,'is_campaign_admin','Jogador'))
  throw new Error('P0: conta de jogador com privilégio administrativo.');
 for(const [client,label] of [[narrator,'Narrador'],[player,'Jogador']]){
  if(!await isTrue(client,'campaign_access_active',label))
   throw new Error('P0: sessão de '+label+' sem acesso ativo à campanha.');
 }
 const [adminBattles,playerBattles,adminInvites,playerInvites]=await Promise.all([
  rows(narrator,'battle_sim_sessions'),rows(player,'battle_sim_sessions'),
  rows(narrator,'battle_v3_invitations'),rows(player,'battle_v3_invitations'),
 ]);
 if(playerBattles.length>0)
  throw new Error('P0: jogador consegue ler sessões administrativas.');

 // Prova positiva do isolamento em produção: não depende de sessões de
 // batalha vazias. Nunca copia para o log nomes, IDs ou dados privados.
 const [adminMonsters,playerMonsters,adminRoster,playerRoster]=await Promise.all([
  rows(narrator,'battle_dnd_cormyr_monsters'),
  rows(player,'battle_dnd_cormyr_monsters'),
  rows(narrator,'battle_house_roster_imports'),
  rows(player,'battle_house_roster_imports'),
 ]);
 if(playerMonsters.length>0||playerRoster.length>0)
  throw new Error('P0: jogador consegue ler catálogo ou tropas privadas.');
 if(process.env.BATTLE_E2E_REQUIRE_PRIVATE_FIXTURE==='true'&&
   (adminMonsters.length===0||adminRoster.length===0))
  throw new Error('P0: faltam registros privados de referência para comprovar RLS.');
 if(adminMonsters.length>0&&adminRoster.length>0)
  process.stdout.write('P0: catálogo e tropas privados: Narrador lê e jogador não lê.\\n');
 const adminSet=new Set(adminInvites.map(x=>x.id));
 if(playerInvites.some(x=>!adminSet.has(x.id)))
  throw new Error('P0: convocações do jogador não constam no escopo do Narrador.');
 process.stdout.write('P0: JWT distintos, papeis atuais, acesso ativo e leituras RLS aprovados.\\n');
 if(adminBattles.length===0)
  process.stdout.write('P0: RLS de partidas não comprovada contra fixture de Narrador; zero sessões de referência.\\n');
 else process.stdout.write('P0: Narrador possui sessões; nenhum ID administrativo visível ao jogador.\\n');
 if(adminInvites.length===0)
  process.stdout.write('P0: tabela de convocações vazia; teste cruzado requer convites fictícios de homologação.\\n');
}finally{
 // signOut() sem scope revoga todas as sessões do usuário em outros dispositivos!
 // Encerrar exclusivamente os dois tokens temporários emitidos por este teste.
 await Promise.allSettled([
  narrator.auth.signOut({scope:'local'}),
  player.auth.signOut({scope:'local'}),
 ]);
}
