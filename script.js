'use strict';

/* =========================================================
   Antes de colar na IA – lógica do site
   Tudo roda no navegador. Nenhum texto é enviado ou salvo.

   Parte 1: detecção e censura (não usa a página; dá para testar no Node)
   Parte 2: checklist de boas práticas (conteúdo do manual)
   Parte 3: interface
   ========================================================= */

/* ---------------------------------------------------------
   PARTE 1 – DETECÇÃO E CENSURA
   --------------------------------------------------------- */

function soDigitos(valor) {
  return valor.replace(/\D/g, '');
}

// Confere os dígitos verificadores do CPF
function cpfValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(d[t])) return false;
  }
  return true;
}

// Confere os dígitos verificadores do CNPJ
function cnpjValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calcular = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((s, n, i) => s + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcular(d.slice(0, 12)) === Number(d[12]) && calcular(d.slice(0, 13)) === Number(d[13]);
}

// Senhas e chaves: o valor é sempre removido
const RE_SENHA = /\b(senha|password|token|api[\s_-]?key|chave de acesso|chave de api)(\s*[:=]\s*)(\S+)/gi;

// Padrões detectados. A ordem importa: os mais específicos vêm primeiro.
// "grupo" liga cada regra a uma opção da tela.
const REGRAS = [
  { tipo: 'EMAIL',     grupo: 'contatos',   re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { tipo: 'CNPJ',      grupo: 'documentos', re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g },
  { tipo: 'CNPJ',      grupo: 'documentos', re: /\b\d{14}\b/g, valida: cnpjValido },
  { tipo: 'CPF',       grupo: 'documentos', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  { tipo: 'CPF',       grupo: 'documentos', re: /\b\d{11}\b/g, valida: cpfValido },
  // "RG 1.234.567" ou "matrícula 48213": esconde só o número
  { tipo: 'DOCUMENTO', grupo: 'documentos', re: /\b(RG|matr[íi]cula)(\s*(?:n[º°o]\.?\s*)?[:\-]?\s*)([\dX][\d.\-\/X]{2,}[\dX])/gi, soValor: true },
  { tipo: 'TELEFONE',  grupo: 'contatos',   re: /(?:\+55\s?)?(?:\(\d{2}\)\s?|\b\d{2}\s)?(?:9\s?)?\d{4}-\d{4}\b/g },
  { tipo: 'TELEFONE',  grupo: 'contatos',   re: /(?:\+55\s?)?\(\d{2}\)\s?9?\d{8}\b/g },
  { tipo: 'TELEFONE',  grupo: 'contatos',   re: /\b\d{2}9\d{8}\b/g }, // celular sem pontuação: 81998765432
  { tipo: 'CEP',       grupo: 'contatos',   re: /\b\d{5}-\d{3}\b/g },
  { tipo: 'VALOR',     grupo: 'valores',    re: /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?(?!\d)|R\$\s?\d+(?:,\d{2})?/g },
  { tipo: 'DATA',      grupo: 'datas',      re: /\b\d{2}\/\d{2}\/(?:\d{4}|\d{2})\b/g },
];

// Assuntos que o site NÃO esconde (não dá para reconhecer pelo formato),
// mas que geram um aviso para o usuário revisar.
const ALERTAS = {
  saude:      /\b(atestado|laudo|diagn[óo]stico|CID\b|doen[çc]a|exame m[ée]dico|afastad[oa]|licen[çc]a m[ée]dica|tratamento m[ée]dico|medicamento)/i,
  contrato:   /\b(contrato|cl[áa]usula|proposta comercial|confidencial|sigilos[oa])/i,
  financeiro: /\b(sal[áa]rio|remunera[çc][ãa]o|folha de pagamento)/i,
  sensiveis:  /\b(religi[ãa]o|religios[oa]|partido pol[íi]tico|sindicato|sindical|etnia|[ée]tnic[oa]|orienta[çc][ãa]o sexual|biometria|biom[ée]tric[oa]|gen[ée]tic[oa])/i,
};

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Troca os dados encontrados por marcadores como [CPF_1].
 * O mesmo dado recebe sempre o mesmo marcador.
 * @returns {{texto: string, contagem: Object, alertas: Object}}
 */
function protegerTexto(texto, opcoes = {}) {
  const op = Object.assign(
    { documentos: true, contatos: true, valores: true, datas: false, nomes: [] },
    opcoes
  );
  const mapas = {};
  const contagem = {};

  const marcador = (tipo, valor) => {
    const chave = (tipo === 'NOME' || tipo === 'EMAIL')
      ? valor.trim().toLowerCase()
      : (soDigitos(valor) || valor);
    if (!mapas[tipo]) mapas[tipo] = new Map();
    if (!mapas[tipo].has(chave)) {
      mapas[tipo].set(chave, `[${tipo}_${mapas[tipo].size + 1}]`);
      contagem[tipo] = (contagem[tipo] || 0) + 1;
    }
    return mapas[tipo].get(chave);
  };

  // 1. Senhas: sempre removidas
  let senhas = 0;
  let saida = texto.replace(RE_SENHA, (_, rotulo, separador) => {
    senhas++;
    return `${rotulo}${separador}[SENHA REMOVIDA]`;
  });
  if (senhas) contagem.SENHA = senhas;

  // 2. Padrões (CPF, e-mail, telefone…)
  for (const regra of REGRAS) {
    if (!op[regra.grupo]) continue;
    saida = saida.replace(regra.re, (...args) => {
      const encontrado = args[0];
      if (regra.soValor) return args[1] + args[2] + marcador(regra.tipo, args[3]);
      if (regra.valida && !regra.valida(encontrado)) return encontrado;
      return marcador(regra.tipo, encontrado);
    });
  }

  // 3. Nomes informados pelo usuário (os mais longos primeiro)
  const nomes = [...new Set(op.nomes.map((n) => n.trim()).filter((n) => n.length >= 2))]
    .sort((a, b) => b.length - a.length);
  // Uma única busca com todos os nomes: a numeração segue a ordem do texto
  if (nomes.length) {
    const alternativas = nomes.map(escaparRegex).join('|');
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternativas})(?![\\p{L}\\p{N}])`, 'giu');
    saida = saida.replace(re, (encontrado) => marcador('NOME', encontrado));
  }

  // 4. Avisos sobre assuntos que precisam de revisão humana
  const alertas = {};
  for (const [chave, re] of Object.entries(ALERTAS)) {
    if (re.test(texto)) alertas[chave] = true;
  }

  return { texto: saida, contagem, alertas };
}

/* ---------------------------------------------------------
   PARTE 2 – CHECKLIST DE BOAS PRÁTICAS
   Conteúdo tirado do manual "IA no trabalho com segurança".
   nivel: 0 verde, 1 amarelo, 2 vermelho, 3 bloqueio total
   --------------------------------------------------------- */

const ITENS = [
  {
    id: 'senhas', nivel: 3,
    titulo: 'Senhas ou códigos de acesso',
    descricao: 'Senhas, tokens, chaves de sistema.',
    pratica: 'Apague antes de qualquer coisa. Senhas e credenciais não devem ir para nenhuma ferramenta de IA, nem para a corporativa.',
    fonte: 'Manual, Semáforo dos dados (atenção)',
  },
  {
    id: 'saude', nivel: 2,
    titulo: 'Dados de saúde',
    descricao: 'Atestados, laudos, afastamentos, exames.',
    pratica: 'Lance os dados direto no sistema da empresa. Dados de saúde são dados pessoais sensíveis e não devem ir para ferramentas de IA públicas.',
    fonte: 'LGPD, art. 5º, II; Manual, Caso 4',
  },
  {
    id: 'sensiveis', nivel: 2,
    titulo: 'Religião, política, sindicato, origem racial ou biometria',
    descricao: 'Também vida sexual e dados genéticos.',
    pratica: 'São dados pessoais sensíveis e exigem proteção redobrada. Não insira em ferramentas de IA públicas.',
    fonte: 'LGPD, art. 5º, II',
  },
  {
    id: 'nomes', nivel: 2,
    titulo: 'Nomes de pessoas',
    descricao: 'Clientes, funcionários, fornecedores.',
    pratica: 'Troque os nomes por “Cliente A”, “Funcionário B” ou peça à IA só um modelo genérico e preencha os nomes depois, fora da ferramenta.',
    fonte: 'LGPD, art. 5º, I; Manual, Caso 2',
  },
  {
    id: 'documentos', nivel: 2,
    titulo: 'CPF, CNPJ, RG ou matrícula',
    descricao: 'Qualquer número que identifique alguém.',
    pratica: 'Apague as colunas ou trechos com esses números. Para planilhas, peça à IA só a fórmula e faça o resumo no próprio Excel.',
    fonte: 'LGPD, art. 5º, I; Manual, Caso 1',
  },
  {
    id: 'contatos', nivel: 2,
    titulo: 'Telefone, e-mail ou endereço',
    descricao: 'Contatos de clientes ou colegas.',
    pratica: 'Remova os contatos antes de colar. Se precisar deles no texto final, preencha depois, fora da IA.',
    fonte: 'LGPD, art. 5º, I; Manual, Caso 2',
  },
  {
    id: 'financeiro', nivel: 2,
    titulo: 'Salários, valores ou dados financeiros',
    descricao: 'Folha de pagamento, valores devidos, faturamento.',
    pratica: 'Troque os valores reais por exemplos ou use só ferramenta corporativa autorizada, quando a política da empresa permitir.',
    fonte: 'Manual, Semáforo dos dados; Caso 2',
  },
  {
    id: 'contrato', nivel: 2,
    titulo: 'Contrato, proposta ou plano estratégico',
    descricao: 'Documentos confidenciais da empresa.',
    pratica: 'Não cole o documento. Faça uma pergunta genérica, como “o que costuma constar em uma cláusula de rescisão?”, ou use a ferramenta corporativa autorizada. Na dúvida, consulte o jurídico.',
    fonte: 'Manual, Caso 3; políticas internas de sigilo',
  },
  {
    id: 'interno', nivel: 1,
    titulo: 'Informação interna sem nomes',
    descricao: 'Rascunho de comunicado, relatório só com totais por setor.',
    pratica: 'Pode usar, mas só em ferramenta autorizada pela empresa e com a conta de trabalho, não com conta pessoal.',
    fonte: 'Manual, Semáforo dos dados; Guia IA Generativa (SGD/Serpro)',
  },
  {
    id: 'nada', nivel: 0, exclusivo: true,
    titulo: 'Nada disso',
    descricao: 'Texto público, modelo sem dados reais, dúvida de Excel ou redação.',
    pratica: 'Pode usar a IA. Mesmo assim, confira números, datas, nomes e leis que ela citar, porque ela pode inventar.',
    fonte: 'Manual, Semáforo dos dados; Caso 6',
  },
];

const VEREDITOS = [
  { titulo: 'Pode usar', texto: 'Não há dados que exigem cuidado. Ainda assim, revise o que a IA responder.', luz: 'verde' },
  { titulo: 'Use com cuidado', texto: 'Só em ferramenta autorizada pela empresa, com a sua conta de trabalho.', luz: 'amarela' },
  { titulo: 'Não cole em IA pública', texto: 'Remova ou troque os dados marcados. Sem isso, use só ferramenta corporativa autorizada, quando a política da empresa permitir.', luz: 'vermelha' },
  { titulo: 'Não use IA com este documento', texto: 'Ele tem senhas ou códigos de acesso. Remova-os antes de qualquer coisa.', luz: 'vermelha' },
];

// Liga o que foi encontrado na Aba 1 aos itens da Aba 2
const TIPO_PARA_ITEM = {
  NOME: 'nomes', CPF: 'documentos', CNPJ: 'documentos', DOCUMENTO: 'documentos',
  EMAIL: 'contatos', TELEFONE: 'contatos', CEP: 'contatos',
  VALOR: 'financeiro', SENHA: 'senhas',
};

function itensSugeridos(resultado) {
  const ids = new Set();
  for (const tipo of Object.keys(resultado.contagem)) {
    if (TIPO_PARA_ITEM[tipo]) ids.add(TIPO_PARA_ITEM[tipo]);
  }
  for (const alerta of Object.keys(resultado.alertas)) ids.add(alerta);
  return [...ids];
}

function nivelDe(ids) {
  return ids.reduce((max, id) => {
    const item = ITENS.find((i) => i.id === id);
    return item ? Math.max(max, item.nivel) : max;
  }, -1);
}

// Permite testar a Parte 1 e 2 no Node: node -e "require('./script.js')"
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { protegerTexto, cpfValido, cnpjValido, itensSugeridos, nivelDe, ITENS };
}

/* ---------------------------------------------------------
   PARTE 3 – INTERFACE
   --------------------------------------------------------- */

const TEXTO_EXEMPLO = `Prezada equipe,

Segue a lista de clientes com faturas em atraso para o envio da cobrança:

Mariana Torres, CPF 529.982.247-25, telefone (81) 99876-5432, e-mail mariana.torres@exemplo.com, valor em aberto R$ 1.250,00.
Carlos Henrique Lima, CPF 111.444.777-35, telefone 81 3456-7890, e-mail carlos.lima@exemplo.com, valor em aberto R$ 870,50.

Empresa contratante: Comercial Exemplo Ltda, CNPJ 11.222.333/0001-81, CEP 50050-000.
O funcionário responsável, matrícula 48213, está afastado com atestado médico até 20/11/2026.
Acesso ao sistema de cobrança: senha: Cobranca@2026

Escreva um e-mail cordial de cobrança para cada cliente.

(Dados fictícios, criados só para demonstração.)`;

const NOMES_EXEMPLO = ['Mariana Torres', 'Carlos Henrique Lima'];

const ROTULOS = {
  NOME: ['nome', 'nomes'],
  CPF: ['CPF', 'CPFs'],
  CNPJ: ['CNPJ', 'CNPJs'],
  DOCUMENTO: ['RG ou matrícula', 'RGs ou matrículas'],
  EMAIL: ['e-mail', 'e-mails'],
  TELEFONE: ['telefone', 'telefones'],
  CEP: ['CEP', 'CEPs'],
  VALOR: ['valor', 'valores'],
  DATA: ['data', 'datas'],
  SENHA: ['senha', 'senhas'],
};

const TEXTOS_ALERTA = {
  saude: 'O texto parece falar de saúde (atestado, afastamento, diagnóstico). O site não esconde esse tipo de informação: apague esses trechos ou não use IA pública.',
  contrato: 'O texto parece ter conteúdo de contrato ou informação confidencial. Esconder os números não torna o conteúdo seguro: prefira uma pergunta genérica.',
  financeiro: 'O texto menciona salário ou remuneração. Confira se não sobrou nenhum valor ligado a uma pessoa.',
  sensiveis: 'O texto menciona religião, política, sindicato, origem racial ou biometria. São dados pessoais sensíveis: apague esses trechos.',
};

function escaparHtml(texto) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function juntarLista(partes) {
  if (partes.length <= 1) return partes.join('');
  return partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
}

function iniciar() {
  const $ = (id) => document.getElementById(id);

  const estado = { nomes: [], ultimoResultado: null };

  /* ----- Abas ----- */
  const abas = [$('aba-censurar'), $('aba-checklist')];
  const paineis = [$('painel-censurar'), $('painel-checklist')];

  function ativarAba(indice, focar = true) {
    abas.forEach((aba, i) => {
      const ativa = i === indice;
      aba.setAttribute('aria-selected', String(ativa));
      aba.tabIndex = ativa ? 0 : -1;
      paineis[i].hidden = !ativa;
    });
    if (focar) abas[indice].focus();
  }

  abas.forEach((aba, i) => {
    aba.addEventListener('click', () => ativarAba(i));
    aba.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        ativarAba((i + 1) % abas.length);
      }
    });
  });

  // Links do menu e do topo que abrem uma aba específica
  document.querySelectorAll('[data-aba]').forEach((link) => {
    link.addEventListener('click', () => ativarAba(Number(link.dataset.aba), false));
  });

  /* ----- Nomes ----- */
  const avisoNome = $('aviso-nome');

  function desenharNomes() {
    const lista = $('lista-nomes');
    lista.innerHTML = '';
    estado.nomes.forEach((nome, i) => {
      const li = document.createElement('li');
      li.textContent = nome;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.setAttribute('aria-label', `Remover ${nome}`);
      btn.addEventListener('click', () => {
        estado.nomes.splice(i, 1);
        desenharNomes();
      });
      li.appendChild(btn);
      lista.appendChild(li);
    });
  }

  function adicionarNome(nome) {
    const limpo = nome.trim().replace(/\s+/g, ' ');
    if (limpo.length < 2) {
      avisoNome.textContent = 'Digite um nome com pelo menos 2 letras.';
      return;
    }
    avisoNome.textContent = '';
    if (!estado.nomes.some((n) => n.toLowerCase() === limpo.toLowerCase())) {
      estado.nomes.push(limpo);
      desenharNomes();
    }
  }

  $('btn-add-nome').addEventListener('click', () => {
    adicionarNome($('campo-nome').value);
    $('campo-nome').value = '';
    $('campo-nome').focus();
  });
  $('campo-nome').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('btn-add-nome').click();
    }
  });
  $('btn-selecao').addEventListener('click', () => {
    const ta = $('texto-original');
    const selecionado = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (!selecionado.trim()) {
      avisoNome.textContent = 'Selecione um nome no texto primeiro.';
      return;
    }
    adicionarNome(selecionado);
  });

  /* ----- Exemplo e limpar ----- */
  $('btn-exemplo').addEventListener('click', () => {
    $('texto-original').value = TEXTO_EXEMPLO;
    estado.nomes = [...NOMES_EXEMPLO];
    desenharNomes();
    avisoNome.textContent = '';
  });

  $('btn-limpar').addEventListener('click', () => {
    $('texto-original').value = '';
    estado.nomes = [];
    estado.ultimoResultado = null;
    desenharNomes();
    avisoNome.textContent = '';
    $('resultado-censura').innerHTML =
      '<p class="vazio">Cole um texto e clique em <strong>Proteger texto</strong>. A versão sem dados sensíveis aparece aqui.</p>';
    $('texto-original').focus();
  });

  /* ----- Proteger ----- */
  $('btn-proteger').addEventListener('click', () => {
    const texto = $('texto-original').value;
    const area = $('resultado-censura');

    if (!texto.trim()) {
      area.innerHTML = '<p class="vazio">O campo está vazio. Cole um texto ou use o texto de exemplo.</p>';
      $('texto-original').focus();
      return;
    }

    const resultado = protegerTexto(texto, {
      documentos: $('op-documentos').checked,
      contatos: $('op-contatos').checked,
      valores: $('op-valores').checked,
      datas: $('op-datas').checked,
      nomes: estado.nomes,
    });
    estado.ultimoResultado = resultado;
    area.innerHTML = montarResultadoCensura(resultado);

    // No celular o resultado fica abaixo do formulário: rola até ele
    if (window.matchMedia('(max-width: 820px)').matches) {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      area.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    }

    $('btn-copiar').addEventListener('click', () => copiar(resultado.texto));
    $('btn-ver-praticas').addEventListener('click', () => {
      marcarItens(itensSugeridos(resultado));
      ativarAba(1);
    });
  });

  function montarResultadoCensura(resultado) {
    const partes = Object.keys(ROTULOS).filter((tipo) => resultado.contagem[tipo]).map((tipo) => {
      const n = resultado.contagem[tipo];
      const [singular, plural] = ROTULOS[tipo];
      return `${n} ${n === 1 ? singular : plural}`;
    });

    const resumo = partes.length
      ? `<p class="resumo">Escondemos <strong>${juntarLista(partes)}</strong>.</p>`
      : '<p class="resumo">Não encontramos CPF, e-mail, telefone ou outros padrões. Confira se o texto tem nomes e adicione-os à lista.</p>';

    let alertas = '';
    if (resultado.contagem.SENHA) {
      alertas += '<div class="alerta alerta-grave"><p><strong>Havia senha no texto.</strong> Ela foi removida, mas troque essa senha: ela estava escrita num documento.</p></div>';
    }
    for (const chave of Object.keys(resultado.alertas)) {
      const grave = chave === 'saude' || chave === 'sensiveis';
      alertas += `<div class="alerta${grave ? ' alerta-grave' : ''}"><p>${TEXTOS_ALERTA[chave]}</p></div>`;
    }

    const htmlTexto = escaparHtml(resultado.texto)
      .replace(/\[(NOME|CPF|CNPJ|DOCUMENTO|EMAIL|TELEFONE|CEP|VALOR|DATA)_(\d+)\]/g,
        '<span class="tarja">[$1_$2]</span>')
      .replace(/\[SENHA REMOVIDA\]/g, '<span class="tarja tarja-senha">[SENHA REMOVIDA]</span>');

    return `
      ${resumo}
      ${alertas}
      <div class="texto-protegido" tabindex="0" aria-label="Texto protegido">${htmlTexto}</div>
      <p class="nota">Leia o texto antes de copiar: o site não reconhece nomes que não estão na lista nem o sentido das frases.</p>
      <div class="acoes-resultado">
        <button type="button" class="botao-principal" id="btn-copiar">Copiar texto protegido</button>
        <button type="button" class="botao-secundario" id="btn-ver-praticas">Ver boas práticas para este texto</button>
      </div>
      <p class="aviso-inline" id="aviso-copia" role="status"></p>`;
  }

  async function copiar(texto) {
    const aviso = $('aviso-copia');
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Alternativa para navegadores sem acesso à área de transferência
      const temp = document.createElement('textarea');
      temp.value = texto;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
    }
    aviso.style.color = 'var(--verde)';
    aviso.textContent = 'Texto protegido copiado. Agora você pode colar na ferramenta de IA.';
  }

  /* ----- Checklist ----- */
  const listaItens = $('lista-itens');

  ITENS.forEach((item) => {
    const label = document.createElement('label');
    label.className = 'item' + (item.exclusivo ? ' item-nada' : '');
    label.innerHTML = `
      <input type="checkbox" value="${item.id}">
      <div><strong>${item.titulo}</strong><span>${item.descricao}</span></div>`;
    listaItens.appendChild(label);
  });

  const caixas = () => [...listaItens.querySelectorAll('input[type="checkbox"]')];

  listaItens.addEventListener('change', (e) => {
    const alvo = e.target;
    if (!alvo.checked) return desenharChecklist();
    // "Nada disso" desmarca os outros, e vice-versa
    if (alvo.value === 'nada') {
      caixas().forEach((c) => { if (c.value !== 'nada') c.checked = false; });
    } else {
      caixas().find((c) => c.value === 'nada').checked = false;
    }
    desenharChecklist();
  });

  function marcarItens(ids) {
    caixas().forEach((c) => { c.checked = ids.includes(c.value); });
    desenharChecklist();
  }

  function desenharChecklist() {
    const ids = caixas().filter((c) => c.checked).map((c) => c.value);
    const area = $('resultado-checklist');
    const nivel = nivelDe(ids);

    if (nivel < 0) {
      area.innerHTML = `
        <h2>Resultado</h2>
        <p class="vazio">Marque o que o documento tem para ver a cor do semáforo e os cuidados que você deve tomar.</p>`;
      return;
    }

    const v = VEREDITOS[nivel];
    const luzes = ['vermelha', 'amarela', 'verde']
      .map((cor) => `<span class="luz ${cor}${cor === v.luz ? ' ativa' : ''}"></span>`)
      .join('');

    const selecionados = ITENS.filter((i) => ids.includes(i.id)).sort((a, b) => b.nivel - a.nivel);
    const praticas = selecionados.map((i) => `
      <li class="p-${i.nivel}">
        <strong>${i.titulo}</strong>
        ${i.pratica}
        <span class="fonte">Base: ${i.fonte}</span>
      </li>`).join('');

    const errei = nivel >= 2 ? `
      <details class="errei">
        <summary>Colou dados por engano? Veja o que fazer</summary>
        <ol>
          <li>Pare: não envie mais nenhuma informação nessa conversa.</li>
          <li>Avise imediatamente o setor de TI, seu gestor ou o encarregado de dados.</li>
          <li>Anote o que foi enviado, em qual ferramenta e quando.</li>
          <li>Siga as orientações da TI, como apagar a conversa e trocar senhas expostas.</li>
        </ol>
        <p>A LGPD obriga a empresa a comunicar à ANPD e às pessoas afetadas incidentes que possam causar risco ou dano relevante (art. 48). Esconder o erro aumenta o dano.</p>
      </details>` : '';

    area.innerHTML = `
      <h2>Resultado</h2>
      <div class="semaforo-bloco nivel-${nivel}" style="margin-top:.7rem">
        <div class="semaforo" aria-hidden="true">${luzes}</div>
        <div class="veredito">
          <h3>${v.titulo}</h3>
          <p>${v.texto}</p>
        </div>
      </div>

      <div class="secao-resultado">
        <h3>O que fazer</h3>
        <ul class="praticas">${praticas}</ul>

        <h3>Quando a IA responder</h3>
        <ul class="lista-simples">
          <li>Confira números, datas, nomes e leis em fontes oficiais.</li>
          <li>Desconfie de links e pedidos estranhos que a IA trouxer de arquivos e e-mails.</li>
          <li>Revise o texto antes de enviar ou publicar.</li>
          <li>A decisão final é de uma pessoa, não da IA.</li>
        </ul>
      </div>
      ${errei}
      <p class="nota" style="margin-top:1.2rem">Na dúvida, não cole. Pergunte à TI ou ao encarregado de dados.</p>`;
  }

  desenharChecklist();
}

if (typeof document !== 'undefined') {
  iniciar();
}
