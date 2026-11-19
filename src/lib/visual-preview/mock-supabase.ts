import {VISUAL_PREVIEW_PENDING} from './state';

/**
 * Cliente Supabase simulado, apenas para a prévia visual da área interna.
 * Implementa o subconjunto da API usado pelos componentes originais: consultas
 * encadeadas em tabelas, RPCs, autenticação, armazenamento e Realtime.
 * Leituras devolvem os dados de demonstração; escritas e RPCs sem dados de
 * demonstração devolvem um erro explícito de "conector pendente".
 */
export type Row = Record<string, unknown>;
export type RpcHandler = (args: Record<string, unknown>) => unknown;
export type VisualDb = {
  user: {id: string; email: string; name: string};
  tables: Record<string, Row[]>;
  rpc: Record<string, RpcHandler>;
  /** URL pública usada no lugar de um arquivo do armazenamento privado. */
  assetUrl: (bucket: string, path: string) => string;
};
type Result = {data: unknown; error: PreviewError | null; count?: number | null; status: number; statusText: string};
type PreviewError = {message: string; code: string; details: string; hint: string};

function pendingError(message: string = VISUAL_PREVIEW_PENDING): PreviewError {
  return {message, code: 'VISUAL_PREVIEW', details: '', hint: ''};
}
function ok(data: unknown, count?: number): Result {
  return {data, error: null, count: count ?? null, status: 200, statusText: 'OK'};
}
function fail(error: PreviewError): Result {
  return {data: null, error, count: null, status: 400, statusText: 'Visual preview'};
}

type Filter = (row: Row) => boolean;
function field(row: Row, key: string): unknown {
  return row[key];
}
/** Ordenação estável entre números e textos (datas ISO comparam como texto). */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a ?? ''), y = String(b ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Encadeamento compatível com PostgrestFilterBuilder; termina em then(). */
class MockQuery implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: {key: string; ascending: boolean}[] = [];
  private from: number | null = null;
  private to: number | null = null;
  private max: number | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private write = false;
  private head = false;
  private wantCount = false;

  constructor(private readonly rows: () => Row[]) {}

  select(_columns?: string, options?: {count?: string; head?: boolean}) {
    if (options?.count) this.wantCount = true;
    if (options?.head) this.head = true;
    return this;
  }
  insert() { this.write = true; return this; }
  update() { this.write = true; return this; }
  upsert() { this.write = true; return this; }
  delete() { this.write = true; return this; }

  private where(key: string, test: (value: unknown) => boolean) {
    // Filtros sobre tabelas embutidas (ex.: campaign_players.user_id) são ignorados.
    if (!key.includes('.')) this.filters.push(row => test(field(row, key)));
    return this;
  }
  eq(key: string, value: unknown) { return this.where(key, v => v === value || String(v) === String(value)); }
  neq(key: string, value: unknown) { return this.where(key, v => v !== value); }
  gt(key: string, value: unknown) { return this.where(key, v => compare(v, value) > 0); }
  gte(key: string, value: unknown) { return this.where(key, v => compare(v, value) >= 0); }
  lt(key: string, value: unknown) { return this.where(key, v => compare(v, value) < 0); }
  lte(key: string, value: unknown) { return this.where(key, v => compare(v, value) <= 0); }
  in(key: string, values: readonly unknown[]) { return this.where(key, v => values.some(x => x === v)); }
  is(key: string, value: unknown) { return this.where(key, v => (v ?? null) === value); }
  like() { return this; }
  ilike() { return this; }
  not() { return this; }
  or() { return this; }
  filter() { return this; }
  match(query: Record<string, unknown>) {
    for (const [key, value] of Object.entries(query)) this.eq(key, value);
    return this;
  }
  contains() { return this; }
  containedBy() { return this; }
  overlaps() { return this; }
  textSearch() { return this; }
  returns() { return this; }
  abortSignal() { return this; }
  throwOnError() { return this; }
  order(key: string, options?: {ascending?: boolean}) {
    this.orders.push({key, ascending: options?.ascending ?? true});
    return this;
  }
  limit(count: number) { this.max = count; return this; }
  range(from: number, to: number) { this.from = from; this.to = to; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  private execute(): Result {
    if (this.write) return fail(pendingError());
    let rows = this.rows().filter(row => this.filters.every(test => test(row)));
    for (const {key, ascending} of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => compare(field(a, key), field(b, key)) * (ascending ? 1 : -1));
    }
    const total = rows.length;
    if (this.from !== null) rows = rows.slice(this.from, (this.to ?? this.from) + 1);
    if (this.max !== null) rows = rows.slice(0, this.max);
    if (this.mode === 'single') {
      return rows.length === 1 ? ok(rows[0]) : fail(pendingError('Prévia visual: registro não encontrado.'));
    }
    if (this.mode === 'maybe') return ok(rows[0] ?? null);
    if (this.head) return ok(null, total);
    return ok(rows, this.wantCount ? total : undefined);
  }
  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }
}

