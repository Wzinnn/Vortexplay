# VÓRTEX PLAY — Android

Esta versão Android foi preparada para testar uma conta Xtream autorizada antes da instalação final do canal Roku. O aplicativo inicia em **retrato** para login e descoberta do catálogo; ao iniciar uma reprodução, abre o player em **paisagem** e volta ao retrato ao fechar o vídeo.

## Fluxo de teste

| Etapa | Resultado esperado |
|---|---|
| Abrir o aplicativo | A tela “Conecte sua lista” aparece em formato vertical. |
| Informar acesso Xtream | O app aceita endereço de servidor, ou URL Xtream completa com `username` e `password`, além dos campos separados. |
| Validar a conta | As abas **Canais**, **Filmes** e **Séries** exibem apenas as categorias do tipo correspondente. |
| Abrir uma série | A lista de episódios é ordenada por temporada e episódio. |
| Reproduzir um episódio | O app muda para paisagem e mostra pausa, retorno de 10 segundos e avanço de 10 segundos. |
| Terminar um episódio | O próximo episódio disponível na fila é iniciado automaticamente. |

As credenciais são usadas somente para consultas e reprodução na conta informada pelo usuário. Elas não devem ser enviadas por chat nem inseridas no código-fonte.

## Desenvolvimento

Use `pnpm start` para abrir o projeto no Expo Go, `pnpm check` para validar os tipos e `pnpm test` para executar os testes unitários do fluxo Xtream. O perfil `preview` em `eas.json` produz um APK de distribuição interna quando a compilação remota é concluída.

> A versão Android valida o fluxo de conta e player, mas a versão Roku ainda deve ser testada na TV porque o sistema de player e o controle remoto são diferentes.
