# Respostas privadas atrasadas no portal Firebase

A página `/firebase-access` não deve mostrar documentos de uma conta anterior depois de sair, trocar de jogador ou iniciar outra consulta.

As consultas de **Casas** (ficha, unidades, espionagem, batalha, economia e Tesouro) e de **Jornal** agora verificam, antes de publicar resultado ou erro, três condições: requisição mais recente do recurso, geração de sessão ainda ativa e UID atual igual ao UID de início. O logout invalida tanto as respostas em trânsito quanto o cache visual, limpando também economia, batalhas, chave de missiva e chave editorial.

O controle não dá acesso a dados por si só: as APIs Firebase continuam exigindo ID token e validação de Casa pelo servidor. Os testes sintéticos cobrem logout, nova requisição, troca de conta e falta de identidade. Nenhum dado Cloud foi modificado nesta etapa.
