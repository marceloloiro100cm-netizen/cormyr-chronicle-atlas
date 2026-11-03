/** Explicações legíveis dos 14 itens usados na página de Espionagem.
 * A apresentação não substitui os custos, exigências nem os registros históricos.
 * Referência: Out of Strife, Prosperity (títulos de posse e melhorias).
 * Onde o Cormyr utiliza adaptação, isso é indicado explicitamente.
 */
type SpyCatalogExplanation={
 summary:string;
 purpose:string;
 effects:readonly string[];
 reach:string;
 note?:string;
};
export const SPY_CATALOG_EXPLANATIONS:Record<string,SpyCatalogExplanation>={
 'pros-dog-kennels':{
  summary:'Treina cães; concede +1 na rolagem de Sorte da Casa e descontos em cães e no Mestre da Caça.',
  purpose:'Os canis criam e treinam cães para caça e vigilância. Sozinhos não aumentam a dificuldade de espionagem: o bônus defensivo exige a melhoria Cães de Guarda.',
  effects:[
   'Acrescenta 1 ao resultado das rolagens de Sorte da Casa.',
   'Reduz em 2 pontos de Riqueza o custo de adquirir a posse Mestre da Caça.',
   'Concede desconto de 40% na compra de cães treinados por membros da Casa.',
  ],reach:'Benefícios da posse; a defesa depende de adquirir Cães de Guarda.',
 },
 'pros-dog-kennels--guard-dogs':{
  summary:'Aumenta em 3 a dificuldade dos testes de Astúcia de espiões e sabotadores inimigos.',
  purpose:'Cães distribuídos pelos territórios da Casa detectam a presença de intrusos, assassinos e sabotadores. Depende de Canis em funcionamento.',
  effects:['+3 na dificuldade dos testes de Astúcia realizados por agentes hostis contra a Casa. O bônus é somado após converter a Lei em dificuldade.'],
  reach:'Proteção geral dos domínios da Casa; não é um bônus no atributo Lei.',
 },
 'pros-bailiffs':{
  summary:'Guardas profissionais mantêm a ordem em um domínio ou comunidade escolhida.',
  purpose:'Oficiais de Justiça patrulham e investigam uma área designada. Esta posse não concede, sozinha, +3 na dificuldade de espionagem: isso exige Treinamento Investigativo.',
  effects:[
   'Permite obter informações por meio dos contatos dos guardas na comunidade ou domínio designado.',
   'Reduz em 1 a perda de Lei causada por conflitos militares na área protegida.',
   'Reduz em 1 a penalidade de Sorte da Casa causada por Lei baixa.',
   'Quando a Casa converte Poder em Lei, concede bônus temporário de Lei apenas no cálculo de Sorte da Casa; esse bônus decai mensalmente.',
  ],reach:'Domínio ou comunidade selecionada; transferência dos oficiais suspende seus benefícios por um mês.',
 },
 'pros-bailiffs--investigative-training':{
  summary:'Acrescenta 3 à dificuldade de Astúcia de agentes inimigos na área dos Oficiais de Justiça.',
  purpose:'Os oficiais treinados observam pessoas suspeitas e investigam os movimentos de intrusos. Exige Oficiais de Justiça ativos.',
  effects:[
   '+3 na dificuldade dos testes de Astúcia de espiões, assassinos e sabotadores inimigos na área designada.',
   'Pelo suplemento, um intruso que falhe no teste é capturado pelos oficiais. No Cormyr, o Narrador concilia essa regra com os resultados de fuga, prisão e morte.',
  ],reach:'Somente no domínio ou na comunidade protegida pelos Oficiais de Justiça.',
 },
 'pros-secret-police':{
  summary:'Acrescenta 6 à dificuldade de Astúcia de espiões, assassinos e sabotadores hostis.',
  purpose:'A Polícia Secreta usa informantes e investigadores disfarçados para detectar agentes inimigos em todos os territórios da Casa.',
  effects:[
   '+6 na dificuldade de quaisquer testes de Astúcia de agentes inimigos atuando nos domínios da Casa.',
   'Membros da Casa possuem contatos para obtenção de informações em todos os seus domínios.',
   'Reduz em 1 a penalidade nas rolagens de Sorte da Casa causada por População muito baixa ou muito alta.',
   'Não concede +1 ao atributo Lei nem mitigação de perdas de Lei +2: esses valores estavam descritos incorretamente na importação anterior.',
  ],reach:'Todos os domínios da Casa, quando a posse está ativa.',
  note:'Regra do suplemento: a Polícia Secreta concede +6 contra agentes hostis. As fichas históricas devem ser conciliadas separadamente se tiverem efeitos antigos registrados.',
 },
 'pros-secret-police--special-detachment':{
  summary:'Permite enviar a Polícia Secreta para atuar nos territórios de outra Casa.',
  purpose:'O Destacamento Especial possibilita infiltração policial além das fronteiras da própria Casa. Exige Polícia Secreta ativa.',
  effects:[
   'Desbloqueia a ação de Casa de infiltração da Polícia Secreta no território de outro nobre.',
   'Para manter a operação oculta, o livro exige um teste de Astúcia com dificuldade 12.',
   'Se forem descobertos, há risco de incidente diplomático e perda de Influência, a ser resolvido pelo Narrador.',
  ],reach:'Infiltração em território de outra Casa; não é uma nova célula de espionagem comum.',
 },
 'pros-spy-network':{
  summary:'Organiza uma rede de informantes para descobrir informações ocultas sobre outras Casas.',
  purpose:'A Rede de Espiões concede acesso a células de informação que podem atuar em domínios. Sua utilização pode ser descoberta pela Casa investigada.',
  effects:[
   'O livro permite até três células iniciais; o sistema de Cormyr registra e acompanha cada agente individualmente.',
   'Cada célula adicional atuando no mesmo domínio concede +3 nos testes de Contatos usados para obter informações.',
   'A descoberta da espionagem exige um teste relacionado à Astúcia: a Lei do alvo gera dificuldade 6 até Lei 34 e mais 3 para cada 5 pontos completos a partir de Lei 35.',
   'A rede pode ser exposta, comprometida e sofrer consequências de Influência. As viagens e missões do Cormyr são administradas pelo calendário próprio do site.',
  ],reach:'Informantes nos domínios onde suas células estão posicionadas.',
  note:'No livro, mover células entre domínios é uma ação da Casa com teste de Status (Administração), dificuldade 9 e duração de um mês. O módulo de Cormyr utiliza a própria mecânica de viagens em désdias.',
 },
 'pros-spy-network--expanded-network':{
  summary:'Acrescenta duas células de espionagem à capacidade da rede a cada aquisição.',
  purpose:'Amplia a quantidade de informantes que a Casa pode manter. Exige uma Rede de Espiões ativa.',
  effects:[
   'Permite criar mais duas células de espiões em território próprio por compra.',
   'Para operar em outra região, as novas células precisam ser deslocadas pelo sistema de viagens.',
   'A melhoria pode ser adquirida mais de uma vez, conforme as regras de construção.',
  ],reach:'Capacidade geral da Rede de Espiões, com cada célula mantendo sua localização individual.',
 },
 'pros-spy-network--expert-spies':{
  summary:'Reduz em um dado os testes de Astúcia de quem tenta descobrir os espiões da sua Casa.',
  purpose:'Ensina os agentes a ocultar a identidade e disfarçar as operações. Exige Rede de Espiões ativa.',
  effects:[
   'Os testes de Astúcia feitos para detectar os seus espiões sofrem uma penalidade de um dado de teste.',
   'Essa melhoria não concede um dado adicional à Astúcia do espião nem aumenta diretamente a dificuldade de investigar sua própria Casa.',
  ],reach:'Protege as células da Rede de Espiões da Casa.',
 },
 'pros-spy-network--plausible-deniability':{
  summary:'Protege a Casa contra exposição e perdas de Influência quando seus espiões fracassam.',
  purpose:'A rede opera por intermediários, dificultando provar quem ordenou uma missão fracassada.',
  effects:[
   'Falhas dos agentes não expõem automaticamente o envolvimento da Casa.',
   'Falhas de espiões não causam perda de Influência ligada à revelação de sua Casa.',
   'Não concede bônus de sucesso à Astúcia do agente.',
  ],reach:'Consequências políticas das operações da Rede de Espiões.',
 },
 'pros-street-gangs':{
  summary:'Controla gangues locais, mitigando perdas de Riqueza, mas aumentando o risco de perda de Lei.',
  purpose:'A Casa organiza criminosos e informantes de rua. A posse tem benefícios econômicos e militares, mas apenas a melhoria Olhos por Toda Parte acrescenta uma rede de informações.',
  effects:[
   'Reduz em 1 ponto as perdas de Riqueza resolvidas pela regra de mitigação.',
   'Aumenta em 1 ponto as perdas de Lei causadas por resultados da Sorte da Casa.',
   'Reduz em 2 pontos de Poder o custo de recrutar a unidade militar de Recrutas Camponeses.',
  ],reach:'Comunidade onde o grupo atua, com repercussões econômicas para a Casa.',
 },
 'pros-street-gangs--eyes-everywhere':{
  summary:'Permite usar contatos das gangues para levantar informações na comunidade e no domínio.',
  purpose:'Olhos por Toda Parte transforma membros de gangues em informantes organizados.',
  effects:[
   'A Casa recebe acesso a contatos para obtenção de informações na comunidade e domínio designados.',
   'O Narrador avalia a obtenção de informações como em uma Rede de Espiões.',
   'Essa melhoria não cria automaticamente uma célula extra da Rede de Espiões.',
  ],reach:'Somente na comunidade e no domínio onde atuam as gangues.',
 },
 'pros-black-market':{
  summary:'Gera benefícios econômicos com comércio clandestino e permite acesso facilitado a bens ilegais.',
  purpose:'O Mercado Negro organiza comerciantes clandestinos. Ele não aumenta sozinho a dificuldade de espionagem; essa proteção depende da melhoria Ouvido no Submundo.',
  effects:[
   'Concede +1 ao bônus de ganho de Riqueza nas rolagens correspondentes.',
   'Permite sacrificar permanentemente um ponto de Lei para aumentar esse bônus de ganho de Riqueza em uma única rolagem.',
   'Bens ilegais custam 10% menos para membros da Casa, conforme avaliação do Narrador.',
   'Na ação Administrar Recursos, permite trocar um ponto de Lei por um ponto de Riqueza como conversão apressada.',
  ],reach:'Economia clandestina da Casa; exige Lei 30 ou menor para ser adquirida.',
 },
 'pros-black-market--ear-in-the-underworld':{
  summary:'Acrescenta 3 à dificuldade de Astúcia de agentes subversivos inimigos contra a Casa.',
  purpose:'O submundo criminoso identifica espiões e conspiradores que tentam agir contra a Casa. Exige Mercado Negro ativo.',
  effects:[
   '+3 na dificuldade dos testes de Astúcia de agentes inimigos que atuam contra a Casa.',
   'Esse bônus é aplicado após converter a Lei em dificuldade e não altera o atributo Lei.',
  ],reach:'Proteção geral da Casa contra agentes subversivos.',
 },
};

export function spyCatalogExplanation(id:string){
 return SPY_CATALOG_EXPLANATIONS[id]??null;
}
