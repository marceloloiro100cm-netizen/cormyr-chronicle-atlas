import {useMemo,useState,type ChangeEvent,type KeyboardEvent} from 'react';
import {Button} from '@/components/ui/button';
import {crzHexKey,crzAxialToOffset,type CrzHex,type CrzSide}
 from '@/lib/crusade/geometry';
import {crzLegalCommands,type CrzCommand} from '@/lib/crusade/turns';
import {crzCapable,type CrzBattleStack,type CrzBattleState,
 type CrzEvent} from '@/lib/crusade/battle-state';
import {CRZ_LOT4_SPELLS} from '@/lib/crusade/leader';
import {crzReplayBegin,crzReplayParse,crzReplayRecord,
 crzReplaySerialize,CRZ_REPLAY_MAX_BYTES,
 type CrzReplaySession} from '@/lib/crusade/replay';
import {crzTrainingAdvanceAi,crzTrainingReplayAt}
 from '@/lib/crusade/training-flow';
import {CRZ_TRAINING_DEFAULTS,CRZ_TRAINING_SCENARIOS,
 crzTrainingReady,type CrzTrainingOptions}
 from '@/lib/crusade/training-demo';
import type {CrzSpellId} from '@/lib/crusade/setup';
import './crz-lab.css';

type Mode='inspect'|'move'|'attack';
const TERRAIN:Readonly<Record<string,{name:string;fill:string}>>={
 plain:{name:'Planície',fill:'#a6a079'},
 forest:{name:'Bosque',fill:'#426953'},
 hill:{name:'Colina',fill:'#a88b5a'},
 rock:{name:'Rocha',fill:'#575960'},
};
const SIDE:Readonly<Record<CrzSide,{name:string;fill:string}>>={
 attacker:{name:'Coroa',fill:'#3e719e'},
 defender:{name:'Ashkar',fill:'#a85540'},
};
const SIZE=25;
const XSTEP=Math.sqrt(3)*SIZE;
const HEX_POINTS=Array.from({length:6},(_,i)=>{
 const angle=(-90+60*i)*Math.PI/180;
 return (SIZE*Math.cos(angle)).toFixed(2)+','+
  (SIZE*Math.sin(angle)).toFixed(2);
}).join(' ');
const pixel=(h:CrzHex)=>{
 const {column,row}=crzAxialToOffset(h);
 return {x:42+XSTEP*(column+(row&1)/2),
  y:40+SIZE*1.5*row};
};
const count=(s:CrzBattleStack)=>s.alive+'/'+s.initialCount;
function eventLabel(event:CrzEvent):string{
 const names:Record<string,string>={
  BATTLE_STARTED:'Batalha iniciada',ROUND_STARTED:'Início da rodada',
  ROUND_ENDED:'Rodada encerrada',ACTIVATION_STARTED:'Unidade ativada',
  ACTIVATION_ENDED:'Ativação encerrada',MOVED:'Movimento',
  ATTACK_RESOLVED:'Ataque',RETALIATION_RESOLVED:'Retaliação',
  WAITED:'Aguardou',DEFENDED:'Defendeu',
  ABILITY_USED:'Habilidade',SPELL_CAST:'Magia do General',
  SPELL_DAMAGE:'Dano mágico',SPELL_HEALED:'Cura',
  EFFECT_APPLIED:'Efeito aplicado',EFFECT_EXPIRED:'Efeito expirado',
  MORALE_CHANGED:'Moral alterada',STACK_ROUTED:'Debandada',
  STACK_DESTROYED:'Pilha destruída',BATTLE_ENDED:'Batalha encerrada',
  EXTRA_TURN_GRANTED:'Ativação extra',TURN_SKIPPED:'Turno perdido',
 };
 const extra='unitId' in event?event.unitId:
  'leaderId' in event?event.leaderId:'';
 const damage='appliedDamage' in event?' · '+event.appliedDamage+' PV':'';
 return '#'+event.seq+' '+(names[event.type]??event.type)+
  (extra?' · '+extra:'')+damage;
}

