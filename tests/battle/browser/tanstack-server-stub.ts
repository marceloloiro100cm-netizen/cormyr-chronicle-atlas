/** Stub exclusivo de navegador sintético; nunca fornece uma requisição autenticada. */
export function getRequest():never{throw new Error('Sem requisição real no harness sintético.');}
