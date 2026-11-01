import type { ReactNode } from "react";
import { isNarrativeNpc } from "@/lib/house/narrative-npc";
import { useState } from "react";
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {parseChronicleSheet} from '@/lib/house/character-sheet';
import { NobleHouseHub } from "@/components/house/hub";
import { Button } from "@/components/ui/button";
import { CampaignContent, PrivateImage } from "@/components/campaign-content";
import { FichaCasaCard, portraitPath } from "@/components/ficha";
import { isFichaCasa, isFichaPersonagem, parseFichaCasa } from "@/lib/ficha";
import type { RecordRow } from "./shared";
import type { Panel } from "./panel-data";
import { RecordEditor } from "./records";
import { FichaCasaForm } from "./ficha-form";
import {CharacterV2PlayerSheet} from '@/components/character-v2/player-sheet';

export function FichaTab({
  current,
  records,
  canEdit,
  onSave,
  npcManager,
}: {
  npcManager?: ReactNode;
  playerId?:string|undefined;
  admin?:boolean;
  current: Panel["houses"][number];
  records: RecordRow[];
  canEdit: boolean;
  onSave: () => unknown;
}) {
  const [view, setView] = useState<"house" | "character" | "legacy">("house");
  const {data:ages}=useQuery({
   queryKey:['house-character-ages',current.id],
   enabled:view==='character',
   queryFn:async()=>{
    const {data,error}=await supabase.rpc('get_house_character_ages',{p_house:current.id});
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('Resposta de idades da Casa inválida.');
    return data as {record_id:string;character_id:string;age:number|null;
     as_of_year:number;status:string;death_year:number|null}[];
   },refetchInterval:15000
  });
  const ageByRecord=new Map((ages??[]).map(a=>[a.record_id,a]));
  const ageLine=(id:string)=>{
   const age=ageByRecord.get(id);
   if(!age)return null;
   return <p className="house-caption" aria-label="Idade canônica do personagem">
    {age.age!==null?age.status==='deceased'
      ?'Falecido aos '+age.age+' anos'
      :'Idade cronológica: '+age.age+' anos'
     :'Idade: a conferir ('+age.status+')'} · referência: {age.as_of_year} CV
   </p>;
  };
  const structured=records.map(row=>({row,sheet:parseChronicleSheet(row.content)})).filter((x):x is {row:RecordRow;sheet:NonNullable<typeof x.sheet>}=>x.sheet!==null);
  const fichaCasa = records.find((r) => isFichaCasa(r.title, r.content));
  const fichaLorde = records.find((r) => isFichaPersonagem(r.title, r.content)&&!parseChronicleSheet(r.content));
  const retratos = records
    .map((r) => ({ titulo: r.title, path: portraitPath(r.content) }))
    .filter((r): r is { titulo: string; path: string } => Boolean(r.path));
  const npcs = records.filter(
    (r) =>
      r.kind === "character" && !isFichaPersonagem(r.title, r.content) && !portraitPath(r.content),
  );
  return (
    <section>
      <nav className="campaign-tabs" aria-label="Tipo de ficha">
        <Button
          variant={view === "house" ? "default" : "outline"}
          aria-pressed={view === "house"}
          onClick={() => setView("house")}
        >
          Ficha da Casa
        </Button>
        <Button
          variant={view === "character" ? "default" : "outline"}
          aria-pressed={view === "character"}
          onClick={() => setView("character")}
        >
          Ficha do Personagem
        </Button>
      </nav>
      {view === "house" && (
        <NobleHouseHub
          npcManager={npcManager}
          house={current}
          records={records}
          canEdit={canEdit}
          npcs={records.filter(isNarrativeNpc).map((r) => ({ id: r.id, title: r.title }))}
          courtMembers={records.filter(isNarrativeNpc).map((r) => ({ id: r.id, title: r.title }))}
        />
      )}
      {view === "legacy" && (
        <>
          <h2>Ficha da casa — registro anterior</h2>
          {fichaCasa ? (
            <>
              <FichaCasaCard
                content={fichaCasa.content}
                crest={current.crest}
                houseName={current.name}
              />
              {canEdit && (
                <details className="campaign-add">
                  <summary>Editar ficha da casa</summary>
                  <FichaCasaForm
                    initialData={parseFichaCasa(fichaCasa.content)}
                    row={fichaCasa}
                    onSave={(newContent) => {
                      fichaCasa.content = newContent;
                      onSave();
                    }}
                    onCancel={() => {}}
                  />
                </details>
              )}
            </>
          ) : (
            <p className="campaign-empty">
              A ficha da casa ainda não foi encontrada na pasta. Use o botão Atualizar após
              adicioná-la ao Drive.
            </p>
          )}
        </>
      )}
      {view === "character" && (
        <>
          <h2>Fichas dos personagens · Lordes e Herdeiros</h2>
          {structured.map(({row})=><div key={row.id+'-'+row.version}>
            {ageLine(row.id)}
            <CharacterV2PlayerSheet record={row} houseId={current.id}/>
          </div>)}
          {fichaLorde&&<h2>Ficha do Lorde</h2>}
          {fichaLorde ? (
            <>
              {ageLine(fichaLorde.id)}
              <CharacterV2PlayerSheet record={fichaLorde} houseId={current.id}/>
            </>
          ) : (
            structured.length===0&&<p className="campaign-empty">Nenhuma ficha de personagem reconhecida. O Narrador pode cadastrar uma fonte na área de manutenção.</p>
          )}
          <h2>Corte</h2>
          {npcs.length === 0 && (
            <p className="campaign-empty">
              Nenhum integrante da Corte com ficha de texto até agora.
            </p>
          )}
          {npcs.map((r) => (
            <details className="campaign-add" key={r.id}>
              <summary>{r.title}</summary>
              {ageLine(r.id)}
              <CampaignContent content={r.content} />
              {canEdit && <RecordEditor row={r} canEdit={canEdit} onSave={onSave} />}
            </details>
          ))}
          {retratos.length > 0 && (
            <>
              <h2>Retratos e imagens</h2>
              <div
                className="castle-art-gallery-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-6 rounded-xl"
                style={{
                  background: "linear-gradient(180deg, #1e1329 0%, #140c1c 100%)",
                  border: "1px solid rgba(189, 148, 84, 0.4)",
                  boxShadow: "inset 0 0 32px rgba(0, 0, 0, 0.65)",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                {retratos.map((r) => (
                  <PrivateImage key={r.path} path={r.path} caption={r.titulo} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