function CrzBoard({state,selectedId,mode,moves,attacks,onTile}:{
 state:CrzBattleState;selectedId:string|null;mode:Mode;
 moves:readonly CrzHex[];attacks:readonly string[];
 onTile:(hex:CrzHex)=>void;
}){
 const [zoom,setZoom]=useState<100|150|200>(100);
 const [focusedKey,setFocusedKey]=useState<string|null>(null);
 const defaultFocus=crzHexKey(state.stacks.find(s=>s.id===state.activeStackId)?.position??state.map.tiles[0]!);
 const movable=new Set(moves.map(crzHexKey));
 const targets=new Set(attacks);
 const occupied=new Map(state.stacks.filter(s=>s.alive>0)
  .map(s=>[crzHexKey(s.position),s]));
 const width=XSTEP*(state.map.width+1)+58;
 const height=SIZE*(1.5*(state.map.height-1)+3.4);
 return <div className="crz-board-shell">
  <div className="crz-map-tools" role="group" aria-label="Ferramentas do mapa CRZ">
   <Button type="button" variant="outline" size="sm" aria-label="Reduzir zoom CRZ"
    disabled={zoom===100} onClick={()=>setZoom(v=>v===200?150:100)}>−</Button>
   <output aria-label="Zoom do mapa CRZ">{zoom}%</output>
   <Button type="button" variant="outline" size="sm" aria-label="Ampliar zoom CRZ"
    disabled={zoom===200} onClick={()=>setZoom(v=>v===100?150:200)}>+</Button>
   <Button type="button" variant="outline" size="sm" onClick={()=>setZoom(100)}
    disabled={zoom===100}>Ajustar mapa CRZ</Button>
  </div>
  <p className="crz-map-help" id="crz-keyboard-help">Teclado: Tab entra no mapa;
   setas navegam pelos hexágonos; Enter ou Espaço executam a ação. Use o zoom
   para ampliar sem alterar o tamanho das tropas.</p>
  <div className="crz-map-scroll" role="region" tabIndex={0}
  aria-label="Área navegável do mapa CRZ">
  <svg className="crz-map" viewBox={`0 0 ${width} ${height}`}
   style={{width:zoom+'%'}} role="group" aria-label={`Mapa CRZ ${state.map.width} por ${state.map.height}`}>
   {state.map.tiles.map(tile=>{
    const key=crzHexKey(tile),{x,y}=pixel(tile),unit=occupied.get(key);
    const isMove=mode==='move'&&movable.has(key);
    const isAttack=mode==='attack'&&Boolean(unit&&targets.has(unit.id));
    const active=unit?.id===state.activeStackId,selected=unit?.id===selectedId;
    const label=(isMove?'Mover para ':isAttack?'Atacar ':'Inspecionar ')+
     (unit?unit.name+' · ':'')+TERRAIN[tile.terrain]!.name+
     ' ('+crzAxialToOffset(tile).column+','+
       crzAxialToOffset(tile).row+')';
    const press=()=>onTile({q:tile.q,r:tile.r});
    const keyPress=(event:KeyboardEvent<SVGGElement>)=>{
     if(event.key==='Enter'||event.key===' '){event.preventDefault();press();return;}
     const direction:Record<string,CrzHex>={
      ArrowRight:{q:1,r:0},ArrowLeft:{q:-1,r:0},
      ArrowUp:{q:0,r:-1},ArrowDown:{q:0,r:1},
     };
     const delta=direction[event.key];if(!delta)return;
     const nextKey=crzHexKey({q:tile.q+delta.q,r:tile.r+delta.r});
     const siblings=event.currentTarget.ownerSVGElement?.querySelectorAll<SVGGElement>('[data-crz-hex]');
     const next=siblings&&Array.from(siblings).find(node=>node.getAttribute('data-crz-hex')===nextKey);
     if(next){event.preventDefault();setFocusedKey(nextKey);next.focus();}
    };
    return <g key={key} role="button"
     data-crz-hex={key} tabIndex={key===(focusedKey??defaultFocus)?0:-1}
     aria-label={label} aria-describedby="crz-keyboard-help"
     onFocus={()=>setFocusedKey(key)}
     onClick={press} onKeyDown={keyPress}
     className={'crz-map-tile'+(isMove?' crz-map-move':'')+
       (isAttack?' crz-map-attack':'')+(active?' crz-map-active':'')+
       (selected?' crz-map-selected':'')}>
      <polygon points={HEX_POINTS} transform={`translate(${x} ${y})`}
       fill={TERRAIN[tile.terrain]!.fill}/>
      {unit&&<>
       <circle cx={x} cy={y} r={16}
        fill={SIDE[unit.side].fill} stroke={active?'#f9df9c':'#e4d8c2'}
        strokeWidth={active?3:1.4}/>
       <text x={x} y={y-3} textAnchor="middle" fill="#fff" fontSize={10}
        fontWeight={700} pointerEvents="none">{unit.alive}</text>
       <text x={x} y={y+9} textAnchor="middle" fill="#fff" fontSize={8}
        pointerEvents="none">{unit.id.slice(0,8)}</text>
      </>}
      {isMove&&!unit&&<circle cx={x} cy={y} r={5}
       fill="#f6e1a0" pointerEvents="none"/>}
     </g>;
   })}
  </svg>
 </div>
 </div>;
}

