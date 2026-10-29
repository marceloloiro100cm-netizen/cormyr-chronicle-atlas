const fs = require('fs');

let engine = fs.readFileSync('src/lib/house/engine.ts', 'utf8');

engine = engine.replace(
  /export function requirements\(item: CatalogItem, state: HouseState, domain\?: Domain, parentId\?: string,supportId\?:string\): string\[\] \{/,
  'export function requirements(item: CatalogItem, state: HouseState, domain?: Domain, parentId?: string,supportId?:string,replaceId?:string): string[] {'
);

engine = engine.replace(
  /if\(item.category==='fortification'&&state.holdings.some\(h=>h.domainId===domain\?.id&&\[\'tower\',\'hall\',\'small-castle\',\'castle\',\'superior-castle\'\].includes\(h.itemId\)&&\[\'active\',\'building\'\].includes\(h.status\)\)\)errors.push\(\'Fortificação existente: upgrade precisa de regra explícita.\'\);/,
  `if(item.category==='fortification') {
    const existing = state.holdings.find(h=>h.domainId===domain?.id&&['tower','hall','small-castle','castle','superior-castle'].includes(h.itemId)&&['active','building'].includes(h.status));
    if(existing && existing.id !== replaceId) errors.push('Fortificação existente: upgrade precisa de regra explícita.');
    else if (replaceId && !existing) errors.push('Fortificação a evoluir não encontrada.');
    else if (replaceId && existing) {
      const order = ['tower','hall','small-castle','castle','superior-castle'];
      if(order.indexOf(item.id) <= order.indexOf(existing.itemId)) errors.push('A nova fortificação deve ser maior que a existente.');
    }
  }`
);

engine = engine.replace(
  /export function quote\(item: CatalogItem, state: HouseState, domainId: string, parentId\?: string,supportId\?:string\) \{/,
  'export function quote(item: CatalogItem, state: HouseState, domainId: string, parentId?: string,supportId?:string,replaceId?:string) {'
);

engine = engine.replace(
  /const errors = requirements\(item, state, state\.domains\.find\(d=>d\.id===domainId\), parentId,supportId\);/,
  'const errors = requirements(item, state, state.domains.find(d=>d.id===domainId), parentId,supportId,replaceId);'
);

engine = engine.replace(
  /const after = \{\.\.\.before\.available\};\n  for \(const cost of costs\) \{ if \(\!Number\.isFinite\(cost\.amount\)\|\|cost\.amount<0\) errors\.push\(\'Custo inválido\.\'\); after\[cost\.resource\]\-=cost\.amount; \}\n  for \(const r of RESOURCE_KEYS\) if \(after\[r\]<0\) errors\.push\(\`Saldo insuficiente: \$\{r\}\.\`\);\n  return \{before:before\.available,after,costs,original:item\.costs,discounts,errors\};\n\}/,
  `const after = {...before.available};
  let replacedCosts: Partial<Record<Resource, number>> = {};
  if (replaceId) {
    const existing = state.holdings.find(h=>h.id === replaceId);
    if (existing) {
      replacedCosts = existing.allocatedCosts ?? {};
      if (Object.keys(replacedCosts).length === 0) {
        for (const c of existing.costs) if (c.mode === 'allocation') replacedCosts[c.resource] = (replacedCosts[c.resource] || 0) + c.amount;
      }
    }
  }
  for (const [r, amt] of Object.entries(replacedCosts)) after[r as Resource] += (amt as number);
  for (const cost of costs) { if (!Number.isFinite(cost.amount)||cost.amount<0) errors.push('Custo inválido.'); after[cost.resource]-=cost.amount; }
  for (const r of RESOURCE_KEYS) if (after[r]<0) errors.push(\`Saldo insuficiente: \${r}.\`);
  return {before:before.available,after,costs,original:item.costs,discounts,errors,replacedCosts};
}`
);

engine = engine.replace(
  /export function purchase\(state: HouseState, item: CatalogItem, args: \{id:string;domainId:string;name:string;parentId\?:string \| undefined;supportId\?:string\|undefined;dice:number\[\]\}\): HouseState \{/,
  'export function purchase(state: HouseState, item: CatalogItem, args: {id:string;domainId:string;name:string;parentId?:string | undefined;supportId?:string|undefined;dice:number[];replaceId?:string}): HouseState {'
);

engine = engine.replace(
  /const q = quote\(item,state,args\.domainId,args\.parentId,args\.supportId\); if\(q\.errors\.length\) throw new Error\(q\.errors\.join\(\' \'\)\);/,
  "const q = quote(item,state,args.domainId,args.parentId,args.supportId,args.replaceId); if(q.errors.length) throw new Error(q.errors.join(' '));"
);

engine = engine.replace(
  /if\(next\.holdings\.some\(h=>h\.id===args\.id\)\)throw new Error\(\'Identificador de compra já utilizado\.\'\);\n  const allocatedCosts/,
  `if(next.holdings.some(h=>h.id===args.id))throw new Error('Identificador de compra já utilizado.');

  if (args.replaceId) {
    const existingIndex = next.holdings.findIndex(h => h.id === args.replaceId);
    if (existingIndex !== -1) {
      for (const h of next.holdings) if (h.supportId === args.replaceId) h.supportId = args.id;
      next.holdings.splice(existingIndex, 1);
    }
  }

  const allocatedCosts`
);

fs.writeFileSync('src/lib/house/engine.ts', engine);
console.log('engine.ts patched');


let drawer = fs.readFileSync('src/components/house/purchase-drawer.tsx', 'utf8');

drawer = drawer.replace(
  /const \[supportId, setSupport\] = useState\(''\);/,
  "const [supportId, setSupport] = useState('');\n  const [replaceId, setReplaceId] = useState('');"
);

drawer = drawer.replace(
  /const q = selected \? quote\(selected, state, domainId, parentId \|\| undefined, supportId \|\| undefined\) : null;/,
  "const q = selected ? quote(selected, state, domainId, parentId || undefined, supportId || undefined, replaceId || undefined) : null;"
);

drawer = drawer.replace(
  /const qRes = quote\(i, state, domainId, parentId \|\| undefined, supportId \|\| undefined\);/,
  "const qRes = quote(i, state, domainId, parentId || undefined, supportId || undefined, replaceId || undefined);"
);

drawer = drawer.replace(
  /<select value=\{domainId\} onChange=\{e => \{ setDomain\(e\.target\.value\); setSupport\(''\); setParent\(''\); \}\}>/,
  "<select value={domainId} onChange={e => { setDomain(e.target.value); setSupport(''); setParent(''); setReplaceId(''); }}>"
);

drawer = drawer.replace(
  /\{selected\.category === 'settlement' && \!\['pros-abbey', 'pros-tolls', 'pros-trading-inn'\].includes\(selected\.id\) && \(/,
  `{selected.category === 'fortification' && state.holdings.some(h => h.domainId === domainId && ['tower', 'hall', 'small-castle', 'castle', 'superior-castle'].includes(h.itemId) && ['active', 'building'].includes(h.status)) && (
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
            {selected.category === 'settlement' && !['pros-abbey', 'pros-tolls', 'pros-trading-inn'].includes(selected.id) && (`
);

drawer = drawer.replace(
  /\{q\.discounts\.map\(\(d, i\) => \(\n\s*<p key=\{i\}>Desconto \{d\.amount\}: \{d\.source\}<\/p>\n\s*\)\)\}/,
  `{q.discounts.map((d, i) => (
              <p key={i}>Desconto {d.amount}: {d.source}</p>
            ))}
            {replaceId && q.replacedCosts && Object.keys(q.replacedCosts).length > 0 && (
              <p>Upgrade: Custo reduzido pelo valor da fortificação substituída.</p>
            )}`
);

drawer = drawer.replace(
  /if \(await onConfirm\(\{ id: purchaseId\.current, itemId: selected\.id, domainId, parentId: parentId \|\| undefined, supportId: supportId \|\| undefined, name \}\)\) \{/,
  "if (await onConfirm({ id: purchaseId.current, itemId: selected.id, domainId, parentId: parentId || undefined, supportId: supportId || undefined, replaceId: replaceId || undefined, name })) {"
);

fs.writeFileSync('src/components/house/purchase-drawer.tsx', drawer);
console.log('drawer patched');
