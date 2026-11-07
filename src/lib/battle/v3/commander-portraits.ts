/** Retratos disponibilizados pelo Narrador em 07/11/2026.
 * Os caminhos correspondem a arquivos locais otimizados publicados no site,
 * jamais Google Drive: sem URLs temporárias ou dependência de compartilhamento.
 * IDs da origem preservados para auditoria da migração.
 */
export const BATTLE_COMMANDER_PORTRAITS={
 tillet:{role:'Tillet',file:'01-tillet.webp',driveId:'1bwxV1Q1lNDWENDW-e6dW6Jq_xH-MNup1'},
 'purple-dragon':{role:'Oficial Dragão Púrpura',file:'02-oficial-dragao-purpura.webp',driveId:'1z00kgcwoq9sjUr2yAS2a1OgW5W4lGjig'},
 adventurer:{role:'Aventureiro',file:'03-aventureiro.webp',driveId:'1vgiVCQJU669e--ES7VrzjdrR-qSSTIKM'},
 hero:{role:'Herói',file:'04-heroi.webp',driveId:'1v1nXurulu1Y7nBxVM9736xcswHnwEVjT'},
 noble:{role:'Nobre',file:'05-nobre.webp',driveId:'1QjjQrrlWcQfYaz-q8T96lCWg1dALyUCP'},
 knight:{role:'Cavaleiro',file:'06-cavaleiro.webp',driveId:'1U1l96EuIUtGbArwHy_Iu_I9xUt49qwvF'},
 'war-mage':{role:'Mago de Guerra',file:'07-mago-de-guerra.webp',driveId:'1qaqwP4gb-DTWYOXB9ElvuW-VwSTSsi9t'},
 'tempus-priest':{role:'Sacerdote de Tempus',file:'08-sacerdote-de-tempus.webp',driveId:'1X8ATiBP3LR6Ekl0euqsJguC1CxGMMxrE'},
 priest:{role:'Paladino de Helm',file:'09-paladino-de-helm.webp',driveId:'16aLf2yyjnIza8MJxT9kqoqd5bXGfbznu'},
 quartermaster:{role:'Marechal de Campo',file:'10-marechal-de-campo.webp',driveId:'1EPkoI-JBmoBncPJ_ODj1x2kHtCKSeEGB'},
 'arms-master':{role:'Mestre de Armas',file:'11-mestre-de-armas.webp',driveId:'16WOhAIbL3AgwXwH4Yv8CUCto0O1X_edz'},
 'archer-captain':{role:'Capitão de Arqueiros',file:'12-capitao-de-arqueiros.webp',driveId:'1DbFSpGlIRsWWQURnJ1T2k9ZJBGaDOJ62'},
 ranger:{role:'Patrulheiro',file:'13-patrulheiro.webp',driveId:'1Hc_2vW39En9Exb78E31GHD9Wr9A3bPPO'},
 'ashkar-raider':{role:'Bárbaro',file:'14-barbaro.webp',driveId:'1tmxOLKspZ3bPqqMBL9NswwAWv23hteF6'},
 'veteran-mercenary':{role:'Mercenário Veterano',file:'15-mercenario-veterano.webp',driveId:'19yoVs6TLmuwx3NINI9l3-SuFXKbnFtE_'},
 engineer:{role:'Engenheiro de Cerco',file:'16-engenheiro-de-cerco.webp',driveId:'1VAlUFr6KyCLPVqwDT3_UcDzAPfJooROR'},
 assassin:{role:'Assassino',file:'17-assassino.webp',driveId:'1xbFCEH52WITjGUeNoNuxRp7hyZLnOQES'},
 warlord:{role:'Senhor da Guerra',file:'18-senhor-da-guerra.webp',driveId:'1BFRwQ2y2ZyS0L93g9xtXiIJwcHApRnax'},
 'war-bard':{role:'Bardo de Guerra',file:'19-bardo-de-guerra.webp',driveId:'15hfbEGzB_XluVmPWOoS78qTwBPoBF5bg'},
 necromancer:{role:'Necromante',file:'20-necromante.webp',driveId:'1ihQ4OYKQ0DL4sHWhz8a7E8gwRJbk2PGp'},
} as const;
export type BattlePortraitId=keyof typeof BATTLE_COMMANDER_PORTRAITS;
export function commanderPortraitUrl(id:BattlePortraitId):string{
 return '/battle/commanders/'+BATTLE_COMMANDER_PORTRAITS[id].file;
}
