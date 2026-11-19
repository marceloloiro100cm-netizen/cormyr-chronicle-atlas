/**
 * Explicit owner request: the third ten-day (3ª désdia) of Harptos starts
 * on day 21, not day 20. The campaign month/year and source version MUST
 * come from the narrator's authenticated Firebase archive view, never
 * from a GitHub fixture, device clock, or guessed historical round.
 *
 * This function is pure: it does not save/publish the HUB or grant access.
 */
export type ImportedCalendar={
  year:number;month:number;day:number;festival:string|null;version:number;
};
export type ThirdTendayRequest={
  expectedCalendarVersion:number;
  expectedDraftVersion:number;
  proposedDate:{year:number;month:number;day:21;festival:null};
  openRound:3;
  reason:string;
};
export function buildThirdTendayRequest(
  calendar:ImportedCalendar,
  expectedDraftVersion:number,
):ThirdTendayRequest{
  if(!calendar||!Number.isSafeInteger(calendar.version)||calendar.version<1||
     !Number.isSafeInteger(calendar.year)||calendar.year<1||calendar.year>9999||
     !Number.isSafeInteger(calendar.month)||calendar.month<0||calendar.month>11||
     !Number.isSafeInteger(calendar.day)||calendar.day<1||calendar.day>21||
     calendar.festival!==null||
     !Number.isSafeInteger(expectedDraftVersion)||expectedDraftVersion<0||
     expectedDraftVersion>2147483646)
    throw Error('O calendário importado não permite preparar a 3ª désdia automaticamente. Confira a data atual do HUB.');
  return {
    expectedCalendarVersion:calendar.version,
    expectedDraftVersion,
    proposedDate:{year:calendar.year,month:calendar.month,day:21,festival:null},
    openRound:3,
    reason:'Abertura da terceira désdia (dia 21) e rodada 3, conforme decisão do Narrador.',
  };
}
