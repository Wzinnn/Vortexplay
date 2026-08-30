# Project TODO

- [x] Aplicar o logo fornecido pelo usuário à tela inicial e ao ícone do Vórtex Play.
- [x] Criar login Xtream em formato vertical com validação e armazenamento seguro no aparelho.
- [x] Carregar e separar canais ao vivo, filmes e séries em abas próprias.
- [x] Abrir o player em paisagem e voltar ao retrato ao sair da reprodução.
- [x] Adicionar pause, salto de 10 segundos para trás, salto de 10 segundos para frente e próximo episódio automático.
- [x] Validar o projeto e preparar um caminho de instalação para Android.
- [ ] Testar o APK no Android com a conta Xtream autorizada e registrar qualquer erro de carregamento ou reprodução.
- [x] Fazer o formulário de login subir e rolar quando o teclado Android estiver aberto, sem esconder campos ou o botão de acesso.
- [x] Exibir a causa técnica segura de falhas Xtream, distinguindo servidor inacessível, porta bloqueada, resposta inválida e conta recusada.
- [x] Aceitar o formato de servidor e porta usado pela lista validada pelo usuário em outro aplicativo.
- [ ] Instalar e retestar o APK 1.0.1 com a lista autorizada, verificando se o erro agora apresenta uma causa específica.
- [ ] Confirmar se o APK 1.0.1 foi instalado no aparelho, pois o último teste ainda exibiu a mensagem genérica da versão anterior.
- [ ] Ampliar a detecção de endpoints Xtream para contas que não respondem pelo caminho padrão `player_api.php`.
- [x] Configurar explicitamente a política nativa Android para permitir a conexão HTTP do servidor Xtream autorizado.
- [x] Testar o endpoint informado com as credenciais autorizadas pelo usuário, sem registrar os dados em arquivos ou mensagens.
- [x] Validar o carregamento separado de canais, filmes e séries antes de enviar o próximo APK.
- [x] Inspecionar o AndroidManifest gerado no APK 1.0.1 para localizar por que a exceção HTTP não foi aplicada.
- [x] Implementar uma configuração de segurança de rede nativa e verificá-la no artefato gerado antes da nova instalação.
- [x] Implementar fallback de playlist M3U para provedores que não disponibilizam `player_api.php`.
- [x] Classificar entradas M3U pelos caminhos de stream e categorias para separar canais ao vivo, filmes e séries.
- [x] Mover o menu de três traços para o canto esquerdo, como no preview web, e remover as abas que se atropelam.
- [x] Redesenhar o player com controles clean e experiência imersiva.
- [ ] Recompilar e testar a nova navegação no Android antes de entregar o APK.
- [x] Reorganizar a home em hero cinematográfico, continuar assistindo, lançamentos e trilhos horizontais por categoria.
- [x] Adicionar tela/modal de detalhes com capa, metadados, descrição, botão assistir e ação de adicionar à minha lista.
- [x] Implementar busca global com resultados agrupados por canais, filmes e séries.
- [x] Persistir progresso de reprodução localmente e exibir a seção continuar assistindo.
- [x] Criar minha lista local para filmes e séries, sem inventar avaliações ou depoimentos.
- [x] Melhorar estados de carregamento, vazio, erro e reconexão da playlist.
- [x] Revisar acessibilidade, foco por controle remoto, áreas de toque e orientação automática do player.
- [x] Recompilar e testar o APK completo antes da entrega.
- [ ] Atualizar a integração Roku com as melhorias de navegação e organização validadas no Android.
- [x] Criar abertura com animação de vórtex se abrindo e logo VÓRTEX PLAY centralizada.
- [x] Substituir a navegação lateral pela navegação inferior adaptável com Início, Canais, Filmes e Séries.
- [x] Corrigir área segura para impedir que conteúdo e navegação fiquem atrás da barra de tarefas ou indicador do sistema.
- [x] Restaurar automaticamente a sessão Xtream e o catálogo ao reabrir o aplicativo.
- [x] Reorganizar Início com últimos filmes, últimas séries e conteúdos de filmes e séries retomáveis.
- [x] Organizar canais ao vivo por categorias reais da lista, como esporte, SporTV e Premiere quando disponíveis.
- [ ] Validar cada parte separadamente e não gerar novo APK sem aprovação do usuário.
- [x] Criar tela de Configurações com toggles de reprodução, temas, cores de destaque e idiomas preferidos.
- [x] Criar detalhes de mídia com hero, metadados, sinopse, Minha lista, temporadas e episódios reproduzíveis.
- [x] Criar tela de Perfil e gerenciamento de conta com avatar, plano e renovação.
- [x] Criar controle parental com PIN de quatro dígitos e filtro de faixa etária.
- [x] Criar área de Termos de Uso, Privacidade e Legal com índice e navegação por seções.
- [x] Incluir Termos de Serviço com regras de uso simultâneo e proibição de redistribuição de sinal.
- [x] Incluir Política de Privacidade com LGPD/GDPR, navegação, histórico, cookies e dados pessoais.
- [x] Incluir avisos de direitos autorais e licenciamento sem inventar titulares ou licenças não confirmados.
- [x] Persistir preferências de configurações e perfil localmente sem inventar dados de assinatura.
- [ ] Validar cada tela no Android e avisar o usuário antes de gerar APK.
- [x] Criar tela de Configurações com toggles de reprodução, temas, cores de destaque e idiomas preferidos.
- [x] Criar detalhes de mídia com hero, metadados, sinopse, Minha lista, temporadas e episódios reproduzíveis.
- [x] Criar tela de Perfil e gerenciamento de conta com avatar, plano e renovação.
- [x] Criar controle parental com PIN de quatro dígitos e filtro de faixa etária.
- [x] Criar área de Termos de Uso, Privacidade e Legal com índice e navegação por seções.
- [x] Persistir preferências de configurações e perfil localmente sem inventar dados de assinatura.
- [ ] Validar cada tela no Android e avisar o usuário antes de gerar APK.

