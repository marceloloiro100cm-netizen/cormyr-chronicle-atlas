import { VassalMini } from "./vassal-mini";
import { VassalSheetPreview } from "./vassal-sheet-preview";
import { REGIONS } from "@/lib/house/regions";
import type { CatalogItem } from "@/lib/house/types";
import { useState } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ImageViewer } from "@/components/image-viewer";
import { campaignMonth } from "@/lib/house/regions";
import type { HouseState } from "@/lib/house/types";
import type { VassalHouse } from "@/lib/house/vassal-links";

type NpcOption = { id: string; title: string };
function VassalCrest({house}:{house?:VassalHouse|undefined}){
 const [broken,setBroken]=useState<string|null>(null);
 const raw=house?.crest?.trim()??'';
 // Official artwork may be stored as a public/ path rather than a rooted URL.
 const src=raw.startsWith('public/')?'/'+raw.slice('public/'.length):
   raw&&!/^(?:https?:|data:|blob:|\/)/i.test(raw)?'/'+raw.replace(/^\.\//,''):raw;
 const alt=`Brasão da Casa ${house?.name??'vassala'}`;
 return <div className="h-20 w-16 shrink-0 overflow-hidden [&_img]:h-20 [&_img]:w-16 [&_img]:object-contain">
  {src&&broken!==src?
   <ImageViewer src={src} caption={alt} onImageError={()=>setBroken(src)}/>:
   <Shield className="h-16 w-12 text-muted-foreground" aria-label={alt+' não disponível'}/>}
 </div>;
}

function NpcChoices({
  npcs,
  selected = [],
}: {
  npcs: NpcOption[];
  selected?: string[] | undefined;
}) {
  return (
    <fieldset>
      <legend>Integrantes da Corte associados</legend>
      {npcs.length ? (
        npcs.map((n) => (
          <label className="campaign-check" key={n.id}>
            <input
              type="checkbox"
              name="npc"
              value={n.id}
              defaultChecked={selected.includes(n.id)}
            />
            {n.title}
          </label>
        ))
      ) : (
        <p className="house-caption">Nenhum integrante da Corte acessível nesta casa.</p>
      )}
    </fieldset>
  );
}
export function Vassals({
  catalog,
  onCreate,
  onPurchase,
  onDomain,
  state,
  houses,
  npcs,
  admin,
  busy,
  canEdit,
  onPropose,
  onApprove,
  onEnd,
  onLoyalty,
}: {
  catalog: CatalogItem[];
  onCreate: (args: Record<string, unknown>) => Promise<boolean>;
  onPurchase: (args: Record<string, unknown>) => Promise<boolean>;
  onDomain: (args: Record<string, unknown>) => Promise<boolean>;
  state: HouseState;
  houses: VassalHouse[];
  npcs: NpcOption[];
  admin: boolean;
  busy: boolean;
  canEdit: boolean;
  onPropose: (args: Record<string, unknown>) => Promise<boolean>;
  onApprove: (args: Record<string, unknown>, note: string) => Promise<boolean>;
  onEnd: (args:Record<string,unknown>, note:string)=>Promise<boolean>;
  onLoyalty: (args:Record<string,unknown>, note:string)=>Promise<boolean>;
}) {
  const [region, setRegion] = useState("");
  const [search, setSearch] = useState(""),
    [selectedHouse, setSelectedHouse] = useState(""),
    [openAttach, setOpenAttach] = useState(false),
    [openCreate, setOpenCreate] = useState(false);
  const approved = (state.vassals ?? []).filter(v=>v.status==="approved").length;
  const available = houses.filter(
    (h) =>
      h.id !== state.houseId &&
      !(state.vassals ?? []).some((v) => v.houseId === h.id && v.status !== "ended"),
  );
  const selected = available.find((h) => h.id === selectedHouse);
  return (
    <section>
      <h3>Brasões vassalos</h3>
      <p>
        {approved} vínculos aprovados · próximo investimento{" "}
        {approved === 0 ? 20 : approved === 1 ? 10 : 5} Poder
      </p>
      {canEdit && (
        <div className="flex gap-4 mb-4">
          <Button onClick={() => setOpenAttach(true)}>Anexar Casa Existente</Button>
          <Button onClick={() => setOpenCreate(true)}>Criar Casa Vassala</Button>
        </div>
      )}
      <div className="house-grid">
        {(state.vassals ?? []).map((v) => {
          const h = houses.find((h) => h.id === v.houseId);
          return (
            <article className="house-card" key={v.id}>
              <header className="flex items-center gap-3">
                <VassalCrest house={h}/>
                <div className="min-w-0">
                  <h4>{h?.name ?? v.name}</h4>
                  <p>
                    {v.status === "approved"
                      ? "Vínculo ativo"
                      : v.status === "ended"
                        ? "Encerrado"
                        : "Aguardando decisão do Narrador"}
                  </p>
                </div>
              </header>
              <p>
                {v.cost} Poder alocado
                {v.approvedMonth !== undefined ? ` · ${campaignMonth(v.approvedMonth)}` : ""}
              </p>
              <p>{v.notes}</p>
              {v.approvalNote && (
                <details>
                  <summary>Decisão do Narrador</summary>
                  <p>{v.approvalNote}</p>
                  <p>
                    Penalidade de Influência vigente: {v.status==='approved'?v.influencePenalty:0} (aplicada nos recursos da suserana).
                  </p>
                </details>
              )}
              <p>
                {h?.region ?? v.sheet?.region} {h?.castle ? " · " + h.castle : ""}
              </p>
              <VassalSheetPreview parent={state} vassal={v} officialHouse={h} catalog={catalog}/>
              {v.sheet&&<VassalMini
                state={state} vassal={v} catalog={catalog} busy={busy}
                canEdit={canEdit} onPurchase={onPurchase} onDomain={onDomain}
              />}
              {admin && v.status === 'approved' && <details><summary>Alterar lealdade</summary>
              <form className="campaign-form" onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);await onLoyalty({id:v.id,loyalty:String(form.get('loyalty'))},String(form.get('reason')));}}>
              <label>Postura<select name="loyalty" defaultValue={v.loyalty??'loyal'}>
                <option value="loyal">Leal</option><option value="neutral">Neutra</option><option value="rebellious">Rebelde</option>
              </select></label><label>Decisão do Narrador<textarea name="reason" required minLength={10}/></label><Button disabled={busy}>Registrar lealdade</Button></form></details>}
              {admin && v.status === "approved" && <details>
                <summary>Encerrar vassalagem · Lealdade: {v.loyalty??'não definida'}</summary>
                <form className="campaign-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);
                  await onEnd({id:v.id,forfeitPower:f.get('forfeitPower')==='on'},String(f.get('reason')));}}>
                  <label>Justificativa do Narrador<textarea name="reason" minLength={10} required/></label>
                  <label className="campaign-check"><input name="forfeitPower" type="checkbox"/>Perder permanentemente o Poder investido (guerra, confisco ou rebelião), sem reembolso</label><p>Sem marcação, o Poder alocado retorna ao disponível. A penalidade de Influência cessa nos dois casos; a mini-ficha e o histórico são preservados.</p>
                  <Button disabled={busy} variant="outline">Encerrar vínculo</Button>
                </form>
              </details>}
              {admin && v.status === "proposed" && (
                <details>
                  <summary>Revisar e aprovar vínculo</summary>
                  <form
                    key={`${v.id}-${(v.npcIds ?? []).join(",")}`}
                    className="campaign-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget),
                        ids = f.getAll("npc").map(String),
                        note = String(f.get("note"));
                      await onApprove({ id: v.id, influencePenalty: Number(f.get("penalty")), npcIds: ids }, note);
                    }}
                  >
                    <NpcChoices npcs={npcs} selected={v.npcIds} />
                    <label>
                      Adaptação de Influência registrada (não aplicada automaticamente)
                      <input name="penalty" type="number" min={0} defaultValue={0} />
                    </label>
                    <label>
                      Decisão do Narrador
                      <textarea name="note" required />
                    </label>
                    <Button disabled={busy}>Aprovar vínculo e investimento</Button>
                  </form>
                </details>
              )}
            </article>
          );
        })}
      </div>
      {canEdit && (
        <Dialog open={openAttach} onOpenChange={setOpenAttach}>
          <DialogContent className="campaign-theme max-h-[85vh] overflow-y-auto">
            <DialogTitle>Anexar Casa Existente</DialogTitle>
            <form
              className="campaign-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                if (
                  selected &&
                  (await onPropose({
                    id: crypto.randomUUID(),
                    houseId: selected.id,
                    name: selected.name,
                    notes: String(f.get("notes")),
                    npcIds: f.getAll("npc").map(String),
                  }))
                ) {
                  form.reset();
                  setSelectedHouse("");
                  setSearch("");
                  setOpenAttach(false);
                }
              }}
            >
              <label>
                Buscar casa
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <label>
                Região
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="">Todas as regiões</option>
                  {[...new Set(houses.map((h) => h.region).filter(Boolean))].sort().map((r) => (
                    <option key={r!} value={r!}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Casa oficial
                <select
                  size={8}
                  name="house"
                  required
                  value={selectedHouse}
                  onChange={(e) => setSelectedHouse(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {available
                    .filter(
                      (h) =>
                        (h.id === selectedHouse ||
                          h.name.toLowerCase().includes(search.toLowerCase())) &&
                        (!region || h.region === region),
                    )
                    .map((h) => (
                      <option value={h.id} key={h.id}>
                        {h.name}
                      </option>
                    ))}
                </select>
              </label>
              {selected && (
                <div className="flex items-center gap-3">
                  <VassalCrest house={selected}/>
                  <strong>{selected.name}</strong>
                </div>
              )}
              <NpcChoices npcs={npcs} />
              <label>
                Fundamentação narrativa
                <textarea name="notes" required />
              </label>
              <p className="house-caption">
                Somente referências aos integrantes da Corte acessíveis desta casa; nenhum
                personagem é criado ou copiado. Vassalagem não concede acesso a outra casa.
              </p>
              <Button disabled={busy || !selected}>
                Anexar casa · {approved === 0 ? 20 : approved === 1 ? 10 : 5} Poder
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {canEdit && (
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogContent className="campaign-theme max-h-[85vh] overflow-y-auto">
            <DialogTitle>Criar Casa Vassala</DialogTitle>
            <form
              className="campaign-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                if (
                  await onCreate({
                    id: crypto.randomUUID(),
                    name: String(f.get("name")),
                    region: String(f.get("region")),
                    motto: String(f.get("motto")),
                    lordName: String(f.get("lord")),
                  })
                ) {
                  form.reset();
                  setOpenCreate(false);
                }
              }}
            >
              <label>
                Nome
                <input name="name" required maxLength={160} />
              </label>
              <label>
                Região
                <select name="region" defaultValue={state.identity.region}>
                  {Object.entries(REGIONS).map(([id, r]) => (
                    <option key={id} value={id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lorde / Lady (opcional)
                <input name="lord" maxLength={160} />
              </label>
              <label>
                Lema (opcional)
                <input name="motto" maxLength={500} />
              </label>
              <p>
                Cinco d6 por recurso, rolados no servidor e registrados. Sem bônus regional
                adicional.
              </p>
              <Button disabled={busy}>
                Criar vassala · {approved === 0 ? 20 : approved === 1 ? 10 : 5} Poder
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
