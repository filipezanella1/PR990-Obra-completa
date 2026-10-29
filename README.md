# Painel PR-990

App web para consultar as quantidades e os valores por trecho da **PR-990**, entre a PR-364 e Rebouças: km 0+000 a 12+883,96, estacas 0 a 642+15,817. O app compara o **consumo real** encontrado nos projetos com a **planilha contratual** (R$ 87.300.000,00, medição provisória de ago/2026).

O app é estático (HTML + JavaScript, sem servidor e sem dependências). A base completa vai junto em JSON, e as fórmulas do painel são recalculadas no navegador para qualquer trecho.

## O que o app faz

| Aba | Conteúdo |
|---|---|
| **Painel** | Seleção do trecho por estaca + metros, ou arrastando na faixa de estaqueamento. Premissas editáveis (teor de CAP, taxas de EAI e RR-1C). Indicadores e resumo por disciplina. Dados do trecho e indicadores geométricos. Detalhamento de cada serviço com as quantidades do projeto (LE / LD / total), o **consumo real** e o valor **ajustado ao contrato**. Exportação do trecho em CSV ou PDF. **Comparar dois trechos** lado a lado (indicadores, disciplinas e serviços com maior diferença, também por km).  Inclui o **reajuste por grupo de serviço** do contrato: PI (preço inicial), reajuste R (coeficiente do grupo, da 25ª medição, editável) e PI + R, sobre o valor ajustado ao contrato ou sobre o consumo real do trecho (`data/reajuste.json`, gerado por `tools/reajuste.py`). |
| **Medição** | Lê a planilha de medição do contrato (aba *Medição Resumo* e as memórias por estaca). Vem com a 25ª medição; **Carregar nova medição (.xlsx)** lê outra no próprio aparelho, sem servidor. Por serviço: contrato, medido acumulado, **medido nesta medição** (filtro “Medidos na 25ª”), saldo, previsão pelo projeto e situação (*Estourado*, *Vai estourar*, *Com saldo*, *Concluído*, *Sem medição*). No trecho do Painel: previsto, medido (pelos lançamentos com estaca) e a executar. Toque no serviço para ver os lançamentos. CSV e PDF. |
| **Retigráfico** | Segmentos travados ("não será executado", hoje 624 a 642+15,817) aparecem hachurados e ficam fora do que falta e da simulação; travar ou remover pede senha. No modelo do retigráfico da obra (RETIGRÁFICO OBRA 515, atualização de 28/10/2026): cartões de avanço por frente e, para cada frente (corte–aterro, regularização, 1ª e 2ª camadas de reforço, sub-base, base BGS, imprimação, CBUQ), a linha *atacado* (cor clara) e *concluído* (cor forte), uma célula por estaca; acima de cada faixa os 32 bueiros e galerias (OAC) com situação, tipo e comprimento, sem sobreposição. Edição por toque/arraste ou por intervalo, destaque do medido na medição atual, CSV, PDF, exportar/importar. |
| **Simulação** | Simulação de segmentos, página de apresentação: puxa o executado do retigráfico (verde) e deixa marcar, com uma cor por mês, com um pincel de um ou mais serviços ao mesmo tempo (marcar/apagar, sem repetir o já executado, “marcar todo o restante”), o que se quer executar de reforço (2 camadas), sub-base, base, imprimação e CBUQ — **mês a mês**: escolhe-se o mês (até 6, a partir do “1º mês”) e pinta-se; cada célula leva a cor e o número do mês. Resultado, por mês e total: material pétreo em t (bica corrida e BGS), t de CBUQ, CAP, RR-1C, EAI e xisto (8 L/t), com premissas editáveis, barras empilhadas por mês, CSV (com coluna Mês) e PDF. Inclui a **demanda de britagem** do que foi simulado (sem CBUQ): bica corrida e pó por serviço e por mês, rocha a desmontar, furação e uso da capacidade de bica. |
| **Apresentação** | Deck para a diretoria montado a partir da Simulação (7 slides, ← → / deslizar, tela cheia, PDF com um slide por página): capa com os números-chave, onde estamos (avanço por frente e OAC), planejado em diagrama linear (abre no último mês, com seletor mês a mês e reprodução animada), evolução do avanço por camada, recursos por mês com uso da britagem, produção financeira prevista (pavimentação calculada pela simulação, PI + R por mês a preço do contrato, mais os demais serviços — terraplenagem, drenagem, galerias etc. — lançados à mão por grupo e mês, com o R do grupo) e pontos de atenção automáticos (trechos sem mês, britagem acima da capacidade, sequência de camadas, bueiros pendentes sob trechos planejados, segmento fora do escopo). |
| **Britagem** | Planejamento da britagem até o fim da obra (Pedreira Faxinal dos Francos): demanda restante de Rebouças pelo retigráfico (o que não está concluído até a estaca 624, fora das travas) + drenos e concreto (saldo editável), convertida em produtos (bica corrida, brita 01, pedrisco, pó) pelas densidades e composições do estudo de britagem. Cronograma por prazos de cada serviço ou pelos meses pintados na Simulação. Programa mensal limitado pela capacidade de cada britador (t/h × horas) e pela furação, adiantando produção para estoque quando um mês passa da capacidade (estoque de furos, m/mês), com estoque/falta mês a mês, gráfico, CSV e PDF. Todos os parâmetros do estudo são ajustáveis. |
| **Campo** | GPS do celular → estaca mais próxima no eixo de projeto (SIRGAS 2000 / UTM 22S), afastamento e lado; ou digite a estaca. Mostra geometria, seção tipo, avanço na estaca e tudo o que existe no raio escolhido (drenagem com o detalhe tipo, sinalização, interferências, obras complementares, contenções, iluminação, OAE). |
| **Pranchas** | Pavimentação (PV), sinalização (SI), OAE (ES-2), obras complementares (OC), contenções (CO-2) e iluminação (IL) no mesmo formato da aba Drenagem: desenhos, quantidades do projeto e do trecho. |
| **Insumos** | Diesel, materiais, horas de equipamento e mão de obra no trecho pelas CPUs do contrato (abertas até os insumos): indicadores, principais insumos, consumo por serviço e lista de todos os insumos, com exportação em CSV. O Painel também mostra os principais insumos do trecho. |
| **Drenagem** | Catálogo de todos os dispositivos de drenagem do projeto (valetas, sarjetas, meios-fios, descidas, dissipadores, caixas, drenos, bueiros, galerias): detalhe tipo das pranchas DR-4 com visualizador de zoom, quantidades por tipo na obra e no trecho, itens do contrato e localização por estaca (notas de serviço DR-9). |
| **Contrato × projeto** | Os 269 itens do contrato com a quantidade contratual, o total impresso nos quadros da memória, o consumo real, a diferença em quantidade, em % e em R$, a situação de cada item e uma observação. Tem filtros, ordenação e exportação em CSV. |
| **Discrepâncias** | As principais divergências com o impacto em R$, os serviços do projeto sem item no contrato, as inconsistências internas das memórias e pranchas e verificações automáticas da base. |
| **Base de dados** | Todas as tabelas por estaca: terraplenagem, pavimentação, drenagem, sinalização, paisagismo, obras complementares, contenções, OAE, iluminação, interferências e geometria. Também a planilha contratual e os quadros da memória, com filtro e download em CSV ou JSON. |

