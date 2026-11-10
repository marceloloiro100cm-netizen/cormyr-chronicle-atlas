import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {miniatureCatalog,miniatureDemo} from '@/lib/battle/visual3d/demo';
import {monsterGalleryPage,navalVisualPreview,specialTerrainPreview} from '@/lib/battle/visual3d/advanced-demos';
import {BattleBoard} from '../BattleBoard';
import {MiniatureViewport} from './MiniatureViewport';
import {VisualGalleryFallback} from './VisualGalleryFallback';

type Gallery='base'|'military'|'monsters-1'|'monsters-2'|'naval'|'special';
const choices:readonly Readonly<{id:Gallery;label:string}>[]=[
 {id:'base',label:'4 protótipos'},{id:'military',label:'17 unidades'},
 {id:'monsters-1',label:'Monstros I'},{id:'monsters-2',label:'Monstros II'},
 {id:'naval',label:'Costa naval'},{id:'special',label:'Terrenos especiais'},
];
/** The entire gallery is fake visual data. No state reducers, DB or official units. */
export function MiniatureDemo({narrator}:{narrator:boolean}){
 const [show,setShow]=useState(false);
 const [demo,setDemo]=useState(miniatureDemo);
 const [selected,setSelected]=useState('demo-infantry');
 const [gallery,setGallery]=useState<Gallery>('base');
 const scene=gallery==='base'?demo:gallery==='military'?miniatureCatalog():
  gallery==='monsters-1'?monsterGalleryPage(1):
  gallery==='monsters-2'?monsterGalleryPage(2):
  gallery==='naval'?navalVisualPreview():specialTerrainPreview();
 const galleryMode=gallery==='base'||gallery==='military';
 if(!narrator)return null;
 const selectGallery=(value:Gallery)=>{
  setGallery(value);
  const first=value==='base'?demo.tokens[0]:value==='military'?miniatureCatalog().tokens[0]:
   value==='monsters-1'?monsterGalleryPage(1).tokens[0]:
   value==='monsters-2'?monsterGalleryPage(2).tokens[0]:
   value==='naval'?navalVisualPreview().tokens[0]:specialTerrainPreview().tokens[0];
  if(first)setSelected(first.id);
 };
 const fallback=galleryMode?
  <BattleBoard map={gallery==='base'?demo.map:miniatureCatalog().map}
   stacks={scene.tokens.map(t=>({...t,
    primaryTypeId:t.kind==='archer'?'archers':t.kind,
    initialCount:t.count,currentHp:t.count*10,hpPerSoldier:10,
    moraleState:'steady' as const}))} selectedId={selected}/>:
  <VisualGalleryFallback map={scene.map} tokens={scene.tokens} selectedId={selected}
   onSelect={setSelected}/>;
 return <section className="miniatures3d-demo" aria-label="Protótipo visual isolado">
  <Button variant="outline" aria-expanded={show} onClick={()=>setShow(v=>!v)}>
   {show?'Fechar protótipo':'Ver protótipo 3D'}
  </Button>
  {show&&<>
   <div className="miniatures3d-toolbar" role="group" aria-label="Galeria de miniaturas">
    {choices.slice(0,2).map(choice=><Button key={choice.id} variant="outline"
     aria-pressed={gallery===choice.id} onClick={()=>selectGallery(choice.id)}>
     {choice.label}
    </Button>)}
    <label className="miniatures3d-gallery-select">
     <span>Monstros e cenários</span>
     <select aria-label="Monstros e cenários"
      value={galleryMode?'':gallery}
      onChange={e=>selectGallery(e.target.value as Gallery)}>
      <option value="">Escolher prévia</option>
      {choices.slice(2).map(choice=><option key={choice.id}
       value={choice.id}>{choice.label}</option>)}
     </select>
    </label>
    {gallery==='base'&&<Button variant="outline" onClick={()=>setDemo(d=>({...d,
     tokens:d.tokens.map(t=>t.id===selected?
      {...t,position:{...t.position,q:t.position.q===8?2:t.position.q+1}}:t),
    }))}>Mover peça</Button>}
   </div>
   <p className="miniatures3d-preview-note" role="note">
    {galleryMode?'Prévia de peças rígidas com dados fictícios.':
     'Maquete exclusivamente visual. Não cria monstros, regras navais ou fichas de campanha.'}
   </p>
   <MiniatureViewport map={scene.map} tokens={scene.tokens} selectedId={selected}
    onHexClick={hex=>{
     const token=scene.tokens.find(t=>(t.footprintCells?.length?
      t.footprintCells:[t.position]).some(p=>p.q===hex.q&&p.r===hex.r));
     if(token)setSelected(token.id);
    }} fallback={fallback}/>
  </>}
 </section>;
}
