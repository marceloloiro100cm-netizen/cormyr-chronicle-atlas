import type { ReactNode } from "react";
import { isNarrativeNpc } from "@/lib/house/narrative-npc";
import { useState } from "react";
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {loadHouseHub} from '@/lib/house/house.functions';
import {balances,maxHouseStatus} from '@/lib/house/engine';
import {parseChronicleSheet} from '@/lib/house/character-sheet';
import {ChronicleCharacterEditor} from '@/components/house/character-editor';
import { NobleHouseHub } from "@/components/house/hub";
import { Button } from "@/components/ui/button";
import { CampaignContent, PrivateImage } from "@/components/campaign-content";
import { FichaCasaCard, FichaPersonagemCard, portraitPath } from "@/components/ficha";
import { isFichaCasa, isFichaPersonagem, parseFichaPersonagem, parseFichaCasa } from "@/lib/ficha";
import type { RecordRow } from "./shared";
import type { Panel } from "./panel-data";
import { RecordEditor } from "./records";
import { FichaPersonagemForm, FichaCasaForm } from "./ficha-form";

export function FichaTab({
  current,
  records,
  canEdit,
  onSave,
  npcManager,
  playerId,
}: {
  npcManager?: ReactNode;
  playerId?:string|undefined;
  current: Panel["houses"][number];
  records: RecordRow[];
  canEdit: boolean;
  onSave: () => unknown;
}) {
  const [view, setView] = useState<"house" | "character" | "legacy">("house");
  const load=useServerFn(loadHouseHub);
  const {data:sheetData}=useQuery({queryKey:['noble-house',current.id],enabled:view==='character',queryFn:()=>load({data:{houseId:current.id}})});
  const statusCap=sheetData?maxHouseStatus(balances(sheetData.state).total.influence):10;
  const structured=records.map(row=>({row,sheet:parseChronicleSheet(row.content)})).filter((x):x is {row:RecordRow;sheet:NonNullable<typeof x.sheet>}=>x.sheet!==null);
  const fichaCasa = records.find((r) => isFichaCasa(r.title, r.content));
  const fichaLorde = records.find((r) => isFichaPersonagem(r.title, r.content)&&!parseChronicleSheet(r.content));
  const retratos = records
    .map((r) => ({ titulo: r.title, path: portraitPath(r.content) }))
    .filter((r): r is { titulo: string; path: string } => Boolean(r.path));
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const retratoDo = (nome: string | null) =>
    nome
      ? (retratos.find(
          (r) =>
            norm(r.titulo) === norm(nome) ||
            norm(r.titulo).includes(norm(nome)) ||
            norm(nome).includes(norm(r.titulo)),
        )?.path ?? null)
      : null;
  const npcs = records.filter(
    (r) =>
      r.kind === "character" && !isFichaPersonagem(r.title, r.content) && !portraitPath(r.content),
  );
  const fichaLordeParsed = fichaLorde ? parseFichaPersonagem(fichaLorde.content) : null;
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
        <Button
          variant={view === "legacy" ? "default" : "ghost"}
          aria-pressed={view === "legacy"}
          onClick={() => setView("legacy")}
        >
          Ficha anterior preservada
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
          {canEdit&&<ChronicleCharacterEditor key={'new-'+current.id} houseId={current.id} houseName={current.name} playerId={playerId} canEdit={canEdit} statusCap={statusCap} onSave={onSave}/>}
          {structured.map(({row,sheet})=><ChronicleCharacterEditor key={row.id+'-'+row.version} row={row} initial={sheet} houseId={current.id} houseName={current.name} playerId={playerId} canEdit={canEdit} statusCap={statusCap} onSave={onSave}/>)}
          <h2>Ficha do Lorde importada (legado)</h2>
          {fichaLorde ? (
            <>
              <FichaPersonagemCard
                content={fichaLorde.content}
                portrait={retratoDo(fichaLordeParsed?.nome ?? current.lord_name)}
                titulo={fichaLorde.title}
              />
              {canEdit && (
                <details className="campaign-add">
                  <summary>Editar ficha do lorde</summary>
                  <FichaPersonagemForm
                    initialData={parseFichaPersonagem(fichaLorde.content)}
                    row={fichaLorde}
                    onSave={(newContent) => {
                      fichaLorde.content = newContent;
                      onSave();
                    }}
                    onCancel={() => {}}
                  />
                </details>
              )}
            </>
          ) : (
            <p className="campaign-empty">Nenhuma ficha legada localizada. É possível criar uma ficha estruturada acima.</p>
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
