import type {HouseReconciliationReport,HouseReconciliationStatus}
  from '@/lib/house/firebase-house-reconciliation-audit';

import type {ConstructionEconomicReplayStatus}
  from '@/lib/house/firebase-construction-economic-replay';

const replayExplanation:Record<ConstructionEconomicReplayStatus,string>={
  verified_purchase_replay:'Compras reexecutadas pelo motor canônico e estados conferidos.',
  hash_chain_not_verified:'A cadeia de hashes precisa ser verificada primeiro.',
  replay_limit_exceeded:'Histórico acima do limite de reexecução automática.',
  source_unusable:'Ficha de origem indisponível para reexecução.',
  legacy_inputs_missing:'Eventos antigos não contêm os parâmetros necessários.',
  invalid_replay_inputs:'Parâmetros de compra registrados são inválidos.',
  request_fingerprint_mismatch:'Parâmetros divergem da impressão digital da requisição.',
  catalog_version_changed:'Versão do catálogo diferente da compra histórica.',
  construction_rules_changed:'Regras da construção divergiram ou não podem ser reproduzidas.',
  recorded_cost_mismatch:'Custos recalculados diferem dos custos registrados.',
  replayed_state_mismatch:'Estado recalculado não corresponde ao hash do evento.',
  final_state_mismatch:'Estado final recalculado difere da ficha operacional.',
};

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
    'Documento operacional consistente; resta validar a reexecução econômica das compras.',
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
      <div className="rounded border border-current/20 p-3 space-y-2 text-sm">
        <h3 className="font-semibold">Cadeia de eventos de construções</h3>
        {!report.constructionLedger
          ?<p role="status">
            Encadeamento não verificado ou indisponível.
            Nenhuma conclusão automática foi registrada.
          </p>
          :<>
            <p role="status">
              {report.constructionLedger.verifiedHashChain
                ?'Encadeamento de hashes e versões conferido.'
                :'Inconsistência na sequência de eventos: '+
                  report.constructionLedger.status}
            </p>
            <p>
              Eventos encontrados: {report.constructionLedger.eventsTotal}
              {' · '}Versão operacional: {report.constructionLedger.lastVersion}
            </p>
            {report.constructionLedger.verifiedHashChain&&
              report.constructionLedger.entries.length>0&&
              <details className="rounded border border-current/15 p-2">
                <summary className="cursor-pointer">
                  Últimas {report.constructionLedger.entries.length} operações
                </summary>
                <ol className="mt-2 space-y-1">
                  {report.constructionLedger.entries.map(event=>
                    <li key={event.version}>
                      Versão {event.version}: {event.itemId}
                      {' · '}Data da campanha: {event.campaignDate}
                    </li>)}
                </ol>
              </details>}
            {report.constructionLedger.truncated&&
              <p>Exibidos somente os últimos 25 eventos verificados.</p>}
            <p className="opacity-75">
              Encadeamento verificado não significa reexecução das compras,
              cálculo histórico completo ou aprovação de produção.
            </p>
          </>}
      </div>
      <div className="rounded border border-current/20 p-3 space-y-2 text-sm">
        <h3 className="font-semibold">Reexecução econômica das compras</h3>
        {!report.economicReplay
          ?<p role="status">Reexecução ainda não disponível ou não verificada.</p>
          :<>
            <p role="status">
              {replayExplanation[report.economicReplay.status]??
                'Reexecução não confirmada.'}
            </p>
            <p>Compras reexecutadas: {report.economicReplay.purchaseEventsReplayed}</p>
            <p className="opacity-75">
              Mesmo a reexecução concluída não certifica contas, permissões
              IAM, outros eventos ou liberação da migração.
            </p>
          </>}
      </div>
      <p className="text-sm opacity-75">
        A consistência deste documento não comprova as permissões IAM,
        a reconciliação completa dos eventos nem os testes com usuários reais.
        Não autoriza ativar compras ou publicar o cutover.
      </p>
    </>}
  </section>;
}
