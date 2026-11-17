# Roteiro de teste real por perfil (Firebase Cloud)

**Data:** 17/11/2026. Teste manual, feito pelo celular ou computador, com
contas reais. Leva cerca de 20 minutos com três pessoas (ou uma pessoa
usando três navegadores ou janelas anônimas).

Contas necessárias: **Narrador**, **Jogador da Casa A**, **Jogador da Casa B**
(Casas diferentes) e, se possível, **Editor-Chefe**. Todas já com o vínculo
corrigido (ver `VINCULOS-PENDENTES-FORMULARIO.md`).

Anote cada resultado como OK ou FALHOU. Se algo falhar, anote a mensagem
exibida, sem copiar dados pessoais nem conteúdo de missivas no GitHub.

## Parte A: leitura (depois de `ATIVAR-PILOTO-LEITURA.md`)

### A1. Visitante sem login
| Passo | Esperado |
|---|---|
| Abrir `https://atlas.cormyr.com.br/` | Acervo público abre normalmente |
| Abrir `/jogadores` | Redireciona para `/firebase-access` |
| Em `/firebase-access`, sem entrar | Pede login; nenhuma Casa aparece |

### A2. Jogador da Casa A
| Passo | Esperado |
|---|---|
| Entrar em `/auth` com e-mail e senha | Vai para `/firebase-access`; "Situação do acesso" mostra perfil jogador |
| "Escolha uma Casa" | Lista as Casas ativas (catálogo); escolha a dele |
| "Consultar Casa autorizada" | Ficha, recursos, posses, exército e crônica da Casa A aparecem |
| Calendário | Mostra a data de Harptos do snapshot |
| "Missivas entregues" | Só missivas destinadas à Casa A |
| "Agentes da Casa" e "Dossiês de Espionagem" | Só os da Casa A |
| "Batalhas registradas" | Só batalhas da Casa A, ou aviso de indisponível se o estágio de batalhas não foi importado (esperado) |
| Escolher outra Casa e "Consultar Casa autorizada" | **Acesso negado** |
| "Testar permissões agora" | Relatório aprovado, sem acesso a outras Casas |

### A3. Jogador da Casa B (o teste mais importante)
| Passo | Esperado |
|---|---|
| Repetir A2 com a conta da Casa B | Consulta só a Casa B; Casa A dá acesso negado |
| Conferir que nada da Casa A aparece em lista, missiva, dossiê ou batalha | Nada da Casa A |

### A4. Narrador
| Passo | Esperado |
|---|---|
| Entrar | Perfil narrador; todas as Casas ativas na lista |
| Abrir duas Casas diferentes | Ambas carregam |
| "Eventos e aventuras do Narrador" | Visível só para o Narrador |
| "Tesouro operacional · Narrador" | Aparece (pode estar vazio sem runtime) |

### A5. Editor-Chefe
| Passo | Esperado |
|---|---|
| Entrar | Perfil editor; nenhuma Casa na lista |
| "A Folha Sem Selo" | Edições publicadas do snapshot aparecem |

### A6. Sair e trocar de conta
| Passo | Esperado |
|---|---|
| Sair com a conta A e, na mesma aba, entrar com a conta B | Nenhum dado da conta A fica na tela |

## Parte B: gravação (só depois dos runtimes `campaignCloudRuntime` e `campaignMailRuntime`)

| Passo | Quem | Esperado |
|---|---|---|
| "Escrever missiva" para o Narrador | Jogador A | Missiva enviada |
| Recarregar a página | Jogador A | A missiva continua lá |
| Abrir caixa | Narrador | Recebeu a missiva da Casa A |
| Abrir caixa | Jogador B | **Não** vê a missiva da Casa A |
| Enviar a mesma missiva duas vezes rapidamente | Jogador A | Só uma é registrada |
| "Publicar A Folha Sem Selo" | Editor-Chefe | Edição publicada aparece para todos os logados |
| Avançar o calendário | Narrador | Data nova aparece para A e B após recarregar |

## Resultado

Parte A toda OK: o piloto de leitura pode ser anunciado aos jogadores.
Parte B toda OK: pode-se planejar o corte final e o desligamento do Supabase.
Qualquer falha em A3 ou na linha "Jogador B não vê a missiva da Casa A":
desligar o piloto imediatamente (ver `ATIVAR-PILOTO-LEITURA.md`, "Como desligar").