- [x] Exibir primeiro Meus filmes favoritos na aba Filmes.
- [x] Exibir primeiro Minhas séries favoritas na aba Séries.
- [x] Exibir primeiro Canais favoritos na aba Canais.
- [x] Manter Minha lista geral na tela Início.
- [x] Validar favoritos por setor sem gerar APK antes da aprovação.
- [x] Usuário aprovou todas as alterações para geração do APK final.
- [x] Incrementar a versão do APK final e executar validação completa.
- [x] Gerar e acompanhar a compilação remota do APK final.
- [x] Entregar o link do APK após a compilação bem-sucedida.

- [x] Adicionar margem inferior de 16dp na barra de pesquisa e offsets seguros entre header, busca, categorias e conteúdo.
- [x] Criar botão compacto Categorias com bottom sheet filtrado por aba e remoção do filtro ativo.
- [x] Garantir áudio não mutado por padrão e selecionar a primeira faixa disponível.
- [x] Reforçar resolução e headers de URLs de episódios para HLS/progressivo.
- [ ] Validar fallback explícito de codec H.264/AAC em aparelho Android real.
- [x] Ocultar tags [CAM] e [L] do título e exibir badges discretos no pôster.
- [x] Usar logos oficiais fornecidas pela fonte quando disponíveis, com fallback neutro sem repetir arte genérica.
- [ ] Validar a rodada sem gerar APK antes da aprovação.

- [x] Usuário aprovou a rodada de ajustes de layout, categorias, áudio, reprodução e badges.
- [x] Incrementar a versão do APK desta rodada.
- [ ] Validar e gerar o bundle Android desta rodada.
- [ ] Compilar e entregar o APK após o build remoto.

- [x] Corrigir contadores para usar título singular/plural conforme o tamanho real de cada lista.
- [x] Substituir o modal bloqueante de carregamento por skeleton ou spinner discreto.
- [x] Implementar carregamento incremental inicial de até 20 itens e lazy loading ao rolar.
- [x] Padronizar capas de Filmes e Séries em pôster vertical 2:3 ou 3:4 com cover.
- [x] Remover definitivamente as barras horizontais antigas de categorias.
- [x] Manter o botão Categorias abaixo da busca com bottom sheet e filtro removível.
- [x] Revalidar áudio não mutado, primeira faixa, headers e reprodução de episódios.
- [ ] Validar a rodada sem gerar APK até nova aprovação.

- [x] Corrigir o fundo nativo Android para eliminar o flash branco antes da intro VÓRTEX PLAY.
- [x] Garantir transição escura desde o primeiro frame até a renderização do catálogo.
- [x] Validar o bundle sem gerar APK até aprovação do usuário.

