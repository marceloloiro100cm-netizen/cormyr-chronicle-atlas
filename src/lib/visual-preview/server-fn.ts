import {useServerFn as useStartServerFn} from '@tanstack/react-start';
import {isVisualPreview, VISUAL_PREVIEW_PENDING} from './state';

/* eslint-disable @typescript-eslint/no-explicit-any -- mesma assinatura genérica de useServerFn. */
type AnyServerFn = (...deps: Array<any>) => Promise<any>;
/** Entrada de uma server function: { data: {...} }. */
export type VisualServerInput = {data?: Record<string, unknown>} | undefined;
type PreviewHandler = (input: VisualServerInput) => unknown;

const handlers = new Map<unknown, PreviewHandler>();

/** Registra a resposta de demonstração de uma server function (por identidade). */
export function registerVisualServerFn(serverFn: AnyServerFn, handler: PreviewHandler) {
  handlers.set(serverFn, handler);
}
/** Lê um campo textual de { data: {...} }. */
export function visualServerField(input: VisualServerInput, key: string): string {
  const value = input?.data?.[key];
  return typeof value === 'string' ? value : '';
}
export function clearVisualServerFns() {
  handlers.clear();
}

/**
 * Substituto de useServerFn para os componentes da área interna. Fora da
 * prévia visual, delega integralmente ao hook do TanStack Start.
 * Na prévia, devolve os dados de demonstração registrados; sem registro,
 * a chamada falha com a mensagem de conector pendente.
 */
export function useServerFn<T extends AnyServerFn>(serverFn: T): (...args: Parameters<T>) => ReturnType<T> {
  const real = useStartServerFn(serverFn);
  if (!isVisualPreview()) return real as unknown as (...args: Parameters<T>) => ReturnType<T>;
  return ((...args: Parameters<T>) => {
    const handler = handlers.get(serverFn);
    if (!handler) return Promise.reject(new Error(VISUAL_PREVIEW_PENDING));
    return Promise.resolve().then(() => handler(args[0] as VisualServerInput));
  }) as unknown as (...args: Parameters<T>) => ReturnType<T>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
