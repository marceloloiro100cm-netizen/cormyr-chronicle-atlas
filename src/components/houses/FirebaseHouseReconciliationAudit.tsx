import type {HouseReconciliationReport,HouseReconciliationStatus}
  from '@/lib/house/firebase-house-reconciliation-audit';

const explanation:Record<HouseReconciliationStatus,string>={
  stage_incomplete:'Etapa de migração privada ainda incompleta.',
  house_unavailable:'Casa inexistente, inativa ou fora do recorte homologado.',
  sheet_unavailable:'Ficha histórica de origem não disponível ou inválida.',
  calendar_unavailable:'Calendário oficial de Harptos indisponível.',
  source_invalid:'Os dados históricos da economia não passaram pela verificação.',
  runtime_unreconciled:'Runtime operacional ainda não reconciliado.',
  operational_missing:'Ficha econômica operacional ainda não provisionada.',
  operational_unverified:'Documento operacional incompleto ou sem verificação.',
  sheet_version_mismatch:'Versão da ficha histórica diferente da origem conciliada.',
  source_hash_mismatch:'Hash da origem diverge do snapshot histórico autorizado.',
  operational_hash_mismatch:'Integridade do estado operacional divergente.',
  seed_mismatch:'Versão inicial diferente da ficha histórica (seed inconsistente).',
  calendar_mismatch:'Mês da Casa não coincide com o calendário oficial.',
  economy_invalid:'Regras de recursos ou estado operacional inválidos.',
  seed_consistent:'Seed operacional consistente com a origem histórica.',
  operational_document_consistent:
    'Documento operacional internamente consistente; histórico de eventos ainda não auditado.',
};

export function FirebaseHouseReconciliationAudit({houseId,report}:{
  houseId:string;report:HouseReconciliationReport|null;
}){
  const available=report?.houseId===houseId;
  return <section aria-label="Diagnóstico de reconciliação da Casa"
    className="rounded-lg border border-current/25 p-4 space-y-3">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">
        Diagnóstico administrativo de reconciliação
      </h2>
      <p className="text-sm opacity-75">
        Visível apenas ao Narrador · consulta Firebase somente leitura
      </p>
    </header>
    {!available?<p role="status" className="text-sm">
      Auditoria ainda não habilitada ou indisponível. Não há confirmação de
      reconciliação para esta Casa.
    </p>:<>
      <p role="status" className="font-semibold">
        {explanation[report.status]??'Reconciliação não confirmada'}
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div><dt>Versão histórica</dt>
          <dd className="font-semibold">{report.sourceVersion??'Não confirmada'}</dd>
        </div>
        <div><dt>Versão operacional</dt>
          <dd className="font-semibold">{report.operationalVersion??'Não confirmada'}</dd>
        </div>
        <div><dt>Integridade do documento</dt>
          <dd>{report.documentIntegrityConfirmed?'Consistente':'Não confirmada'}</dd>
        </div>
        <div><dt>Auditoria dos eventos</dt>
          <dd>{report.auditHistoryVerified?'Conferida':'Ainda não realizada'}</dd>
        </div>
        <div><dt>Leitura operacional autorizada</dt>
          <dd>{report.readGateApproved?'Flag privada marcada':'Não autorizada'}</dd>
        </div>
        <div><dt>Escrita de construções autorizada</dt>
          <dd>{report.writeGateApproved?'Flag privada marcada':'Não autorizada'}</dd>
        </div>
      </dl>
      <p className="text-sm opacity-75">
        A consistência deste documento não comprova as permissões IAM,
        a reconciliação completa dos eventos nem os testes com usuários reais.
        Não autoriza ativar compras ou publicar o cutover.
      </p>
    </>}
  </section>;
}
