// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT) that are long or shared; short labels live next to their component. */
export const t = {
  update: {
    available: 'Há uma nova versão da app.',
    hint: 'A página vai recarregar: guarda primeiro o que estiveres a escrever.',
    apply: 'Atualizar',
  },
  feedback: {
    footer: 'Sugestões e problemas',
    subject: 'Sugestão ou problema',
    bodyStart: 'Escreve aqui a tua mensagem.',
    technical: '— Informação técnica (podes apagar) —',
    version: (version: string) => `Versão: ${version}`,
    page: (page: string) => `Página: ${page}`,
  },
  legal: {
    copyright: '© 2026 Paulo Barbosa',
    license: 'Código aberto, licença AGPL-3.0',
    source: 'Código no GitHub',
    version: (version: string, commit: string) => `Versão ${version} (${commit})`,
  },
  install: {
    title: 'Aplicação',
    intro:
      'Instala o Validómetro no telemóvel ou no computador: abre pelo ícone, em ecrã inteiro, como uma app.',
    button: 'Instalar app',
    steps: {
      ios: [
        'Abre esta página no Safari.',
        'Toca no botão Partilhar (o quadrado com a seta para cima).',
        'Escolhe “Adicionar ao ecrã principal” e confirma.',
      ],
      'safari-mac': [
        'No Safari, abre o menu Ficheiro (ou o botão Partilhar).',
        'Escolhe “Adicionar à Dock” e confirma.',
      ],
      'firefox-android': [
        'Abre o menu do Firefox (⋮).',
        'Escolhe “Instalar” ou “Adicionar ao ecrã principal” e confirma.',
      ],
      'firefox-desktop': [
        'O Firefox para computador não instala apps web.',
        'Para instalar, abre esta página no Chrome ou no Edge. Também podes usar a app aqui no Firefox: funciona igual, só não tem ícone próprio.',
      ],
      samsung: [
        'Abre o menu do Samsung Internet (☰).',
        'Escolhe “Adicionar página a” → “Ecrã principal” e confirma.',
      ],
      chromium: [
        'No Chrome ou Edge: abre o menu do browser (⋮).',
        'Escolhe “Instalar app” ou “Adicionar ao ecrã principal”.',
        'Se o browser só oferecer “Criar atalho”, atualiza o Chrome e os Serviços do Google Play e tenta de novo; o atalho também funciona.',
      ],
    },
  },
} as const;
