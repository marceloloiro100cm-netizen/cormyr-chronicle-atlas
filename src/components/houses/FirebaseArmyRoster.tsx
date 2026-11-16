/**
 * Firebase pilot: read-only military roster from the AUTHORIZED noble-house
 * snapshot. Does not read battle operations, Firestore, Supabase or any other
 * House. All numeric totals are computed from existing source fields only.
 */
import {TRAINING,UNIT_TYPES} from '@/lib/house/engine';
import {militaryUnitSymbolSrc,unitSymbolType} from '@/components/house/military-unit-symbol';

type Value=Record<string,unknown>;
export type RosterUnit={
  id:string;name:string;typeNames:string[];training:string;symbolSrc:string|null;
  strength:number|null;casualties:number|null;available:number|null;
  destroyed:boolean;commander:string|null;situation:string|null;
  origin:string|null;health:number|null;xp:number|null;
  equipment:string[];skills:{label:string;level:number}[];
};
type Roster={units:RosterUnit[];total:number;limited:boolean;
  active:number|null;knownStrength:number|null;knownAvailable:number|null};
const LEGACY_SKILLS:Record<string,string>={
  athletics:'Atletismo',endurance:'Vigor',fighting:'Luta',
  marksmanship:'Pontaria',warfare:'Guerra',awareness:'Percepção',
  agility:'Agilidade',animalHandling:'Trato com Animais',
  cunning:'Astúcia',stealth:'Furtividade',survival:'Sobrevivência',
};
const asText=(v:unknown,max=180):string|null=>
  typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const count=(v:unknown):number|null=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000000?v:null;
const obj=(v:unknown):v is Value=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);

export function readFirebaseMilitaryRoster(state:Record<string,unknown>):Roster{
  const raw=Array.isArray(state.units)?state.units:[];
  const list=raw.slice(0,150);
  const units:RosterUnit[]=list.flatMap((value,index)=>{
    if(!obj(value))return [];
    const types=Array.isArray(value.types)?value.types.filter(
      (v):v is string=>typeof v==='string').slice(0,6):[];
    const typeNames=types.map(t=>UNIT_TYPES.find(item=>item.id===t)?.name??t);
    const trainingKey=asText(value.training,64);
    const training=trainingKey
      ?TRAINING[trainingKey as keyof typeof TRAINING]?.name??trainingKey
      :'Não informado';
    const strength=count(value.strength);
    const casualties=count(value.casualties);
    const destroyed=value.destroyed===true;
    const available=strength!==null&&casualties!==null&&casualties<=strength
      ?destroyed?0:strength-casualties:null;
    const skillList=obj(value.skills)?Object.entries(value.skills).filter(
      ([,v])=>typeof v==='number'&&Number.isFinite(v)
    ).slice(0,24).map(([key,v])=>({
      label:LEGACY_SKILLS[key]??key.replace(/_/g,' '),
      level:v as number,
    })):[];
    return [{
      id:asText(value.id,128)??`row-${index}`,
      name:asText(value.name,150)??`Unidade ${index+1}`,
      typeNames,training,symbolSrc:militaryUnitSymbolSrc(unitSymbolType(
        types,typeof value.equipmentTypeId==='string'?value.equipmentTypeId:undefined
      ))??null,strength,casualties,available,destroyed,
      commander:asText(value.commanderName),
      situation:asText(value.situation),
      origin:asText(value.origin),
      health:count(value.health),xp:count(value.xp),
      equipment:Array.isArray(value.equipment)
        ?value.equipment.filter((x):x is string=>typeof x==='string').slice(0,20):[],
      skills:skillList,
    }];
  });
  return {
    units,total:raw.length,limited:raw.length>list.length,
    active:units.length===raw.length?units.filter(u=>!u.destroyed).length:null,
    knownStrength:units.length===raw.length&&units.every(u=>u.strength!==null)
      ?units.reduce((n,u)=>n+(u.strength??0),0):null,
    knownAvailable:units.length===raw.length&&units.every(u=>u.available!==null)
      ?units.reduce((n,u)=>n+(u.available??0),0):null,
  };
}

