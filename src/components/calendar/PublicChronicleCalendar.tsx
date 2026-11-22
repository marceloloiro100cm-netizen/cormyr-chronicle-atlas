/** Reusable public-only calendar in the Narrator, player and Editor workspaces.
 * This is deliberately independent of authenticated mail/House timelines.
 * Navigation only changes the displayed year, month, tenday or day.
 */
export function PublicChronicleCalendar(){
  return <section id="calendario-publico" aria-label="Calendário público e crônicas anuais de Cormyr"
    className="w-full space-y-3">
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div>
        <h2 className="text-xl font-semibold">Calendário público e crônicas anuais</h2>
        <p className="text-sm opacity-80">
          Consulte qualquer ano, mês, désdia ou dia sem modificar a data oficial do Hub Temporal.
          Não inclui missivas, segredos do Narrador ou eventos privados das Casas.
        </p>
      </div>
      <a className="rounded border px-3 py-2 text-sm" target="_blank" rel="noopener noreferrer"
        href="/cormyr/calendar.html">Abrir calendário em tela cheia</a>
    </div>
    <iframe src="/cormyr/calendar.html" title="Calendário público de Harptos com navegação por ano, mês, désdia e dia"
      loading="lazy" className="w-full rounded-lg border border-current/20"
      style={{height:'min(1120px, 110vh)',minHeight:850,background:'#f5f4f8'}}/>
  </section>;
}