**Busca global** (botão Buscar ou tecla `/`): código, serviço, insumo, prancha ou estaca, em todas as abas.

## Atualizar pelo próprio app

- **Retigráfico**: aba Retigráfico → “Atualizar pela planilha (.xlsx)” (com a senha). O app lê a planilha RETIGRAFICO OBRA 515 no navegador (mesma lógica de `tools/retigrafico.py`, em `src/retig.js`), mostra frente a frente o que muda e as mudanças de OAC, e aplica. Travas e correções de OAC continuam valendo.
- **Estudo de britagem**: aba Britagem → Parâmetros → “Atualizar pelo estudo de britagem (.xlsx)”. Mostra os parâmetros que mudam e pode descartar os ajustes manuais.
- **Medição**: aba Medição → “Carregar nova medição (.xlsx)”, como antes.
- Depois, “Publicar como versão mestra”: retigráfico e estudo vão para `data/mestre.json`; a medição carregada e os valores da curva S vão no mesmo arquivo, **criptografados com a senha** (só quem tem a senha abre).

## Curva S financeira (área restrita)

Aba Medição (e slide na Apresentação, com a senha): medido acumulado a preço inicial por medição até a última medição, reajuste acumulado, previsão mês a mês (meses ainda sem medição informados à mão + pavimentação da Simulação + demais serviços lançados na Apresentação) e a linha do valor do contrato. As medições anteriores à última são aproximadas pela distribuição das memórias de cálculo, ajustadas ao acumulado oficial, e podem ser substituídas pelos valores oficiais em “Editar valores por medição”.

