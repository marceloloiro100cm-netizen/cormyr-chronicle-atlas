import {FirebasePendingAccessReview,
  type PendingAccessReview,type PendingDecisionProposal,type PendingDecisionPreview}
  from '@/components/firebase/FirebasePendingAccessReview';
import {councilCloudRequest} from '@/lib/firebase-workspace/council-tools';

type House={id:string;name:string;season?:number|null};

/** Só é montado no Conselho Firebase do Narrador. A API revalida a permissão. */
export function FirebaseCouncilAccessReview({
  narrator,houses,
}:{narrator:boolean;houses:House[]}){
  if(!narrator)return null;
  const available=houses.filter(h=>h.season===2).map(h=>({id:h.id,name:h.name}));
  return <section aria-label="Revisão de contas Firebase" className="space-y-3">
    <h2 className="text-xl font-semibold">Contas pendentes do Firebase</h2>
    <p className="text-sm">
      Consulta reservada ao Narrador. A validação da proposta é somente
      uma prévia, sem criar, ativar ou alterar contas. A gestão de contas
      será implementada na próxima etapa do plano.
    </p>
    <FirebasePendingAccessReview
      inspect={()=>councilCloudRequest<PendingAccessReview>(
        '/api/firebase-cloud-read',{action:'listAccessRemediation'})}
      resolveHouseName={id=>houses.find(h=>h.id===id)?.name??'Casa não localizada'}
      availableHouses={available}
      plan={(targetUid,proposal:PendingDecisionProposal)=>
        councilCloudRequest<PendingDecisionPreview>(
          '/api/firebase-cloud-read',
          {action:'previewAccessRemediation',targetUid,proposal})}
    />
  </section>;
}
