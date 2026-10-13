# OSSALA | Vídeo demonstrativo

Projeto que gera o vídeo de apresentação do **OSSALA | Controle de Entregas**: MP4 de 1920 × 1080, 30 FPS e cerca de 60 s.
O vídeo é produzido com [Remotion](https://www.remotion.dev) (vídeo programático em React) a partir dos **componentes,
estilos e regras reais do aplicativo**. Nenhum arquivo do app foi alterado para isso; a única mudança fora desta pasta
foi excluir `video/` do `tsconfig.json` da raiz.

## Como gerar o vídeo

Requisitos: Node.js 20+ e pnpm, e as dependências do app instaladas na raiz.

```bash
# 1. Dependências do app (os componentes reais são importados de ../components e ../lib)
pnpm install

# 2. Dependências do projeto de vídeo
cd video
npm install

# 3. Renderizar: gera out/ossala-demo.mp4 (H.264, 1920x1080, 30 FPS)
npm run render
```

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run studio` | Abre o Remotion Studio no navegador para ver e ajustar o vídeo quadro a quadro |
| `npm run still -- 450` | Exporta só o quadro 450 em `out/frame-450.png` |
| `npm run render -- --frames=0-299` | Renderiza só um trecho (as opções extras vão para o Remotion) |
| `npm run typecheck` | Verificação de tipos do projeto de vídeo |

O Remotion baixa o próprio Chromium na primeira execução. Para usar um navegador já instalado, defina
`REMOTION_BROWSER_EXECUTABLE=/caminho/do/chrome`. `REMOTION_CONCURRENCY=4` controla quantos quadros são renderizados
em paralelo. O script de renderização inicia o navegador em pt-BR, para que datas e valores saiam no padrão brasileiro.

**Trilha sonora (opcional):** coloque um arquivo `public/trilha.mp3` com licença de uso e renderize de novo. Ele entra
automaticamente, com fade-in. Sem o arquivo, o vídeo sai sem áudio.

## Roteiro (≈ 60 s)

| # | Cena | Duração | O que mostra |
| --- | --- | --- | --- |
| 1 | Abertura | 5 s | Monograma e marca OSSALA animados e a frase "Gestão inteligente. Entregas sob controle." |
| 2 | Visão geral | 8 s | A janela do sistema entra em perspectiva; painel **Hoje** com indicadores contando, alertas, entregas por motoboy e por área |
| 3 | Gestão de entregas | 12,7 s | **Nova entrega**: comanda, busca de endereço, preenchimento automático, área e valores pelo bairro, escolha do motoboy, salvar, nova linha na lista e status Pendente → Em andamento → Concluída |
| 4 | Mapa interativo | 9,5 s | Loja e marcadores por status, contorno na cor da área, popup da comanda e **filtro por área** |
| 5 | Conferência de comandas | 11,7 s | Foto da comanda, leitura por OCR, tabela **Dados cadastrados × Dados identificados**, correção do campo de baixa confiança, aprovação manual |
| 6 | Gestão e permissões | 10 s | Tela **Usuários**, ajuste individual de permissão (Padrão da função → Conceder) e o menu de cada função (Administrador, Administrativo, Motoboy) |
| 7 | Encerramento | 6,7 s | Telas reunidas em composição 3D, logotipo e frase final |

As durações ficam em `src/timeline.ts`; as transições são fades de 18 quadros.

## Fidelidade ao sistema

Importados diretamente do app, sem cópia:

- `app/globals.css`: identidade visual (bordô `#800020`, dourado `#d4af37`, tokens `.ossala`, marcadores do mapa)
- `components/ui/*`: Button, Badge, Table, Label, Checkbox, Tabs
- `components/ossala/*`: Logo, PageHeader, StatCard, FiltersBar, badges de status, SessionProvider
- `components/conference/comparison-table.tsx`: tabela de comparação do OCR
- `lib/navigation.ts` + `lib/permissions.ts`: os menus de cada função são calculados com `NAV_ITEMS` e `can()`, igual ao `AppShell`
- `lib/ocr/compare.ts`: o resultado da conferência ("Corresponde", "Baixa confiança", "Ausente no cadastro"…) é calculado pela função real `compareDelivery`, inclusive durante a correção
- `lib/domain.ts`, `lib/money.ts`, `lib/dates.ts`: rótulos, status, formatação em R$ e datas

Reproduzidos com as **mesmas classes** do app, porque dependem do Supabase ou de portais/eventos do navegador:
o `AppShell` (versão computador), os diálogos (Nova entrega, Conferência, Permissões, confirmação), o toast do Sonner,
os campos em foco e as listas abertas dos `<select>`. Textos, rótulos e mensagens ("Entrega cadastrada.",
"Conferência aprovada.", "Permissões atualizadas.", "1 entrega(s) sem motoboy atribuído"…) são os do código-fonte.

Diferenças conscientes:

- **Mapa:** o app usa os tiles do OpenStreetMap via Leaflet. No vídeo, a base é uma ilustração vetorial no mesmo estilo
  (`src/ui/MapCanvas.tsx`), para não depender de rede. Marcadores, popup, cores por status e contorno por área usam o
  mesmo HTML/CSS do `leaflet-map.tsx`.
- **Foto da comanda:** é uma comanda fictícia desenhada em HTML (`src/ui/Receipt.tsx`), não uma imagem de banco.
- **Diálogo de permissões:** mostra só os módulos Pagamentos e Conferência, como se a lista estivesse rolada até eles.
- As permissões padrão por função vêm da migration `supabase/migrations/20261012000850_replace_legacy_rules.sql`.

## Dados e privacidade

Todos os nomes, endereços, comandas e valores são **fictícios** (`src/data/demo.ts`), e o vídeo exibe o aviso
"Dados fictícios · demonstração". O projeto não acessa o Supabase nem a API de OCR e não usa variáveis de ambiente,
senhas ou chaves. As datas exibidas são as do dia da renderização, como no filtro "Hoje" do app.

## Estrutura

```
video/
├── remotion.config.ts      # aliases (@ → raiz do app), Tailwind v4, codec H.264/CRF 16
├── scripts/render.mjs      # renderização final em pt-BR
├── scripts/still.mjs       # exporta um quadro para conferência
└── src/
    ├── Root.tsx / Video.tsx / timeline.ts
    ├── data/demo.ts        # dados fictícios (tipos do app)
    ├── lib/anim.ts         # easing, digitação, contagem, cursor
    ├── scenes/             # Intro, Overview, Deliveries, MapScene, Conference, Permissions, Outro
    └── ui/                 # AppShell, câmera 3D, cursor, diálogos, mapa, comanda, legendas
```

Para posicionar o cursor depois de mudar um layout, rode um quadro com `--props='{"measure":true}' --log=verbose`.
A `AnchorProbe` imprime no console a posição dos elementos marcados com `data-anchor`.

## Licença do Remotion

O Remotion é gratuito para pessoas físicas e empresas com até 3 funcionários. Empresas maiores precisam de uma
[licença de empresa](https://www.remotion.dev/license).
