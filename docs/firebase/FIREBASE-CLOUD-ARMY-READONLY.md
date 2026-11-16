# Exército das Casas — leitura Firebase Cloud

## Função

O painel `FirebaseArmyRoster`, no portal `/firebase-access`, exibe
somente as unidades presentes no campo `state.units` da ficha da Casa
selecionada. A ficha já foi autorizada no servidor via
`getHouse` (Firebase Admin Auth + vínculo com a Casa).

Nenhuma consulta adicional a Firestore ou outras Casas é iniciada.
Não existe fallback para Supabase nem ação de escrita no painel.

## Indicadores

- Unidades cadastradas (quantidade real de registros no snapshot).
- Unidades ativas (`destroyed !== true`).
- Efetivo inicial (soma de `strength`, somente quando todos os números
  estão presentes e válidos).
- Efetivo disponível (`strength - casualties`, respeitando unidades
  destruídas, somente quando os valores estão presentes e válidos).
- Por unidade: tipo, treinamento, comandantes, situação, saúde,
  experiência, baixas, habilidades e categorias de equipamento.

O painel **nunca** substitui dados ausentes por zero: exibe
`Não informado`. Não converte números arbitrariamente de pés/libras;
a interface é baseada no sistema métrico do projeto. Como este painel
não mostra distâncias ou massas, não há conversões de unidade implícitas.
Os demais campos da ficha permanecem preservados no componente de ficha
completa.

Exibe no máximo 150 cartões, com aviso e referência à ficha integral
quando houver mais unidades. Os cálculos agregados não são publicados
como completos se uma parte da fonte estiver ausente ou limitada.

## Segurança e operação

- Apenas texto React (sem `dangerouslySetInnerHTML`).
- Nenhuma informação de outras Casas entra nas props do componente.
- Sem botões de criar, melhorar, treinar, movimentar ou combater:
  a homologação de escrita Cloud e o módulo Batalha ainda estão
  bloqueados para contas reais.
- Permissões Firebase/Firestore continuam pendentes na issue #513.
- A migração preservada permanece somente leitura.

## Verificação

`src/components/houses/FirebaseArmyRoster.test.tsx` cobre totais,
perdas, unidades destruídas, campos inválidos, segurança de textos,
limites de renderização e ausência de controles de escrita.
