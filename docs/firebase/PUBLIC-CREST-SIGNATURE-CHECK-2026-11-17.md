# Verificação de assinatura binária dos brasões do acervo — 17/11/2026

O inventário anterior verificava apenas se as referências de 172 brasões apontavam a arquivos existentes. Esta revisão exige adicionalmente uma assinatura binária consistente com a extensão declarada: RIFF/WEBP para .webp, assinatura PNG para .png, ou JPEG SOI para .jpg/.jpeg. O exame lê no máximo os primeiros 12 bytes de cada imagem. Arquivos vazios, caminhos inseguros, links simbólicos e extensões inconsistentes não são aprovados.

**Limite importante:** a verificação é de cabeçalho, não decodificação integral nem avaliação de qualidade visual. Uma imagem com cabeçalho válido ainda pode ter bytes internos corrompidos; aprovação editorial e do usuário permanece necessária.

A ação GitHub de integridade já roda automaticamente quando o catálogo, as histórias, imagens ou o auditor mudam. Seus resultados são apenas contagens; nenhuma imagem, segredo, identidade, Casa ativa do snapshot, token, conteúdo narrativo ou caminho de arquivo é gravado nos logs. O algoritmo não cria nem publica nada no Firebase.

`readyForPlayers=false`, `releaseDecision=NO_GO`, `reviewApproved=false` continuam obrigatórios.