import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Search, MapPin, FilterX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { quote } from '@/lib/house/engine';
import { RESOURCE_KEYS, RESOURCE_NAMES, type CatalogItem, type HouseState, type Resource } from '@/lib/house/types';

export function PurchaseDrawer({
  open,
  onClose,
  state,
  catalog,
  busy,
  onConfirm,
  initialCategory = '',
}: {
  open: boolean;
  onClose: () => void;
  state: HouseState;
  catalog: CatalogItem[];
  busy: boolean;
  onConfirm: (args: Record<string, unknown>) => Promise<boolean>;
  initialCategory?: string;
}) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [resourceFilter, setResourceFilter] = useState<Resource | ''>('');
  const [maxCost, setMaxCost] = useState<number | ''>('');
  const [durationFilter, setDurationFilter] = useState<'all' | 'immediate' | 'construction'>('all');
  const [repeatableFilter, setRepeatableFilter] = useState<'all' | 'repeatable' | 'unique'>('all');
  const [availableOnly, setAvailable] = useState(false);
  const [itemId, setItem] = useState('');
  const [domainId, setDomain] = useState('');
  const [parentId, setParent] = useState('');
  const [supportId, setSupport] = useState('');
  const [replaceId, setReplaceId] = useState('');
  const [name, setName] = useState('');
  const [compare, setCompare] = useState<string[]>([]);

  const purchaseId = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(0);
      setCategory(initialCategory);
      setQuery('');
      setResourceFilter('');
      setMaxCost('');
      setDurationFilter('all');
      setRepeatableFilter('all');
      setAvailable(false);
      setItem('');
      setName('');
      setCompare([]);
    }
  }, [open, initialCategory]);

  const selected = catalog.find(i => i.id === itemId);
  const q = selected ? quote(selected, state, domainId, parentId || undefined, supportId || undefined, replaceId || undefined) : null;
  const categories = [...new Set(catalog.map(c => c.category))];
  const labels: Record<string, string> = {
    terrain: 'Terrenos',
    feature: 'Características',
    community: 'Comunidades',
    fortification: 'Fortificações',
    estate: 'Explorações',
    lifestyle: 'Estilo de vida',
    personage: 'Especialistas',
    settlement: 'Assentamentos',
    improvement: 'Melhorias',
    equipment: 'Equipamento',
    vassal: 'Vassalos',
  };

  const clearFilters = () => {
    setQuery('');
    setCategory('');
    setResourceFilter('');
    setMaxCost('');
    setDurationFilter('all');
    setRepeatableFilter('all');
    setAvailable(false);
  };

  const activeFilterCount =
    (query ? 1 : 0) +
    (category !== '' ? 1 : 0) +
    (resourceFilter !== '' ? 1 : 0) +
    (maxCost !== '' ? 1 : 0) +
    (durationFilter !== 'all' ? 1 : 0) +
    (repeatableFilter !== 'all' ? 1 : 0) +
    (availableOnly ? 1 : 0);

  const visible = catalog.filter(i => {
    if (category) {
      const selectedCats = category.includes(',') ? category.split(',') : [category];
      if (!selectedCats.includes(i.category)) return false;
    }

    if (query) {
      const qText = query.toLowerCase();
      const text = `${i.name} ${i.original} ${i.description}`.toLowerCase();
      if (!text.includes(qText)) return false;
    }

    if (resourceFilter) {
      if (!i.costs.some(c => c.resource === resourceFilter)) return false;
    }

    if (maxCost !== '' && typeof maxCost === 'number') {
      if (resourceFilter) {
        const matchingCost = i.costs.find(c => c.resource === resourceFilter);
        if (matchingCost && matchingCost.amount > maxCost) return false;
      } else {
        if (i.costs.some(c => c.amount > maxCost)) return false;
      }
    }

    if (durationFilter === 'immediate') {
      if (i.duration.months > 0 || (i.duration.dice ?? 0) > 0) return false;
    } else if (durationFilter === 'construction') {
      if (i.duration.months === 0 && (i.duration.dice ?? 0) === 0) return false;
    }

    if (repeatableFilter === 'repeatable' && !i.repeatable) return false;
    if (repeatableFilter === 'unique' && i.repeatable) return false;

    if (availableOnly) {
      const qRes = quote(i, state, domainId, parentId || undefined, supportId || undefined, replaceId || undefined);
      if (qRes.errors.length > 0) return false;
    }

    return true;
  });

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="house-drawer campaign-theme">
        <SheetHeader>
          <SheetTitle>Comprar posse</SheetTitle>
          <SheetDescription>Escolher · Localizar · Conferir</SheetDescription>
        </SheetHeader>
        <ol className="house-purchase-steps">
          {['Escolher', 'Localizar', 'Conferir'].map((s, i) => (
            <li key={s} aria-current={step === i ? 'step' : undefined}>
              <span>{i + 1}</span>{s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <>
            <div className="house-search">
              <Search size={18} />
              <input
                aria-label="Buscar posse por nome ou descrição"
                type="search"
                placeholder="Buscar por nome, benefício ou descrição"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            <div className="house-input-grid">
              <label>
                Categoria
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">Todas as categorias</option>
                  {initialCategory && initialCategory.includes(',') && (
                    <option value={initialCategory}>Aba atual (Filtro combinado)</option>
                  )}
                  {categories.map(c => (
                    <option value={c} key={c}>{labels[c] ?? c}</option>
                  ))}
                </select>
              </label>

              <label>
                Recurso de custo
                <select value={resourceFilter} onChange={e => setResourceFilter(e.target.value as Resource | '')}>
                  <option value="">Todos os recursos</option>
                  {RESOURCE_KEYS.map(r => (
                    <option value={r} key={r}>{RESOURCE_NAMES[r]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="house-input-grid">
              <label>
                Custo máximo
                <input
                  type="number"
                  min={0}
                  placeholder="Qualquer valor"
                  value={maxCost}
                  onChange={e => setMaxCost(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </label>

              <label>
                Prazo de obra
                <select value={durationFilter} onChange={e => setDurationFilter(e.target.value as typeof durationFilter)}>
                  <option value="all">Todos os prazos</option>
                  <option value="immediate">Imediata (sem obra)</option>
                  <option value="construction">Exige construção</option>
                </select>
              </label>
            </div>

            <div className="house-input-grid">
              <label>
                Repetição
                <select value={repeatableFilter} onChange={e => setRepeatableFilter(e.target.value as typeof repeatableFilter)}>
                  <option value="all">Todas</option>
                  <option value="repeatable">Pode repetir compra</option>
                  <option value="unique">Única (não repetível)</option>
                </select>
              </label>

              <label className="campaign-check" style={{ alignSelf: 'end', marginBottom: '8px' }}>
                <input type="checkbox" checked={availableOnly} onChange={e => setAvailable(e.target.checked)} />
                Somente disponíveis no local
              </label>
            </div>

            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <FilterX size={15} /> Limpar {activeFilterCount} {activeFilterCount === 1 ? 'filtro' : 'filtros'}
              </Button>
            )}

            <p className="house-caption">{visible.length} {visible.length === 1 ? 'posse encontrada' : 'posses encontradas'}</p>

            <div className="house-catalog-list">
              {visible.map(item => (
                <article className={itemId === item.id ? 'selected' : ''} key={item.id}>
                  <Button variant="ghost" className="house-item-select" onClick={() => { purchaseId.current = null; setItem(item.id); setName(item.name); }}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.original} · {labels[item.category] ?? item.category}</small>
                    </span>
                    {itemId === item.id && <Check size={18} />}
                  </Button>
                  <p>{item.description}</p>
                  <div className="house-costs">
                    {item.costs.map((c, i) => (
                      <span key={i}>{c.amount} {RESOURCE_NAMES[c.resource]} · {c.mode === 'allocation' ? 'alocação' : 'permanente'}</span>
                    ))}
                  </div>
                  {item.pending && <p className="house-warning">Nota da fonte (não bloqueia por si só): {item.pending}</p>}
                  <label className="campaign-check">
                    <input
                      type="checkbox"
                      checked={compare.includes(item.id)}
                      disabled={!compare.includes(item.id) && compare.length === 2}
                      onChange={e => setCompare(e.target.checked ? [...compare, item.id] : compare.filter(id => id !== item.id))}
                    />
                    Comparar
                  </label>
                </article>
              ))}
            </div>

            {compare.length === 2 && (
              <div className="house-comparison">
                {compare.map(id => {
                  const i = catalog.find(c => c.id === id);
                  return i && (
                    <div key={id}>
                      <h4>{i.name}</h4>
                      <p>{i.costs.map(c => `${c.amount} ${RESOURCE_NAMES[c.resource]}`).join(' + ')}</p>
                      <p>{i.duration.months} meses {i.duration.dice ? `+ ${i.duration.dice}d${i.duration.sides}` : ''}</p>
                      {i.effects.map((e, n) => <p key={n}>{e.description}</p>)}
                    </div>
                  );
                })}
              </div>
            )}

            <Button disabled={!selected} onClick={() => setStep(1)}>
              Escolher local <ArrowRight size={16} />
            </Button>
          </>
        )}

        {step === 1 && selected && (
          <div className="campaign-form">
            <h3>{selected.name}</h3>
            <label>
              Nome da posse
              <input value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label>
              <span><MapPin size={16} /> Domínio</span>
              <select value={domainId} onChange={e => { setDomain(e.target.value); setSupport(''); setParent(''); setReplaceId(''); }}>
                <option value="">Selecione o domínio</option>
                {state.domains.map(d => (
                  <option value={d.id} key={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            {selected.category === 'fortification' && state.holdings.some(h => h.domainId === domainId && ['tower', 'hall', 'small-castle', 'castle', 'superior-castle'].includes(h.itemId) && ['active', 'building'].includes(h.status)) && (
              <label>
                Evolução (Upgrade)
                <select value={replaceId} onChange={e => setReplaceId(e.target.value)}>
                  <option value="">Selecione a fortificação para evoluir</option>
                  {state.holdings.filter(h => h.domainId === domainId && ['tower', 'hall', 'small-castle', 'castle', 'superior-castle'].includes(h.itemId) && ['active', 'building'].includes(h.status)).map(h => (
                    <option key={h.id} value={h.id}>Evoluir {h.name}</option>
                  ))}
                </select>
              </label>
            )}
            {selected.category === 'settlement' && !['pros-abbey', 'pros-tolls', 'pros-trading-inn'].includes(selected.id) && (
              <label>
                Suporte do assentamento
                <select value={supportId} onChange={e => setSupport(e.target.value)}>
                  <option value="">Comunidade do domínio</option>
                  {state.holdings.filter(h => h.domainId === domainId && h.status === 'active' && ['tower', 'hall', 'castle', 'small-castle', 'superior-castle', 'pros-trading-inn'].includes(h.itemId)).map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </label>
            )}
            {selected.category === 'improvement' && (
              <label>
                Posse principal
                <select value={parentId} onChange={e => setParent(e.target.value)}>
                  <option value="">Selecione</option>
                  {state.holdings.filter(h => h.status === 'active' && h.domainId === domainId && selected.requirements.some(r => r.kind === 'parent' && r.values?.includes(h.itemId))).map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="campaign-actions">
              <Button variant="outline" onClick={() => setStep(0)}>Voltar</Button>
              <Button onClick={() => setStep(2)}>Conferir compra <ArrowRight size={16} /></Button>
            </div>
          </div>
        )}

        {step === 2 && selected && q && (
          <div className="campaign-form">
            <h3>{name}</h3>
            <p>{selected.description}</p>
            <h4>Saldo antes → depois</h4>
            <div className="house-price-review">
              {q.costs.map((c, i) => (
                <div key={i}>
                  <span>{RESOURCE_NAMES[c.resource]}</span>
                  <strong>{q.before[c.resource]} <ArrowRight size={16} /> {q.after[c.resource]}</strong>
                  <small>Custo original {q.original[i]?.amount} · Final {c.amount} · {c.mode === 'allocation' ? 'Aloca pontos; total preservado' : 'Reduz o total permanentemente'}</small>
                </div>
              ))}
            </div>
            {q.discounts.map((d, i) => (
              <p key={i}>Desconto {d.amount}: {d.source}</p>
            ))}
            {replaceId && q.replacedCosts && Object.keys(q.replacedCosts).length > 0 && (
              <p>Upgrade: Custo reduzido pelo valor da fortificação substituída.</p>
            )}
            <p>{state.phase === 'active' ? `Prazo: ${selected.duration.months} meses${selected.duration.dice ? ` + ${selected.duration.dice}d${selected.duration.sides}` : ''}. Benefícios após conclusão.` : 'Posse preexistente na criação; sem obra em andamento.'}</p>
            {selected.effects.map((e, i) => <p key={i}>{e.description}</p>)}
            <details>
              <summary>Regra e requisitos</summary>
              <p>{selected.source} · {selected.section} · {selected.version}</p>
              {selected.requirements.map((r, i) => <p key={i}>{r.kind}: {r.values?.join(', ') ?? r.minimum ?? 'local compatível'}</p>)}
            </details>
            {q.errors.map((error, i) => <p className="house-warning" key={i}>{error}</p>)}
            <div className="campaign-actions">
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button disabled={busy || q.errors.length > 0} onClick={async () => {
                purchaseId.current ??= crypto.randomUUID();
                if (await onConfirm({ id: purchaseId.current, itemId: selected.id, domainId, parentId: parentId || undefined, supportId: supportId || undefined, replaceId: replaceId || undefined, name })) {
                  purchaseId.current = null;
                  setStep(0);
                  setItem('');
                  onClose();
                }
              }}>
                {busy ? 'Confirmando…' : 'Confirmar compra'} <Check size={16} />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