- [x] Centralizar geometricamente logo e nome na intro com fundo escuro desde o primeiro frame.
- [x] Implementar entrada fade/scale, brilho neon pulsante e saída fade/zoom em até 2,5 segundos.
- [x] Garantir que o catálogo continue carregando em segundo plano durante a intro.
- [x] Validar a duração e o bundle sem gerar APK antes da aprovação.

- [x] Usuário aprovou a intro centralizada e o splash escuro para compilação.
- [x] Incrementar a versão do APK desta rodada.
- [x] Validar e exportar o bundle Android desta rodada.
- [x] Compilar e entregar o APK desta rodada.

- [x] Mover o botão Categorias para a faixa superior, abaixo da busca e antes de favoritos e títulos.
- [x] Corrigir espaçamento e rolagem para impedir capas sobrepostas aos controles do topo.
- [x] Investigar o erro de reprodução de séries com foco na URL final do episódio, extensão e headers.
- [x] Adicionar teste de montagem de fonte de episódio quando o diagnóstico for concluído.
- [ ] Validar as duas correções sem gerar APK antes da aprovação.

- [x] Corrigir definitivamente a restauração da conta Xtream após fechar e reabrir o app.
- [x] Testar persistência com encerramento real, restauração de credenciais e recarga do catálogo.
- [ ] Revalidar splash sem flash branco, navegação inferior, Safe Area e posicionamento do botão Categorias.
- [ ] Revalidar contadores, skeleton, lazy loading, proporção das capas e favoritos por setor.
- [ ] Revalidar áudio não mutado, seleção de faixa, headers e reprodução de séries.
- [x] Gerar o APK somente depois de concluir todas as validações.

- [x] Fazer o título Catálogo e a barra superior rolarem junto com o conteúdo.
- [x] Remover qualquer posicionamento fixo que mantenha header ou barra de tarefa sobre as capas.
- [x] Garantir agrupamento independente de canais por grupo/categoria real da fonte.
- [x] Evitar fallback que misture todos os canais em um único bloco quando houver categorias disponíveis.
- [x] Validar rolagem e categorias antes de retomar ou gerar APK.

- [ ] Diagnosticar por que episódios de séries não iniciam no player.
- [ ] Corrigir montagem da fonte de episódio, extensão, headers e fallback de reprodução.
- [ ] Tornar o bottom sheet de Categorias rolável verticalmente e compatível com muitas opções.
- [x] Adicionar testes para URL de episódio e seleção de categoria.
- [ ] Validar os dois fluxos sem gerar APK até nova aprovação.

- [x] Garantir que tocar em qualquer episódio inicie diretamente a fonte correta no player.
- [ ] Validar o identificador e a extensão de cada episódio Xtream antes do playback.
- [x] Tornar o bottom sheet de categorias rolável em aparelhos pequenos e listas extensas.
- [ ] Criar cobertura de teste para toque/seleção de episódio e lista extensa de categorias.
- [ ] Validar novamente sem gerar APK antes da aprovação.

- [x] Fazer Minha lista e favoritos por setor usarem uma grade vertical totalmente rolável.
- [x] Remover trilho horizontal fixo da seção de favoritos sem perder a separação por tipo.
- [x] Ajustar o carregamento incremental e o espaçamento da grade vertical de favoritos.
- [x] Validar o scroll completo em Minha lista, Filmes, Séries e Canais sem gerar APK.

- [x] Reestruturar favoritos por setor em uma lista/grade vertical única, sem trilho horizontal fixo.
- [x] Adicionar paginação ou carregamento incremental aos favoritos verticais.
- [x] Associar canais Xtream por category_id e nome real da categoria, sem usar o ID do canal como fallback.
- [x] Manter categorias M3U pelo group-title e separar os grupos em seções independentes.
- [x] Tornar a lista de categorias rolável e carregar apenas a categoria selecionada inicialmente.
- [x] Validar as duas implementações sem gerar APK.
- [ ] Não iniciar compilação sem autorização explícita do usuário.

- [ ] Definir refresh diário do catálogo sem usar timer em processo que possa morrer em segundo plano.
- [ ] Atualizar canais, filmes e séries sem apagar favoritos, progresso, conta ou preferências.
- [ ] Salvar timestamp da última sincronização e exibir estado de atualização ao usuário.
- [ ] Manter o catálogo em cache para funcionamento offline e atualizar quando o app voltar ao primeiro plano.
- [ ] Validar refresh, cache, sessão persistente e falhas de rede sem gerar APK.
- [ ] Não compilar APK sem autorização explícita do usuário.

