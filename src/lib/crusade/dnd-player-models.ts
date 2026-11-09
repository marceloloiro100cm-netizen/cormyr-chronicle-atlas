/** Arquétipos autorais de treino para o futuro simulador D&D de jogadores.
 * Não traz o bestiário privado de 300 fichas nem dados oficiais de Casas.
 */
import {crzSealCreature,type CrzCreature} from '@/lib/crusade/creatures';
import {DND_MILITARY_CREATURES,dndMilitaryTemplateId}
 from '@/lib/crusade/dnd-military';

type Group='Dragões'|'Goblinoides'|'Constructos'|'Mortos-vivos'|'Humanoides';
type Model=Readonly<{creature:CrzCreature;group:Group}>;
const original=(
 id:string,name:string,group:Group,typeId:string,
 size:'S'|'M'|'L',hp:number,ac:number,fly=0,
):Model=>{
 const template=DND_MILITARY_CREATURES.find(c=>c.id===dndMilitaryTemplateId(typeId));
 if(!template)throw new Error('Modelo militar de referência indisponível.');
 const {contentHash: _hash,...originalSource}=template.provenance;
 const creature=crzSealCreature({
  ...template,id:'player-'+id+'|model',name,
  source:'Modelos originais de treinamento Cormyr',size,
  creatureType:group==='Dragões'?'dragon':group==='Constructos'?'construct':
   group==='Mortos-vivos'?'undead':'humanoid',
  tags:['player-model',group],cr:1,xp:200,hp:{average:hp},ac,
  speedFt:{...template.speedFt,...(fly>0?{fly}:{} )},
  flags:{...template.flags,flying:fly>0},
  provenance:{...originalSource,origin:'manual',srd:false,
   license:'original-authorized',
   attribution:'Arquétipo fictício original do simulador Cormyr.',
   permissionEvidence:'Modelo próprio preparado exclusivamente para treinamento local, sem reprodução de bestiário privado.'},
  warnings:['Modelo de treinamento, sem ligação com tropas ou personagens da campanha.'],
 });
 return {creature,group};
};
export const PLAYER_DND_MODELS:readonly Model[]=[
 original('draco','Draco de treino','Dragões','cavalry','L',36,15,50),
 original('goblinoide','Goblinoide de treino','Goblinoides','raiders','S',9,13),
 original('constructo','Sentinela construta de treino','Constructos','garrison','M',24,16),
 original('esqueleto','Esqueleto de treino','Mortos-vivos','infantry','M',13,12),
 original('batedor','Batedor de treino','Humanoides','scouts','M',10,13),
];