export function FirebaseArmyRoster({houseName,state}:{
  houseName:string;state:Record<string,unknown>;
}){
  const roster=readFirebaseMilitaryRoster(state);
  return <section aria-label={`Exército da Casa ${houseName}`}
    className="rounded-lg border border-current/25 p-4 space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Exército da Casa</h2>
      <p className="text-sm opacity-75">{houseName} · Dados preservados do Firebase</p>
    </header>
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {([
        ['Unidades cadastradas',roster.total],
        ['Unidades ativas',roster.active],
        ['Efetivo inicial',roster.knownStrength],
        ['Efetivo disponível',roster.knownAvailable],
      ] as const).map(([name,value])=>
        <div key={name} className="rounded border border-current/20 p-3">
          <dt className="text-xs opacity-75">{name}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {value===null?'Não informado':value.toLocaleString('pt-BR')}
          </dd>
        </div>)}
    </dl>
    {roster.total===0?<p className="text-sm">Nenhuma unidade registrada nesta ficha.</p>:
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {roster.units.map((unit,index)=>
          <article key={unit.id+':'+index}
            className="rounded border border-current/20 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                {unit.symbolSrc&&<img src={unit.symbolSrc} loading="lazy"
                  alt={`Símbolo militar de ${unit.name}`}
                  className="h-12 w-12 shrink-0 rounded object-cover"/>}
                <div className="min-w-0">
                  <h3 className="font-semibold break-words">{unit.name}</h3>
                  <p className="text-xs opacity-80">
                    {unit.typeNames.join(' / ')||'Tipo não informado'}
                    {' '}· {unit.training}
                  </p>
                </div>
              </div>
              {unit.destroyed&&
                <span className="rounded border px-2 py-1 text-xs">Destruída</span>}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="opacity-70">Efetivo</dt>
                <dd className="font-medium tabular-nums">
                  {unit.available??'—'} / {unit.strength??'—'}
                </dd></div>
              <div><dt className="opacity-70">Baixas</dt>
                <dd className="font-medium tabular-nums">
                  {unit.casualties??'Não informado'}
                </dd></div>
              <div><dt className="opacity-70">Saúde</dt>
                <dd>{unit.health??'Não informado'}</dd></div>
              <div><dt className="opacity-70">Experiência</dt>
                <dd>{unit.xp===null?'Não informado':`${unit.xp} XP`}</dd></div>
            </dl>
            <p className="text-sm">Comandante: {unit.commander??'Não definido'}</p>
            {unit.situation&&<p className="text-sm">Situação: {unit.situation}</p>}
            <details className="text-sm">
              <summary className="cursor-pointer">Habilidades e equipamentos</summary>
              <div className="mt-2 space-y-2">
                {unit.skills.length>0
                  ?<dl className="grid grid-cols-2 gap-2">
                    {unit.skills.map((skill,i)=><div key={skill.label+':'+i}>
                      <dt className="opacity-75">{skill.label}</dt>
                      <dd className="font-medium">{skill.level}</dd>
                    </div>)}
                  </dl>:<p>Habilidades não informadas.</p>}
                <p>Equipamento: {unit.equipment.length>0
                  ?unit.equipment.join(', '):'Não informado'}</p>
              </div>
            </details>
          </article>)}
      </div>}
    {roster.limited&&<p role="status" className="text-sm">
      A lista excede o limite de exibição do painel. Nenhum registro foi
      modificado no Firebase; consulte a ficha preservada para obter
      os demais dados.
    </p>}
    <p className="text-xs opacity-70">
      Consulta somente leitura. Alterações de unidades, treinamento e batalhas
      permanecem indisponíveis até a homologação do Firebase Cloud.
    </p>
  </section>;
}
