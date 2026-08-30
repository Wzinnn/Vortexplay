export type LegalSection = {
  id: "terms" | "privacy" | "copyright";
  label: string;
  title: string;
  paragraphs: string[];
};

export const LEGAL_SECTIONS: LegalSection[] = [
  {
    id: "terms",
    label: "Termos de Uso",
    title: "Termos de Serviço / Uso",
    paragraphs: [
      "O VÓRTEX PLAY é uma interface de reprodução para contas e playlists compatíveis. O usuário deve conectar somente fontes para as quais tenha autorização de acesso e reprodução.",
      "É proibido redistribuir, retransmitir, revender, gravar, copiar, espelhar ou disponibilizar sinais, filmes, séries ou canais a terceiros sem autorização. Também não é permitido compartilhar credenciais ou utilizar quantidade de telas simultâneas superior ao limite definido pela fonte conectada.",
      "O usuário é responsável pela legitimidade da lista, conta ou servidor informado. A disponibilidade, programação e qualidade dos conteúdos fornecidos por terceiros dependem da respectiva fonte.",
    ],
  },
  {
    id: "privacy",
    label: "Privacidade",
    title: "Política de Privacidade — LGPD / GDPR",
    paragraphs: [
      "O aplicativo pode armazenar localmente os dados necessários para reconectar a fonte escolhida, preferências, histórico ou posição de reprodução, itens em Minha lista e configurações do perfil.",
      "Dados de navegação, eventos técnicos e falhas podem ser tratados para diagnóstico, segurança e melhoria de desempenho. Cookies e tecnologias semelhantes, quando utilizados em páginas ou integrações, devem ser informados ao usuário e tratados conforme a finalidade e o consentimento exigido.",
      "O usuário pode solicitar informações sobre os dados tratados, correção, eliminação, portabilidade, oposição ou revogação de consentimento, observadas as hipóteses legais de retenção. O responsável pela operação deve inserir um canal oficial de contato do controlador antes da publicação definitiva.",
    ],
  },
  {
    id: "copyright",
    label: "Direitos autorais",
    title: "Avisos de Direitos Autorais e Licenciamento",
    paragraphs: [
      "Nomes, marcas, logotipos, filmes, séries, episódios, programas, eventos esportivos, canais, imagens, áudios e demais materiais exibidos por uma fonte conectada pertencem aos seus respectivos detentores, licenciadores ou distribuidores.",
      "A identificação de um conteúdo no aplicativo não transfere propriedade nem concede licença ao usuário. A fonte conectada deve respeitar território, prazo, número de telas e demais condições definidas pelos titulares ou distribuidores.",
      "Nenhum titular, distribuidor ou licença específica é declarado nesta tela sem confirmação documental. O responsável pela operação deve manter um canal oficial para notificações relacionadas a direitos autorais.",
    ],
  },
];