## Planejamento do contrato (aba oculta: não aparece no menu; com a senha, abre pelo botão Mestra → “Abrir o Planejamento” ou pelo endereço #planejamento)

Simula o contrato inteiro, mês a mês, de 01/08/2024 a 01/08/2026 (datas editáveis), sem considerar o que já foi produzido nem a Simulação/retigráfico — ou, como opção, só o saldo da medição a partir da data de status: quantidade de cada item ÷ produção da equipe na CPU do contrato (nas CPUs sem produção definida, operários por equipe ÷ horas de mão de obra por unidade) = horas de equipe. Os itens formam pacotes (terraplenagem, OAC, drenos, regularização, reforço/sub-base, BGS, imprimação, CBUQ, drenagem superficial, sinalização…) ligados pela sequência executiva (camadas em sequência com liberação, cura da imprimação antes do CBUQ, sinalização definitiva após o CBUQ, acabamentos depois do revestimento), num calendário com domingos, feriados nacionais, sábado parcial e dias perdidos por chuva (e por frio no asfalto) mês a mês. Mostra cronograma (Gantt), cronograma físico-financeiro mês a mês por pacote com caminho crítico, término previsto × prazo contratual (datas de início e fim editáveis), o reforço de equipes necessário para cumprir o prazo e a produção financeira por mês (PI + R). Equipes, operários, esperas e clima são editáveis; CSV com o detalhamento por item.

## Uso sem internet

Depois de aberto uma vez com internet, o app inteiro (telas, tabelas, painel, simulação, retigráfico, britagem, apresentação, área restrita com a senha) fica salvo no aparelho pelo service worker e abre sem internet; aparece o aviso “Sem internet – usando a cópia salva”. As miniaturas das pranchas (≈3 MB) já são salvas; as pranchas completas (≈26 MB) são baixadas pelo botão em Sobre → Uso sem internet e ficam guardadas entre versões (`pr990-midia`). A lista de imagens (`data/midia.json`) é gerada pelo `tools/bundle.py`.

## Ordem das abas

Botão ☰ no fim da barra de abas (no celular: “Mais” → “Organizar abas…”): arraste pela alça ou use as setas. A ordem fica salva no aparelho; no celular as 4 primeiras vão para a barra inferior e o resto para “Mais”.

## Versão mestra × versão individual

- **Versão mestra** (`data/mestre.json`): retigráfico, simulação, britagem, coeficientes de reajuste e lançamentos financeiros da apresentação, publicados pelo dono. Todos os aparelhos leem a mestra.
- **Versão individual**: qualquer pessoa pode alterar simulação, britagem, reajuste e lançamentos; fica só no aparelho dela, por área. O que ela não alterou continua acompanhando a mestra. Quando a mestra muda numa área que ela alterou, aparece o aviso “Usar a versão mestra / Manter a minha”. O botão de versão no topo mostra o estado de cada área e deixa voltar à mestra.
- **Publicar** (só com a senha): botão de versão → “Publicar como versão mestra”. Grava `data/mestre.json` no repositório pela API do GitHub com um token fine-grained (só este repositório, *Contents: Read and write*), guardado no aparelho criptografado com a senha. O GitHub Pages republica e os aparelhos recebem em 1 a 2 minutos.
- O retigráfico só é editável com a senha; quem não tem a senha vê sempre o da mestra.

