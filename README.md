# Painel PR-990

App web para consultar as quantidades e os valores por trecho da **PR-990**, entre a PR-364 e Rebouças: km 0+000 a 12+883,96, estacas 0 a 642+15,817. O app compara o **consumo real** encontrado nos projetos com a **planilha contratual** (R$ 87.300.000,00, medição provisória de ago/2026).

O app é estático (HTML + JavaScript, sem servidor e sem dependências). A base completa vai junto em JSON, e as fórmulas do painel são recalculadas no navegador para qualquer trecho.

## O que o app faz

| Aba | Conteúdo |
|---|---|
| **Painel** | Seleção do trecho por estaca + metros, ou arrastando na faixa de estaqueamento. Premissas editáveis (teor de CAP, taxas de EAI e RR-1C). Indicadores e resumo por disciplina. Dados do trecho e indicadores geométricos. Detalhamento de cada serviço com as quantidades do projeto (LE / LD / total), o **consumo real** e o valor **ajustado ao contrato**. Exportação do trecho em CSV. |
| **Insumos** | Diesel, materiais, horas de equipamento e mão de obra no trecho pelas CPUs do contrato (abertas até os insumos): indicadores, principais insumos, consumo por serviço e lista de todos os insumos, com exportação em CSV. O Painel também mostra os principais insumos do trecho. |
| **Drenagem** | Catálogo de todos os dispositivos de drenagem do projeto (valetas, sarjetas, meios-fios, descidas, dissipadores, caixas, drenos, bueiros, galerias): detalhe tipo das pranchas DR-4 com visualizador de zoom, quantidades por tipo na obra e no trecho, itens do contrato e localização por estaca (notas de serviço DR-9). |
| **Contrato × projeto** | Os 269 itens do contrato com a quantidade contratual, o total impresso nos quadros da memória, o consumo real, a diferença em quantidade, em % e em R$, a situação de cada item e uma observação. Tem filtros, ordenação e exportação em CSV. |
| **Discrepâncias** | As principais divergências com o impacto em R$, os serviços do projeto sem item no contrato, as inconsistências internas das memórias e pranchas e verificações automáticas da base. |
| **Base de dados** | Todas as tabelas por estaca: terraplenagem, pavimentação, drenagem, sinalização, paisagismo, obras complementares, contenções, OAE, iluminação, interferências e geometria. Também a planilha contratual e os quadros da memória, com filtro e download em CSV ou JSON. |

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

A base sai da planilha `data/quantidades_por_estaca_PR-990.xlsx`. Depois de regenerar e recalcular a planilha:

```bash
python3 tools/app_export.py data/quantidades_por_estaca_PR-990.xlsx data   # base.json, painel.json, ref_painel.json
python3 tools/bundle.py                                                   # dist/painel-pr990.html
npm test                                                                  # confere o motor com a planilha
```

`tools/app_model.py` gera o `model.json` (estrutura do painel e base do contrato). Ele roda dentro do gerador da planilha, no fim do processo, porque usa a estrutura dos itens montada ali.

## Estrutura

```
index.html            app
manifest.webmanifest  dados do app instalável (nome, ícones, cores)
sw.js                 service worker: funcionamento offline e atualização
icons/                ícones do app (192, 512, maskable, iPhone)
drenagem/             pranchas DR-4 em WebP (inteiras e miniaturas) usadas na aba Drenagem
src/engine.js         motor de fórmulas (navegador e Node)
src/app.js            interface
src/style.css         estilos
data/                 base em JSON (inclusive insumos.json, consumos das CPUs) + planilha .xlsx de origem
dist/                 versão de arquivo único (gerada)
tests/                conferência do motor e desempenho
tools/                exportação da planilha e empacotamento
.github/workflows/    publicação no GitHub Pages
```
