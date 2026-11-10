/** Narrator preflight is read-only. It never edits terrain, deploys units,
 * starts a reducer or writes campaign records.
 */
export function MiniaturePreparationSummary({mode,width,height,attackers,defenders,
 climate,manualDeployment=false}:{
 mode:'GOT'|'D&D'|'Adaptado';width?:number;height?:number;
 attackers:number;defenders:number;climate?:string;
 manualDeployment?:boolean;
}){
 return <section className="miniatures3d-preflight"
  aria-label="Preparar batalha antes de iniciar">
  <h3>1 · Preparar batalha</h3>
  <div className="miniatures3d-preflight-facts">
   <span>Regras: {mode}</span>
   {width&&height&&<span>Mapa: {width} × {height} quadrados</span>}
   <span>Equipes: {attackers} atacantes · {defenders} defensores</span>
   {climate&&<span>Condições: {climate}</span>}
  </div>
  <p>{manualDeployment?
   'Posições iniciais ajustadas no editor de preparação. Confira o mapa antes de iniciar.':
   'As tropas recebem posições iniciais automaticamente ao iniciar.'}
   {' '}Ao batalhar, o mapa 3D só permite inspeção e os comandos autorizados
   pelo motor; editar o cenário continua separado na preparação.</p>
  <p><strong>2 · Batalhar:</strong> iniciar pelos comandos próprios do modo de jogo.</p>
 </section>;
}
