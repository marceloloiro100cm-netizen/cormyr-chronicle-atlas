import {useRef,useState} from 'react';
import type { BattleMap, Hex, Terrain } from '@/lib/battle/domain/types';
import {createScenario,SCENARIOS,type BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import {validateBattleMap} from '@/lib/battle/geometry/map-validation';
import {hexKey} from '@/lib/battle/geometry/hex';
import {previewBattleMapGridConversion,type GridConversionPreview} from '@/lib/battle/geometry/map-conversion';
import {BattleBoard} from './BattleBoard';
import {downloadBattleJson,parseBattleMapJson,serializeBattleMap} from '@/lib/battle/serialization/map-io';
import {Button} from '@/components/ui/button';

type Brush=Terrain|'attacker'|'defender'|'erase'|'select';
const BRUSHES:{id:Brush;name:string}[]=[
 {id:'select',name:'Selecionar'},{id:'plain',name:'Planície'},{id:'forest',name:'Floresta'},
 {id:'hill',name:'Colina'},{id:'rock',name:'Rocha'},
 {id:'attacker',name:'Zona A'},{id:'defender',name:'Zona B'},{id:'erase',name:'Apagar'},
];
export function BattleMapEditor({map,onChange,locked=false}:{
 map:BattleMap;onChange:(map:BattleMap)=>void;locked?:boolean;
}){
 const [brush,setBrush]=useState<Brush>('forest'),[fillTerrain,setFillTerrain]=useState<Terrain>('plain');
 const [undo,setUndo]=useState<BattleMap[]>([]),[message,setMessage]=useState('');
 const [gridPreview,setGridPreview]=useState<{source:string;result:GridConversionPreview}|null>(null);
 const file=useRef<HTMLInputElement|null>(null);
 const problems=validateBattleMap(map);
 const save=(next:BattleMap)=>{
  if(locked)return;
  setUndo(h=>[...h.slice(-24),map]);onChange(next);setMessage('');setGridPreview(null);
 };
 const paint=(h:Hex)=>{
  if(locked||brush==='select')return;
  const key=hexKey(h),tile=map.tiles.find(t=>hexKey(t)===key);
  if(!tile)return;
  if(brush==='rock'||brush==='plain'||brush==='forest'||brush==='hill'){
    const terrain=brush;
    const tiles=map.tiles.map(t=>hexKey(t)===key?{...t,terrain}:t);
    const deployment={
      attacker:terrain==='rock'?map.deployment.attacker.filter(x=>hexKey(x)!==key):map.deployment.attacker,
      defender:terrain==='rock'?map.deployment.defender.filter(x=>hexKey(x)!==key):map.deployment.defender,
    };
    save({...map,tiles,deployment});return;
  }
  const deployment={
    attacker:map.deployment.attacker.filter(x=>hexKey(x)!==key),
    defender:map.deployment.defender.filter(x=>hexKey(x)!==key),
  };
  if(brush==='erase'){
    save({...map,tiles:map.tiles.map(t=>hexKey(t)===key?{...t,terrain:'plain' as const}:t),deployment});
    return;
  }
  if(tile.terrain==='rock'){setMessage('Remova a rocha antes de criar uma zona de implantação.');return;}
  const existing=map.deployment[brush].some(x=>hexKey(x)===key);
  if(!existing)deployment[brush]=[...deployment[brush],{q:h.q,r:h.r}];
  save({...map,deployment});
 };
 const undoLast=()=>{
  const previous=undo.at(-1);if(!previous)return;
  setUndo(x=>x.slice(0,-1));onChange(previous);setMessage('');setGridPreview(null);
 };
 const loadFile=async(f:File)=>{
  try{
    if(f.size>150_000)throw new Error('Arquivo excede 150 KB.');
    const parsed=parseBattleMapJson(await f.text());
    save(parsed);setMessage('Mapa importado e validado.');
  }catch(e){setMessage(e instanceof Error?e.message:'Falha ao importar o mapa.');}
 };
 return <section className="battle-surface battle-editor" aria-label="Editor de mapas táticos">
  <div className="battle-section-title"><h3>Editor de mapas</h3><p>Pincéis disponíveis apenas antes do início da batalha.</p></div>
  {locked?<p role="alert">O mapa está bloqueado durante o combate.</p>:<>
    <div className="battle-form-row">
      <label>Cenário
        <select aria-label="Cenário" value={Object.hasOwn(SCENARIOS,map.id)?map.id:'custom'}
          onChange={e=>{const id=e.target.value as BattleScenarioId;if(Object.hasOwn(SCENARIOS,id))save(createScenario(id,map.width,map.grid??'hex'));}}>
          {!Object.hasOwn(SCENARIOS,map.id)&&<option value="custom">Personalizado</option>}
          {Object.entries(SCENARIOS).map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </select></label>
      <label>Dimensões
        <select aria-label="Dimensões do mapa" value={String(map.width)}
          onChange={e=>save(createScenario('plain-open',e.target.value==='15'?15:11,map.grid??'hex'))}>
          <option value="11">11 × 9</option><option value="15">15 × 11</option>
        </select></label>
      <Button variant="outline" onClick={()=>save(createScenario('plain-open',map.width,map.grid??'hex'))}>Restaurar</Button>
      <Button variant="outline" aria-label="Pré-visualizar conversão de malha"
        onClick={()=>{const to=map.grid==='square'?'hex':'square';
         setGridPreview({source:JSON.stringify(map),result:previewBattleMapGridConversion(map,to)});
         setMessage('');}}>
        Prévia: converter para {map.grid==='square'?'hexágonos':'quadrados'}
      </Button>
    </div>
    {gridPreview&&<section className="battle-map-conversion-preview" aria-label="Prévia de conversão de malha">
      <h4>Conversão não aplicada — {gridPreview.result.from==='hex'?'hexágonos':'quadrados'} para {gridPreview.result.to==='square'?'quadrados':'hexágonos'}</h4>
      <p>{gridPreview.result.tilesPreserved} terrenos e {gridPreview.result.attackerZonesPreserved} zonas A /
       {gridPreview.result.defenderZonesPreserved} zonas B preservados por coluna e linha.</p>
      <p>{gridPreview.result.repositionedCoordinates} coordenadas internas serão recalculadas.
       Partidas iniciadas e replays não serão alterados.</p>
      {gridPreview.result.issues.length>0&&<p role="alert">
       Conversão bloqueada: {gridPreview.result.issues.join('; ')}
      </p>}
      <div className="battle-form-row">
       <Button variant="outline" disabled={gridPreview.result.issues.length>0||
        gridPreview.source!==JSON.stringify(map)}
        onClick={()=>save(gridPreview.result.converted)}>Aplicar conversão validada</Button>
       <Button variant="outline" onClick={()=>setGridPreview(null)}>Cancelar conversão</Button>
      </div>
     </section>}
    <div className="battle-tools" role="group" aria-label="Pincel de terreno">
      {BRUSHES.map(b=><button type="button" key={b.id} aria-pressed={brush===b.id}
        className={brush===b.id?'battle-tool--active':''} onClick={()=>setBrush(b.id)}>{b.name}</button>)}
    </div>
    <div className="battle-form-row">
      <label>Preenchimento
        <select aria-label="Terreno para preencher" value={fillTerrain}
          onChange={e=>setFillTerrain(e.target.value as Terrain)}>
          <option value="plain">Planície</option><option value="forest">Floresta</option>
          <option value="hill">Colina</option><option value="rock">Rocha</option>
        </select></label>
      <Button variant="outline" onClick={()=>{
        save({...map,tiles:map.tiles.map(t=>({...t,terrain:fillTerrain})),
          deployment:fillTerrain==='rock'?{attacker:[],defender:[]}:map.deployment});
      }}>Preencher</Button>
      <Button variant="outline" disabled={!undo.length} onClick={undoLast}>Desfazer pincel</Button>
      <Button variant="outline" onClick={()=>{try{downloadBattleJson('mapa-batalha.json',serializeBattleMap(map));setMessage('Mapa exportado.');}
        catch(e){setMessage(e instanceof Error?e.message:'Mapa não pode ser exportado.');}}}>Exportar JSON</Button>
      <Button variant="outline" onClick={()=>file.current?.click()}>Importar JSON</Button>
      <input type="file" className="sr-only" accept=".json,application/json" ref={file}
        aria-label="Selecionar arquivo JSON do mapa"
        onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(f);e.target.value='';}}/>
    </div>
    <BattleBoard map={map} showZones onHexClick={paint}/>
  </>}
  <div aria-live="polite" role={problems.length?'alert':'status'} className="battle-map-validity">
    {problems.length?<>Mapa ainda inválido: {problems.slice(0,5).join('; ')}</>:'Mapa válido para implantação.'}
  </div>
  {message&&<p role="status">{message}</p>}
 </section>;
}