/** Resultado de RPC; aceita .single()/.maybeSingle() como o cliente real. */
class MockRpc implements PromiseLike<Result> {
  constructor(private readonly run: () => Result) {}
  single() { return this; }
  maybeSingle() { return this; }
  select() { return this; }
  returns() { return this; }
  abortSignal() { return this; }
  throwOnError() { return this; }
  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onFulfilled, onRejected);
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function createMockSupabase(db: VisualDb) {
  const user = {
    id: db.user.id, email: db.user.email, aud: 'authenticated', role: 'authenticated',
    app_metadata: {provider: 'firebase'}, user_metadata: {name: db.user.name},
    created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-18T00:00:00.000Z',
  };
  const session = {
    access_token: 'visual-preview', refresh_token: 'visual-preview', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user,
  };
  const table = (name: string) => () => clone(db.tables[name] ?? []);
  const rpc = (name: string, args?: Record<string, unknown>) => new MockRpc(() => {
    const handler = db.rpc[name];
    if (!handler) return fail(pendingError());
    try {
      return ok(clone(handler(args ?? {})));
    } catch (error) {
      return fail(pendingError(error instanceof Error ? error.message : VISUAL_PREVIEW_PENDING));
    }
  });
  const bucket = (name: string) => ({
    async download(path: string) {
      try {
        const response = await fetch(db.assetUrl(name, path));
        if (!response.ok) return {data: null, error: pendingError('Imagem de demonstração indisponível.')};
        return {data: await response.blob(), error: null};
      } catch {
        return {data: null, error: pendingError('Imagem de demonstração indisponível.')};
      }
    },
    async createSignedUrl(path: string) {
      return {data: {signedUrl: db.assetUrl(name, path)}, error: null};
    },
    async createSignedUrls(paths: string[]) {
      return {data: paths.map(path => ({path, signedUrl: db.assetUrl(name, path), error: null})), error: null};
    },
    getPublicUrl(path: string) {
      return {data: {publicUrl: db.assetUrl(name, path)}};
    },
    async list() { return {data: [], error: null}; },
    async upload() { return {data: null, error: pendingError()}; },
    async update() { return {data: null, error: pendingError()}; },
    async remove() { return {data: null, error: pendingError()}; },
    async move() { return {data: null, error: pendingError()}; },
    async copy() { return {data: null, error: pendingError()}; },
  });
  const channel = () => ({
    on() { return this; },
    subscribe(callback?: (status: string) => void) {
      queueMicrotask(() => callback?.('SUBSCRIBED'));
      return this;
    },
    async unsubscribe() { return 'ok'; },
    async send() { return 'ok'; },
    async track() { return 'ok'; },
    async untrack() { return 'ok'; },
    presenceState() { return {}; },
  });
  return {
    from: (name: string) => new MockQuery(table(name)),
    rpc,
    schema: () => ({from: (name: string) => new MockQuery(table(name)), rpc}),
    channel,
    async removeChannel() { return 'ok'; },
    async removeAllChannels() { return []; },
    getChannels() { return []; },
    realtime: {setAuth() { /* prévia: sem Realtime */ }},
    functions: {async invoke() { return {data: null, error: pendingError()}; }},
    storage: {from: bucket},
    auth: {
      async getUser() { return {data: {user}, error: null}; },
      async getSession() { return {data: {session}, error: null}; },
      async getClaims() { return {data: {claims: {sub: user.id, email: user.email, role: 'authenticated'}}, error: null}; },
      async refreshSession() { return {data: {session, user}, error: null}; },
      onAuthStateChange() { return {data: {subscription: {unsubscribe() { /* prévia */ }}}}; },
      async signOut() { return {error: null}; },
      async updateUser() { return {data: {user: null}, error: pendingError()}; },
      async signInWithPassword() { return {data: {user: null, session: null}, error: pendingError()}; },
      async resetPasswordForEmail() { return {data: null, error: pendingError()}; },
      async setSession() { return {data: {session, user}, error: null}; },
      startAutoRefresh() { /* prévia */ },
      stopAutoRefresh() { /* prévia */ },
    },
  };
}