## Área restrita

**Medição**, **Contrato × projeto**, **Discrepâncias**, **Base de dados** e a **edição do Retigráfico** pedem senha (botão *Entrar* no topo). Os dados dessas abas (medição, memórias por estaca, planilha contratual com quantidades e valores, discrepâncias) não ficam no site em texto: vão cifrados em `data/protegido.json` (AES-256-GCM, chave derivada da senha por PBKDF2-SHA256 com 1.000.000 de iterações) e só são abertos no navegador com a senha. “Manter liberado neste aparelho” guarda a chave no próprio aparelho; *Sair* apaga.

Os originais ficam em `privado/` (fora do Git). Para trocar a senha ou atualizar esses dados, rode `tools/proteger.mjs` com a nova senha e publique. As tabelas por estaca (`data/base.json`) continuam abertas porque o Painel, a Drenagem, as Pranchas, o Campo e a Simulação calculam a partir delas; o bloqueio da aba Base de dados esconde a tela de consulta e o download completo.

## No celular

O app se adapta à tela do celular (abas na barra inferior, tabelas em cartões, campos e botões do tamanho do dedo) e pode ser **instalado** como aplicativo:

- **Android (Chrome, Edge, Samsung Internet):** abra o endereço do GitHub Pages e toque em **Instalar app** no topo, ou no menu ⋮ → *Instalar app* / *Adicionar à tela inicial*.
- **iPhone / iPad (Safari):** toque em **Compartilhar** → **Adicionar à Tela de Início**. O botão *Instalar app* mostra esse passo a passo.
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

Depois de aberto uma vez, o app e a base ficam guardados no aparelho e **funcionam sem internet** (service worker `sw.js`). A cada publicação o workflow troca a versão do cache; quando houver versão nova, o app mostra **Atualizar**.

A instalação exige HTTPS, que o GitHub Pages já fornece. A versão de arquivo único (`dist/painel-pr990.html`) também é responsiva, mas não é instalável.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (pode ser privado, se o plano permitir Pages privado) e envie esta pasta:
   ```bash
   git init
   git add .
   git commit -m "Painel PR-990"
   git branch -M main
   git remote add origin https://github.com/<usuario>/painel-pr990.git
   git push -u origin main
   ```
2. No repositório, abra **Settings → Pages** e, em **Build and deployment → Source**, escolha **GitHub Actions**.
3. O workflow `.github/workflows/pages.yml` roda a cada push na `main`:
   - confere o motor de fórmulas contra os valores da planilha (`npm test`);
   - publica o site.

   O endereço aparece na aba **Actions** e em **Settings → Pages** (`https://<usuario>.github.io/painel-pr990/`).

Também há uma versão de **arquivo único**, `dist/painel-pr990.html`, com a base embutida. Ela abre com duplo clique, sem internet e sem servidor, e serve para mandar por e-mail ou guardar junto com a medição.

## Rodar localmente

```bash
python3 -m http.server 8000      # ou: npm start
# abra http://localhost:8000
```

O `index.html` precisa ser servido por HTTP porque carrega os JSON com `fetch`. Para abrir direto do disco, use `dist/painel-pr990.html`.

## Como o cálculo funciona

- `data/base.json` traz os valores de todas as abas de origem da planilha `quantidades_por_estaca_PR-990.xlsx`: tabelas por estaca, notas de serviço, memórias e quadros.
- `data/painel.json` traz as fórmulas da aba **Painel**, as mesmas da planilha.
- `src/engine.js` é um motor próprio que avalia o subconjunto do Excel usado no painel: `SUMPRODUCT`, `SUMIFS`, `COUNTIFS`, `INDEX`, `MATCH`, `IF`, `MIN`, `MAX`, aritmética de matrizes e referências entre abas.
  - Ao mudar o trecho, recalcula só as células que dependem das entradas, em cerca de 0,2 s.