const globalSpell=(spell:CrzSpellId)=>spell==='bless'||spell==='bane';
const enemySpell=(spell:CrzSpellId)=>spell==='cause_fear'||spell==='firebolt';
const spellCost:Partial<Record<CrzSpellId,number>>={
 bless:3,bane:3,shield_of_faith:2,heroism:4,cause_fear:3,
 cure_wounds:2,firebolt:2,
};

export function BattleCrzLab({onBack}:{onBack?:()=>void}){
 const [options,setOptions]=useState<CrzTrainingOptions>(CRZ_TRAINING_DEFAULTS);
 const [session,setSession]=useState<CrzReplaySession|null>(null);
 const [replayStep,setReplayStep]=useState<number|null>(null);
 const [mode,setMode]=useState<Mode>('inspect');
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [spell,setSpell]=useState<CrzSpellId>('bless');
 const [spellTarget,setSpellTarget]=useState('');
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [showImport,setShowImport]=useState(false);
 const [highContrast,setHighContrast]=useState(false);
 const frame=useMemo(()=>!session?null:replayStep===null?session.state:
  crzTrainingReplayAt(session.replay,replayStep),
 [session,replayStep]);
 const active=frame?.stacks.find(s=>s.id===frame.activeStackId);
 const inspected=frame?.stacks.find(s=>s.id===selectedId)??active;
 const canAct=Boolean(session&&replayStep===null&&
  frame?.phase==='active'&&active&&frame.controls[active.side]==='human');
 const aiTurn=Boolean(session&&replayStep===null&&
  frame?.phase==='active'&&active&&frame.controls[active.side]==='ai');
 const legal=canAct&&frame?crzLegalCommands(frame):[];
 const moves=legal.filter((c):c is Extract<CrzCommand,{type:'MOVE'}>=>
  c.type==='MOVE');
 const attacks=legal.filter((c):c is Extract<CrzCommand,{type:'ATTACK'}>=>
  c.type==='ATTACK');
 const abilities=legal.filter((c):c is Extract<CrzCommand,{type:'ABILITY'}>=>
  c.type==='ABILITY');
 const spells=legal.filter((c):c is Extract<CrzCommand,{type:'CAST'}>=>
  c.type==='CAST').filter(c=>CRZ_LOT4_SPELLS.includes(c.spellId));
 const caster=active?frame?.leaders[active.side]:null;
 const canCast=canAct&&spells.some(c=>c.spellId===spell)&&
  Boolean(caster&&caster.energy>=(spellCost[spell]??Infinity));
 const targets=active?frame?.stacks.filter(s=>crzCapable(s)&&
  s.side===(enemySpell(spell)?
   active.side==='attacker'?'defender':'attacker':active.side))??[]:[];
 const apply=(command:CrzCommand)=>{
  if(!session||!canAct)return;
  try{
   const next=crzTrainingAdvanceAi(crzReplayRecord(session,command,'human'));
   setSession(next);setReplayStep(null);setSelectedId(next.state.activeStackId);
   setSpellTarget('');setMode('inspect');setError('');
   setMessage('Comando registrado no replay verificável.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Comando recusado.');
  }
 };
 const begin=()=>{
  try{
   const initial=crzReplayBegin(crzTrainingReady(options));
   const next=crzTrainingAdvanceAi(initial);
   setSession(next);setSelectedId(next.state.activeStackId);
   setMode('inspect');setReplayStep(null);setError('');
   setMessage('Treino fictício iniciado. Nenhuma ficha oficial será alterada.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Não foi possível iniciar o treino.');
  }
 };
 const clickHex=(hex:CrzHex)=>{
  if(!frame)return;
  const key=crzHexKey(hex);
  const unit=frame.stacks.find(s=>s.alive>0&&crzHexKey(s.position)===key);
  if(canAct&&mode==='move'&&active){
   const command=moves.find(c=>crzHexKey(c.to)===key);
   if(command)apply(command);
   else setError('Destino não permitido: bloqueio, zona de controle ou distância.');
   return;
  }
  if(canAct&&mode==='attack'&&unit&&active){
   const command=attacks.find(c=>c.targetId===unit.id);
   if(command)apply(command);
   else setError('Alvo fora de alcance ou sem linha de visão.');
   return;
  }
  if(unit){setSelectedId(unit.id);setMode('inspect');}
 };
 const cast=()=>{
  if(!active||!canCast)return;
  if(!globalSpell(spell)&&!spellTarget){
   setError('Escolha uma pilha como alvo da magia.');return;
  }
  apply({type:'CAST',unitId:active.id,spellId:spell,
   targetId:globalSpell(spell)?null:spellTarget});
 };
 const exportReplay=()=>{
  if(!session)return;
  try{
   const contents=crzReplaySerialize(session.replay);
   const blob=new Blob([contents],{type:'application/json'});
   const url=URL.createObjectURL(blob),anchor=document.createElement('a');
   anchor.href=url;anchor.download=session.state.id+'-crz-replay.json';
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   URL.revokeObjectURL(url);
   setError('');setMessage('Replay JSON verificado e exportado localmente.');
  }catch(cause){setError(cause instanceof Error?cause.message:'Falha na exportação.');}
 };
 const importReplay=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.currentTarget.files?.[0];
  if(!file)return;
  try{
   if(file.size>CRZ_REPLAY_MAX_BYTES)throw new Error('Arquivo maior que o limite de 8 MB.');
   const next=crzReplayParse(await file.text());
   setSession(next);setReplayStep(next.replay.steps.length);
   setSelectedId(next.state.activeStackId);setMode('inspect');
   setShowImport(false);setError('');
   setMessage('Replay validado. Use a linha do tempo ou retome o treino.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Replay não verificável.');
  }finally{event.currentTarget.value='';}
 };
 const reset=()=>{
  setSession(null);setReplayStep(null);setSelectedId(null);
  setError('');setMessage('');setMode('inspect');
 };
 return <section className={'battle-module crusade-mode crz-lab'+
  (highContrast?' crz-high-contrast':'')}
  aria-label="Laboratório CRZ-1.0 do Narrador">
  <header className="battle-header">
   <p className="battle-eyebrow">CORMYR · LABORATÓRIO DO NARRADOR</p>
   <h1>CRZ-1.0 · Cruzada Experimental</h1>
   <p>Tabuleiro tático de treinamento, separado da campanha e do PTE-2.0.</p>
   <p><strong>Todas as tropas são fictícias. Sem baixas oficiais, banco,
    alterações de casas, XP ou avanço do calendário.</strong></p>
   <div className="crz-toolbar">
    {onBack&&<Button variant="outline" onClick={onBack}>Voltar ao módulo</Button>}
    {session&&<Button variant="outline" onClick={reset}>Novo treino</Button>}
    {session&&<Button variant="outline" onClick={exportReplay}>Exportar replay JSON</Button>}
    <Button variant="outline" type="button" aria-pressed={highContrast}
     onClick={()=>setHighContrast(value=>!value)}>Alto contraste CRZ</Button>
    <Button variant="outline" onClick={()=>setShowImport(v=>!v)}>
     Importar replay JSON
    </Button>
   </div>
   {showImport&&<label className="crz-file">
    Arquivo de replay (máximo 8 MB)
    <input aria-label="Arquivo de replay CRZ" type="file" accept=".json,application/json"
     onChange={event=>{void importReplay(event);}}/>
   </label>}
  </header>
  {error&&<p className="crz-alert" role="alert">{error}</p>}
  {message&&<p className="crz-status" role="status">{message}</p>}
  {!session&&<section className="battle-surface" aria-label="Preparar treino CRZ">
   <h2>Preparar batalha-modelo</h2>
   <p className="battle-note">Defensores da Coroa contra um exército-modelo Ashkar.
    Unidades criadas apenas para este laboratório.</p>
   <div className="crz-form">
    <label>Cenário
     <select value={options.scenario} aria-label="Cenário CRZ"
      onChange={e=>setOptions(o=>({...o,scenario:e.target.value as CrzTrainingOptions['scenario']}))}>
      {CRZ_TRAINING_SCENARIOS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
    </label>
    <label>Tamanho do mapa
     <select value={options.width} aria-label="Tamanho do mapa CRZ"
      onChange={e=>setOptions(o=>({...o,width:Number(e.target.value) as 11|15}))}>
      <option value={11}>11 × 9</option><option value={15}>15 × 11</option>
     </select>
    </label>
    <label>Resolução de dano
     <select value={options.resolution} aria-label="Resolução CRZ"
      onChange={e=>setOptions(o=>({...o,resolution:e.target.value as 'expected'|'hybrid'}))}>
      <option value="expected">Esperada (sem rolagens)</option>
      <option value="hybrid">Híbrida (PCG32)</option>
     </select>
    </label>
    <label>Adversário
     <select value={options.opponent} aria-label="Oponente CRZ"
      onChange={e=>setOptions(o=>({...o,opponent:e.target.value as 'ai'|'human'}))}>
      <option value="ai">IA local</option>
      <option value="human">Segundo jogador local</option>
     </select>
    </label>
    <label>Seed hexadecimal
     <input value={options.seed} aria-label="Seed CRZ"
      maxLength={16} pattern="[a-fA-F0-9]{1,16}"
      onChange={e=>setOptions(o=>({...o,seed:e.target.value}))}/>
    </label>
   </div>
   <Button onClick={begin}>Iniciar treinamento CRZ</Button>
   <p className="battle-note">O modo CRZ-WOTR e a compatibilidade PTE ainda não possuem
    redutores completos e não aparecem como opções jogáveis.</p>
  </section>}
  {frame&&session&&<>
   <div className="crz-summary battle-surface">
    <strong>Rodada {frame.round}</strong>
    <span>Fase: {frame.phase==='active'?'Em combate':'Encerrada'}</span>
    <span>Unidade ativa: {active?.name??'Nenhuma'}</span>
    <span>Comandos gravados: {session.replay.steps.length}</span>
    <span>Regras: {frame.rulesetId} · hash {frame.rulesetHash.slice(0,12)}…</span>
    {frame.phase==='completed'&&<strong>
     Resultado: {frame.winner?SIDE[frame.winner].name:'Empate'} · {frame.resultReason}
    </strong>}
   </div>
   <section className="crz-layout" aria-label="Arena e comandos CRZ">
    <div className="battle-surface">
     <h2>Campo de batalha</h2>
     <p className="battle-note">Azul: Coroa · vermelho: Ashkar · pontos dourados:
      deslocamentos legais · contorno vermelho: alvos possíveis. O mapa é navegável por teclado.</p>
     <CrzBoard state={frame} selectedId={selectedId} mode={mode}
      moves={moves.map(c=>c.to)} attacks={attacks.map(c=>c.targetId)} onTile={clickHex}/>
    </div>
    <div className="crz-aside">
     <section className="battle-surface">
      <h2>Ordens de combate</h2>
      <p className="battle-note">{replayStep!==null?
       'Visualização do replay: ordens bloqueadas.':
       canAct?'Selecione uma ordem e depois um hexágono no mapa.':
       frame.phase==='completed'?'Combate encerrado.':'Aguardando turno da IA.'}</p>
      <div className="crz-toolbar">
       {aiTurn&&<Button variant="outline" onClick={()=>{
        if(!session)return;
        try{
         const next=crzTrainingAdvanceAi(session);
         setSession(next);setSelectedId(next.state.activeStackId);
         setError('');setMessage('Turnos da IA registrados no replay.');
        }catch(cause){
         setError(cause instanceof Error?cause.message:'Não foi possível avançar a IA.');
        }
       }}>Executar turno da IA</Button>}
       <Button disabled={!canAct||!moves.length}
        variant={mode==='move'?'default':'outline'}
        onClick={()=>{setMode('move');setError('');}}>Mover ({moves.length})</Button>
       <Button disabled={!canAct||!attacks.length}
        variant={mode==='attack'?'default':'outline'}
        onClick={()=>{setMode('attack');setError('');}}>Atacar ({attacks.length})</Button>
       {abilities.map(c=><Button key={c.ability} variant="outline"
        onClick={()=>apply(c)}>{c.ability==='CHARGE'?'Preparar carga':'Preparar salva'}</Button>)}
       {(['WAIT','DEFEND','END_ACTIVATION'] as const).map(type=>{
        const command=legal.find(c=>c.type===type);
        return <Button key={type} disabled={!canAct||!command}
         variant="outline" onClick={()=>command&&apply(command)}>
         {type==='WAIT'?'Esperar':type==='DEFEND'?'Defender':'Encerrar ativação'}
        </Button>;
       })}
      </div>
     </section>
     <section className="battle-surface" aria-label="Painel do General CRZ">
      <h2>General</h2>
      <p>{caster?caster.name+' · Energia '+caster.energy+'/'+caster.energyMax:
       'Nenhum General no turno atual.'}</p>
      <label>Magia preparada
       <select aria-label="Magia do General" value={spell}
        disabled={!canAct||!spells.length} onChange={e=>{
         setSpell(e.target.value as CrzSpellId);setSpellTarget('');
        }}>
        {CRZ_LOT4_SPELLS.map(id=><option key={id} value={id}>{id}</option>)}
       </select>
      </label>
      {!globalSpell(spell)&&<label>Alvo da magia
       <select aria-label="Alvo da magia" value={spellTarget}
        disabled={!canAct} onChange={e=>setSpellTarget(e.target.value)}>
        <option value="">Selecione uma pilha</option>
        {targets.map(t=><option key={t.id} value={t.id}>{t.name} · {count(t)}</option>)}
       </select>
      </label>}
      <Button disabled={!canCast||(!globalSpell(spell)&&!spellTarget)}
       onClick={cast}>Conjurar ({spellCost[spell]??'?'} energia)</Button>
      <p className="battle-note">Somente magias executáveis do Lote 4;
       demais permanecem indisponíveis.</p>
     </section>
     <section className="battle-surface">
      <h2>Unidades</h2>
      <div className="crz-units">
       {frame.stacks.map(s=><button type="button" key={s.id}
        aria-pressed={inspected?.id===s.id} className="crz-unit"
        onClick={()=>setSelectedId(s.id)}>
        <span className={s.side==='attacker'?'crz-dot crown':'crz-dot ashkar'}/>
        <strong>{s.name}</strong><span>{count(s)}</span>
        <small>{s.moraleState==='routed'?'Debandada':
         s.moraleState==='shaken'?'Abalada':'Firme'} · {s.hpPool} PV</small>
       </button>)}
      </div>
      {inspected&&<p className="battle-note">Inspecionada: {inspected.name} ·
       CA {inspected.acBase} · Movimento {inspected.movementHex} hex ·
       {inspected.initialCount-inspected.alive} baixas fictícias</p>}
     </section>
    </div>
   </section>
   <section className="battle-surface" aria-label="Replay CRZ">
    <h2>Replay verificável</h2>
    <p className="battle-note">Cadeia SHA-256 verificada ao importar e exportar.
     O arquivo comprova integridade interna, não identidade/autoria digital.</p>
    <div className="crz-toolbar">
     <Button variant="outline" onClick={()=>setReplayStep(0)}>
      Revisar desde o início
     </Button>
     <Button variant="outline" disabled={replayStep===null||replayStep===0}
      onClick={()=>setReplayStep(n=>n===null?0:Math.max(0,n-1))}>Anterior</Button>
     <Button variant="outline" disabled={replayStep===null||
       replayStep>=session.replay.steps.length}
      onClick={()=>setReplayStep(n=>n===null?0:
       Math.min(session.replay.steps.length,n+1))}>Próximo</Button>
     {replayStep!==null&&<Button onClick={()=>setReplayStep(null)}>
      {session.state.phase==='completed'?'Voltar ao resultado':'Retomar treino'}
     </Button>}
     <output aria-label="Posição do replay">
      {replayStep??session.replay.steps.length} / {session.replay.steps.length}
     </output>
    </div>
    <ol className="crz-event-list">
     {frame.events.slice(-8).map(event=><li key={event.seq}>{eventLabel(event)}</li>)}
    </ol>
   </section>
  </>}
 </section>;
}
