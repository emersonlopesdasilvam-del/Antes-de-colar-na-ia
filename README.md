# Antes de colar na IA#

Site que ajuda funcionários do setor administrativo a usar ferramentas de IA generativa sem expor dados pessoais e confidenciais. É o recurso complementar do manual **“IA no trabalho com segurança”**, projeto da disciplina Fontes de Informação II (Gestão da Informação, UFPE, 2026).

## O que o site faz

**1. Esconder dados do texto**
A pessoa cola o texto que quer levar para a IA e clica em *Proteger texto*. O site troca os dados encontrados por marcadores (`[NOME_1]`, `[CPF_1]`, `[TELEFONE_1]`…) e mostra a versão protegida para copiar.

| Detectado automaticamente | Como |
|---|---|
| CPF e CNPJ | Formato com pontuação; sem pontuação, só se os dígitos verificadores forem válidos |
| RG e matrícula | Número que vem depois das palavras “RG” ou “matrícula” |
| E-mail, telefone, CEP | Formato |
| Valores em R$ | Formato |
| Datas | Formato (opção desligada por padrão) |
| Senhas | Valor depois de “senha:”, “token:”, “password:”; sempre removido |
| Nomes | **Não são detectados sozinhos**: o usuário digita ou seleciona no texto |

O site também avisa quando o texto parece falar de saúde, contrato, salário ou outros dados pessoais sensíveis, que não podem ser escondidos só pelo formato.

**2. O que meu documento tem?**
Checklist em que a pessoa marca os tipos de dado do documento. O site mostra a cor do Semáforo dos dados (verde, amarelo, vermelho) e as boas práticas para cada item, com a fonte (LGPD, casos do manual, guias). O botão *Ver boas práticas para este texto*, na primeira aba, já abre o checklist marcado com o que foi encontrado.

## Privacidade

Todo o processamento acontece no navegador, em JavaScript. O site não tem servidor, não envia o texto para nenhum lugar e não guarda nada (sem cookies, sem armazenamento local). Fechou a aba, o texto some.

O único acesso externo é o carregamento da fonte (Google Fonts), que não leva nenhum texto do usuário. Sem internet, o site funciona com a fonte do sistema.

## Limitações

O site reconhece **padrões**, não o sentido do texto. Ele não substitui a revisão humana:
- nomes que não foram adicionados à lista continuam no texto;
- diagnósticos, cláusulas sigilosas e outras informações escritas por extenso não são escondidos;
- uma descrição pode identificar alguém mesmo sem nome (“a única gerente da filial de Caruaru”).

Trocar dados por marcadores é uma forma de **pseudonimização**, não de anonimização.

## Estrutura

```
index.html                   página
style.css                    visual (claro e escuro)
script.js                    detecção, checklist e interface
manual-ia-no-trabalho.pdf    manual do projeto (link no rodapé)
```

## Como rodar

Abra o `index.html` no navegador. No VS Code, a extensão **Live Server** permite ver as mudanças ao salvar.

Para testar a detecção no terminal (Node.js):

```bash
node -e "const s=require('./script.js'); console.log(s.protegerTexto('CPF 529.982.247-25, tel (81) 99876-5432').texto)"
```

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie os arquivos:
   ```bash
   git init
   git add .
   git commit -m "Versão 1.0 do site Antes de colar na IA"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/antes-de-colar-na-ia.git
   git push -u origin main
   ```
2. No repositório, vá em **Settings → Pages**.
3. Em *Source*, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e salve.
4. Em alguns minutos o site fica disponível em `https://SEU-USUARIO.github.io/antes-de-colar-na-ia/`. Esse é o link para o QR Code do cartaz.

## Como atualizar o conteúdo

As boas práticas ficam na lista `ITENS`, no `script.js` (título, descrição, prática, fonte e nível de 0 a 3). Os padrões de detecção ficam na lista `REGRAS`. Ao mudar algo, atualize o número da versão no rodapé do `index.html`.

## Autores

Emerson Lopes, Kamila da Silva, Miguel Máximo e Samuel Barbosa. Docente: Marcela Lino da Silva.

## Fontes

Lei nº 13.709/2018 (LGPD); CGU, Guia de uso responsável de IA generativa (2025); SGD/MGI e Serpro, IA Generativa no Serviço Público (2025); Senado Federal, Guia de uso de IA; CERT.br, Cartilha de Segurança para Internet, fascículo Inteligência Artificial; ANPD, Guia de Segurança da Informação para Agentes de Tratamento de Pequeno Porte (2021); NIST AI 600-1 (2024).