- `data/model.json` traz a estrutura do painel (disciplinas, serviços e de onde vem cada quantidade) e a base do contrato: itens, quadros da memória, observações e discrepâncias.
- `tests/compare.mjs` compara as 2.388 fórmulas do painel com os valores calculados pelo Excel/LibreOffice.
  - Na geração, isso foi conferido célula a célula nos trechos 0–642+15,817, 100–108, 300+7,5–455+12,25, 0–0+10, 640+3–642+15,817 e 326–326+0,5, sem nenhuma divergência.

### Critérios

- **Consumo real:** quantidade encontrada nos projetos × preço unitário do contrato. Quando o serviço não tem quantidade no projeto, vale a quantidade do contrato, repartida pelo serviço que o comanda ou pela extensão.
- **Ajustado ao contrato:** quantidade da planilha contratual repartida no trecho pelo mesmo critério. No trecho inteiro soma R$ 87.300.000,04.
- **Intervalos e pontos:**
  - quantidades distribuídas entre duas estacas entram na proporção do intervalo que cai no trecho;
  - itens pontuais contam a partir da estaca inicial e até antes da estaca final; na última estaca da obra, contam também os pontos que caem nela.
- **Mobilização:** entra quando a seleção chega à estaca final.
- **Melhorias ambientais:** medição mensal, só entram com o trecho completo.

## Atualizar a base

A base sai da planilha `privado/quantidades_por_estaca_PR-990.xlsx`. Depois de regenerar e recalcular a planilha:

```bash
python3 tools/app_export.py privado/quantidades_por_estaca_PR-990.xlsx data   # base.json, painel.json, ref_painel.json
python3 tools/bundle.py                                                   # dist/painel-pr990.html
npm test                                                                  # confere o motor com a planilha
node tools/medicao.mjs <medição.xlsx> privado/medicao.json                # troca a medição que vem no app
python3 tools/relatorio.py <Relatório SMO.pdf> privado/medicao.json       # aplica as quantidades oficiais do relatório
PR990_SENHA='…' node tools/proteger.mjs                                   # cifra os dados restritos em data/protegido.json
python3 tools/retigrafico.py <RETIGRAFICO OBRA 515 ....xlsx> data/avanco.json  # atualiza o retigráfico
python3 tools/britagem.py "<Planejamento Britagem ... - dd.mm.aa.xlsx>" data/britagem.json  # atualiza as premissas da britagem
```

A medição que vem no app é a 25ª (agosto/2026): as quantidades da medição e acumuladas são as do *Relatório de Quantidades Executadas* do SMO (emitido em 11/09/2026: R$ 1.778.380,63 na medição + R$ 99.068,92 de reajuste = R$ 1.877.449,55; acumulado R$ 51.639.694,91), e as memórias por estaca vêm da planilha da medição. Os lançamentos de cada memória levam o número da medição (coluna de observações), o que permite destacar o que foi medido na medição atual na aba Medição, no retigráfico e no Campo.

`tools/app_model.py` gera o `model.json` (estrutura do painel e base do contrato). Ele roda dentro do gerador da planilha, no fim do processo, porque usa a estrutura dos itens montada ali.

## Estrutura

```
index.html            app
manifest.webmanifest  dados do app instalável (nome, ícones, cores)
sw.js                 service worker: funcionamento offline e atualização
icons/                ícones do app (192, 512, maskable, iPhone)
drenagem/             pranchas DR-4 em WebP (inteiras e miniaturas) usadas na aba Drenagem
pranchas/             pranchas PV, SI, ES-2, OC, CO-2 e IL em WebP (aba Pranchas)
src/engine.js         motor de fórmulas (navegador e Node)
src/app.js            interface
src/obra.js           medição, avanço, campo (GPS), planejamento, pranchas, busca e comparação
src/medparse.js       leitura da planilha de medição; src/xlsx.js: leitor de .xlsx sem dependências
src/style.css         estilos
data/                 base em JSON (insumos.json: CPUs; medicao.json: 25ª medição; avanco.json: retigráfico de 28/10/2026;
                      eixo.json: eixo de projeto a cada 5 m; pranchas.json; medref.json) + planilha .xlsx de origem
dist/                 versão de arquivo único (gerada)
tests/                conferência do motor e desempenho
tools/                exportação da planilha e empacotamento
.github/workflows/    publicação no GitHub Pages
```
