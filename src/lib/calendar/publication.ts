type SupabaseError = {
 message?:unknown; code?:unknown; details?:unknown; hint?:unknown; status?:unknown
};

export function calendarPublicationError(error:unknown):string {
 const value=(error&&typeof error==='object'?error:{} ) as SupabaseError;
 const message=typeof value.message==='string' ? value.message : (error instanceof Error?error.message:'Falha desconhecida ao publicar');
 const code=typeof value.code==='string'?value.code:'';
 if(/Calendário alterado|recarregue antes de salvar|conflito/i.test(message))
  return 'O calendário foi atualizado em outra sessão. Sua data continua selecionada. Recarregue os dados antes de publicar novamente.';
 if(code==='PGRST202'||/Could not find the function|schema cache/i.test(message))
  return 'A função do calendário ainda não está disponível no banco conectado ao site. Verifique a migração 0044 e atualize a página.';
 if(code==='42501'||/Somente o Narrador|permission denied|não autorizado/i.test(message))
  return 'A sessão não tem permissão de Narrador para publicar. Entre novamente com a conta do Narrador.';
 const codeLabel=code? ` [${code}]`:'';
 return `Falha ao publicar calendário${codeLabel}: ${message}`;
}

/** Pure comparison: never claim that a calendar was saved from a void RPC response. */
export function samePublishedCalendar(
 saved:{year:number;month:number;day:number;festival:string|null;published_week?:number;auto_advance:boolean}|null|undefined,
 requestedDate:string,requestedWeek:number,automatic:boolean
):boolean {
 if(!saved)return false;
 const key=`${String(saved.year).padStart(4,'0')}-${saved.festival?'F-'+saved.festival:String(saved.month+1).padStart(2,'0')+'-'+String(saved.day).padStart(2,'0')}`;
 return key===requestedDate&&saved.published_week===requestedWeek&&saved.auto_advance===automatic;
}
