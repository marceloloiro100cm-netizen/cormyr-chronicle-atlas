import { createFileRoute } from '@tanstack/react-router';
import { PlayersArea } from '@/components/players/players-workspace';

export const Route=createFileRoute('/_authenticated/jogadores')({head:()=>({meta:[{title:'Conselho dos jogadores — Cormyr Chronicle'},{name:'description',content:'Casas, personagens, documentos e missivas da segunda temporada.'},{property:'og:title',content:'Conselho dos jogadores — Cormyr Chronicle'},{property:'og:description',content:'Painel reservado aos jogadores autorizados da campanha.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:Players});

function Players(){
  return <PlayersArea/>;
}
