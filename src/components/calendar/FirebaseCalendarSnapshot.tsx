import {FESTIVALS,MONTHS,formatCampaignPeriod,
  type CampaignDate} from '@/lib/calendar/harptos';

type FirebaseCalendarDate=CampaignDate&{version:number};

const validCalendar=(date:FirebaseCalendarDate)=>{
  if(!Number.isInteger(date.year)||date.year<1||date.year>9999||
    !Number.isInteger(date.month)||date.month<0||date.month>11||
    !Number.isInteger(date.day)||date.day<1||date.day>30||
    !Number.isInteger(date.version)||date.version<1)return false;
  return date.festival===null||
    FESTIVALS.some(f=>f.id===date.festival&&f.month===date.month);
};

/** Passive Firebase snapshot view. Never advances or publishes game time. */
export function FirebaseCalendarSnapshot({date}:{date:FirebaseCalendarDate}){
  if(!validCalendar(date))
    return <p role="status" className="text-sm">
      Calendário de Cormyr ainda não disponível neste snapshot.
    </p>;
  const festival=FESTIVALS.find(f=>f.id===date.festival);
  const active=Math.floor((date.day-1)/10);
  return <section aria-label="Calendário de Harptos de Cormyr"
    className="rounded-lg border border-amber-800/40
      bg-gradient-to-b from-amber-950/10 to-amber-800/5 p-4 space-y-3">
    <header className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-widest opacity-70">
          Hub Temporal · somente leitura
        </p>
        <h2 className="text-lg font-semibold">{formatCampaignPeriod(date)}</h2>
        <p className="text-sm opacity-80">
          {festival?'Festival intercalar · fora das désdias':
            `Dia ${date.day} de ${MONTHS[date.month]}`}
        </p>
      </div>
      <span className="rounded border px-2 py-1 text-xs whitespace-nowrap">
        v{date.version}
      </span>
    </header>
    {festival
      ?<p className="rounded border border-amber-700/50 px-3 py-3
        text-center font-serif text-base">{festival.name}</p>
      :<div className="grid grid-cols-3 gap-2"
        aria-label="Períodos de dez dias de Harptos">
        {[0,1,2].map(index=><div key={index}
          aria-current={active===index?'date':undefined}
          className={`rounded border px-2 py-3 text-center
            ${active===index?'border-amber-600 bg-amber-700/15 font-semibold':
              'border-current/20 opacity-70'}`}>
          <p className="text-sm">{index+1}ª désdia</p>
          <p className="text-xs">Dias {index*10+1}–{index*10+10}</p>
        </div>)}
      </div>}
    <p className="text-xs opacity-70">
      Data preservada no Firebase. O avanço do tempo é reservado ao Narrador
      e permanece indisponível neste portal.
    </p>
  </section>;
}