- [x] Manter a conta conectada ao fechar e reabrir o aplicativo; desconectar somente pelo botão Sair.
- [x] Remover da tela Configurações o seletor de temas e o alternador de cor de destaque.
- [x] Fixar o tema padrão Preto Cinema e a cor de destaque padrão do VÓRTEX PLAY.
- [x] Validar restauração da conta e das preferências sem compilar APK.
- [x] Ajustar a intro para abrir um vórtex no centro e revelar a logo no núcleo.
- [x] Exibir o nome VÓRTEX PLAY abaixo da logo durante a revelação.
- [x] Validar a animação da intro sem gerar APK.
- [x] Simplificar a tela Início para exibir somente filmes, sem textos introdutórios.
- [x] Mover a busca para uma lupa no cabeçalho, com abertura e fechamento do campo de pesquisa.
- [x] Exibir o ícone e o nome VÓRTEX PLAY juntos no lado esquerdo do cabeçalho.
- [x] Validar grade, rolagem e busca da tela Início sem gerar APK.
- [x] Remover os textos introdutórios restantes da área Início.
- [x] Fixar a capa de destaque da home para não mudar durante atualizações do catálogo.
- [x] Exibir filmes e séries recentes e uma seção Últimos filmes e séries assistidos / De onde parei.
- [x] Exibir no player barra de minutagem, posição atual e duração total.
- [x] Exibir informação de produção no player quando a fonte fornecer esse metadado.
- [x] Validar home e player sem gerar APK.
- [x] Fazer a capa de destaque mudar em toda sincronização bem-sucedida do catálogo.
- [x] Evitar repetir a capa anterior quando houver mais de um filme disponível.
- [x] Validar a rotação da capa sem gerar APK.
- [x] Otimizar o agrupamento de episódios M3U para listas extensas, evitando cópias repetidas e travamentos.
- [x] Testar carregamento real de categorias, filmes, séries e episódio representativo da conta fornecida.
- [x] Fazer o refresh diário de M3U ignorar o cache em memória e buscar a lista novamente.
- [x] Deduplicar requisições M3U simultâneas para não baixar três vezes uma lista extensa.
- [x] Preservar o catálogo em cache quando uma sincronização temporária falhar ou responder 503.
- [x] Não gravar o horário de sucesso quando nenhuma fonte do catálogo foi atualizada.

- [x] Criar habilidade reutilizável para diagnóstico seguro de apps streaming Android com Xtream/M3U.
- [x] Documentar teste de conectividade, fallback M3U, setores, categorias, episódios e URLs de playback.
- [x] Documentar validação de sessão, cache, refresh diário, intro, home e player.
- [x] Incluir regras para não expor credenciais, não inventar metadados e não gerar APK sem autorização.
- [x] Validar e entregar a habilidade no formato reutilizável do sistema.

- [x] Preparar versão Android 1.7.0 para compilação APK autorizada.
- [x] Executar validação final antes do build APK.
- [x] Compilar e acompanhar o APK Android via EAS.
- [x] Entregar o resultado do build APK ao usuário.

- [x] Inventariar código, assets, configurações, documentação, testes e artefatos relevantes para retomada.
- [x] Criar resumo de continuidade com estado atual, decisões, limitações e próximos passos.
- [x] Empacotar os projetos e arquivos necessários sem node_modules, caches, logs sensíveis ou credenciais.
- [x] Auditar o ZIP e confirmar ausência de segredos antes da entrega.
- [x] Entregar pacote ZIP de retomada ao usuário.

- [x] Antes de qualquer versão para outro console, levantar requisitos específicos da plataforma e do ecossistema.
- [x] Avaliar SDK/linguagem, formato do pacote, assinatura, loja, permissões, autenticação, armazenamento e limites de rede.
- [x] Adaptar navegação por controle/D-pad, foco, resolução, orientação, ciclo de vida, player e tratamento de erros.
- [x] Definir matriz de testes em emulador e hardware real antes de declarar compatibilidade.
- [x] Registrar riscos, requisitos de publicação e diferenças em relação ao Android antes de implementar.

