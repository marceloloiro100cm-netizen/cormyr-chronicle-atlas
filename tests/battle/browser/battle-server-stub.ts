/** Apenas no harness sintético: bloqueia qualquer chamada a Supabase ou dado oficial. */
const blocked=async (..._args:unknown[]):Promise<never>=>{
 throw new Error('Serviço de produção indisponível no harness de dados fictícios.');
};
export const saveBattleReplay=blocked;
export const checkBattlePersistence=blocked;
export const listBattleSourceHouses=blocked;
export const listBattleSourceUnits=blocked;
export const previewBattleWarUnit=blocked;