- [x] Corrigir seek de ±10 segundos para não congelar o frame, zerar o contador ou interromper a mídia.
- [x] Tornar a barra de progresso interativa com toque e arraste para navegação no vídeo.
- [x] Exibir detalhes e opção Minha lista ao abrir séries antes de iniciar a reprodução.
- [x] Impedir encerramento ao abrir canais e tratar erro de fonte sem fechar o app.
- [x] Impedir que falha do player remova ou invalide a sessão conectada.
- [x] Adicionar testes de regressão para seek, source de canal, detalhes de série e preservação da sessão.
- [x] Validar TypeScript, testes e bundle sem gerar APK nesta rodada.

- [x] Refazer a intro com vórtex espiral dinâmico de partículas roxas/violetas sobre fundo preto profundo.
- [x] Manter a câmera estática e posicionar apenas VÓRTEX PLAY no centro, sem slogan, ícone, botão, caixa ou moldura.
- [x] Aplicar aparência metálica prateada ao texto com reflexos roxos sutis.
- [x] Validar animação, desempenho e entrada/saída da intro sem gerar APK.

- [x] Atualizar o APK para a versão 1.7.1 com a nova intro de partículas.
- [x] Executar validação final de TypeScript, testes e bundle antes do build.
- [x] Compilar e acompanhar o APK Android autorizado via EAS.
- [x] Baixar e entregar o APK 1.7.1 ao usuário.

- [ ] Corrigir a restauração da sessão para manter a conta conectada após fechar e reabrir o app.
- [ ] Corrigir a abertura de episódio para reproduzir exatamente o episódio selecionado, sem iniciar o episódio errado.
- [ ] Investigar e corrigir o travamento de filmes e séries após aproximadamente 5 segundos.
- [ ] Fazer os controles do player desaparecerem automaticamente após iniciar canais, filmes e séries.
- [ ] Garantir que tocar na tela revele novamente os controles em todos os players.
- [ ] Adicionar regressões para sessão, episódio selecionado, continuidade de playback e auto-hide dos controles.
- [ ] Validar TypeScript, testes e bundle sem gerar APK.

- [x] Transformar a aba de login em uma tela inteira sem catálogo ou conteúdo concorrendo pela atenção.
- [x] Manter branding, campos de servidor/usuário/senha, conexão, loading e mensagens de erro na tela focada.
- [x] Validar teclado, rolagem e fluxo de conta restaurada sem gerar APK.

- [x] Exibir onboarding somente na primeira abertura, imediatamente após a intro.
- [x] Criar tela de onboarding com logo superior, título, slogan e CTA roxo PRÓXIMO.
- [x] Persistir conclusão do onboarding e abrir direto em Início nas próximas entradas.
- [x] Manter a sessão persistente e não deslogar o usuário ao avançar ou reabrir o app.
- [x] Adicionar abas Servidor e Lista M3U no login com modo ativo destacado.
- [x] Adicionar checkbox obrigatório de confirmação de direito de acesso à fonte e conteúdo.
- [x] Adicionar suporte visual com WhatsApp e aviso de reprodutor neutro, sem sugerir hospedagem ou distribuição de mídia.
- [x] Validar onboarding, login e persistência sem gerar APK.

- [x] Usar roxo neon no botão PRÓXIMO do onboarding, substituindo o amarelo/dourado, com texto de alto contraste.

- [ ] Remover qualquer aparição inicial ou posterior do ícone na intro de vídeo.
- [ ] Manter somente o vórtex espiral contínuo e o texto central VÓRTEX PLAY no vídeo 9:16.
- [ ] Preparar o ativo/prompt da intro sem gerar APK nesta etapa.

- [ ] Remover as camadas visíveis de partículas da intro e manter somente o nome VÓRTEX PLAY.
- [ ] Criar brilho neon roxo traseiro, pulsante e suave, iluminando a tipografia de trás para frente.
- [ ] Preservar fundo preto, câmera estática e ausência de ícone, slogan, botão, moldura e textos extras.
- [ ] Validar a intro simplificada, onboarding e login sem gerar APK.

- [ ] Auditar novamente a persistência da conta ao fechar e reabrir o app.
- [ ] Garantir que AppState/background não execute limpeza de credenciais.
- [ ] Garantir que somente o comando explícito Sair remova a sessão.
- [ ] Adicionar regressões de restauração da conta e validar sem gerar APK.

- [x] Abrir séries diretamente na área de detalhes da série clicada, sem popup intermediário.
- [x] Manter favoritar, temporadas, episódios e reprodução no fluxo direto de séries.
- [x] Confirmar que filmes continuam funcionando no fluxo apropriado.
- [x] Validar navegação e player sem gerar APK.

- [x] Incrementar versão Android para o APK com séries em tela cheia e episódio selecionado.
- [x] Executar validação final de TypeScript, testes e bundle antes do build.
- [x] Compilar e acompanhar o APK autorizado via EAS.
- [x] Baixar, verificar e entregar o APK atualizado.

- [ ] Reabrir diagnóstico após o APK 1.7.2 reproduzir os mesmos problemas no aparelho real.
- [ ] Comparar o comportamento do APK instalado com o código e a versão compilada.
- [ ] Obter evidências do aparelho: modelo Android, logs do player, momento do travamento e estado da sessão.
- [ ] Auditar novamente expo-video, troca de fonte, buffering, seek e SecureStore.
- [ ] Só preparar novo APK depois de identificar a causa e validar a correção.

- [ ] Reinvestigar por que filmes e episódios ainda travam ou não avançam após os primeiros segundos.
- [ ] Reinvestigar por que a conta não é restaurada após fechar e reabrir o app.
- [ ] Confirmar no código o formato exato persistido, a leitura no boot e o caminho de logout explícito.
- [ ] Testar fontes de filme e episódio com headers, buffering e estado de reprodução real.
- [ ] Adicionar regressões específicas para continuidade de mídia e restauração de sessão.
- [ ] Não gerar novo APK até a causa ser identificada e validada.

- [x] Verificar compatibilidade de player VLC nativo com Expo SDK 57 e Android atual.
- [x] Mapear impacto em URLs Xtream/M3U, headers, codecs, HLS, seek e controles.
- [x] Definir se VLC será substituto, fallback ou integração nativa separada.
- [x] Preservar sessão, catálogo, favoritos, histórico e navegação durante a migração.
- [x] Validar a arquitetura e só então implementar, sem gerar APK nesta fase.
- [x] Atualizar o compilado ZIP após cada modificação relevante, incluindo código, documentação, TODO e ponto de retomada.
- [x] Adicionar expo-libvlc-player 57.0.23 e registrar o plugin no app.json.
- [x] Substituir o componente expo-video por LibVLC com áudio ativo, headers, cache, seek e autoavanço.
- [x] Limitar gravações de progresso para reduzir bloqueios durante a reprodução.
- [x] Executar TypeScript, testes unitários, exportação Android e prebuild nativo sem gerar APK.
- [ ] Validar reprodução VLC, buffering após 5 segundos, headers, áudio, seek e autoavanço em aparelho Android real.
- [x] Atualizar o ZIP de retomada desta modificação.
- [x] Compilar o APK Android autorizado da rodada LibVLC.
- [x] Verificar integridade, versão e artefato do APK compilado.
- [x] Atualizar o ZIP de retomada após a geração do APK.
- [x] Corrigir auto-ocultação dos controles do player VLC em filmes, séries e canais.
- [x] Permitir múltiplos avanços/retrocessos de 10 segundos na mesma reprodução.
- [x] Permitir múltiplos arrastes na barra de progresso sem bloquear o controle.
- [x] Validar que a reprodução contínua já funcional de filmes e séries não seja regressada.
- [x] Atualizar o ZIP após concluir esta rodada de correções.
- [x] Corrigir a desconexão da conta ao sair e reabrir o aplicativo.
- [x] Auditar SecureStore, AsyncStorage, hidratação de boot e estado showLogin.
- [x] Garantir que falha do player, refresh ou background não removam a sessão.
- [x] Criar regressões de persistência e logout explícito.
- [x] Atualizar o ZIP após concluir a correção da sessão.
- [x] Avaliar se Supabase deve participar da persistência da sessão do app Android.
- [x] Não armazenar senha Xtream em texto aberto no Supabase.
- [x] Definir fallback local seguro caso a integração remota não esteja disponível.
- [x] Validar a causa local da desconexão antes de migrar a sessão para backend.
- [x] Atualizar o ZIP se houver modificação nesta avaliação.
- [x] Regra permanente: após qualquer ajuste, correção ou novo recurso, atualizar o TODO, documentar o ponto de retomada e salvar/validar um novo ZIP antes de encerrar.

- [ ] Validar no aparelho real a sessão persistente, a barra de progresso, a duração e os seeks repetidos após novo APK.
