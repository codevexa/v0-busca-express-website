# OSSALA | Testes

## Como executar

```bash
pnpm test        # 60 testes: unitários + banco
pnpm typecheck
pnpm build
```

- `tests/db/*` sobe um PostgreSQL 17 local (PGlite) com stubs do Supabase (roles `anon`/`authenticated`,
  `auth.uid()`, Storage) e um retrato do estado legado do banco. Depois aplica **todas** as migrations e executa os
  cenários como usuários reais, com RLS ativa.
- `tests/unit/*` cobre cálculos monetários, períodos e quinzenas, comparação do OCR, agregação dos relatórios e geração do PDF.

## Resultado da última execução (12/10/2026)

| Suíte | Resultado |
| --- | --- |
| `tests/db/smoke.test.ts` | 1/1 ✅ |
| `tests/db/business.test.ts` | 37/37 ✅ |
| `tests/db/manual-sql.test.ts` (arquivo do SQL Editor sobre o estado da produção, executado duas vezes) | 2/2 ✅ |
| `tests/unit/*` | 20/20 ✅ |
| `tsc --noEmit` | sem erros |
| `next build` | ✅ (todas as rotas) |
| Servidor de produção local | redirecionamentos, login, manifest, ícones, service worker, 401 em APIs sem sessão ✅ |
| Tela de login (Chromium, 390 px e 1280 px) | digitar a matrícula mantém o foco no campo ✅ |
| Produção (Supabase, transação desfeita) | admin: contexto, 44 permissões, painel e alertas ✅ · motoboy: só o próprio perfil e as próprias entregas ✅ |

## Checklist dos 24 cenários obrigatórios

Legenda: **A** = automatizado (teste no repositório) · **M** = verificado manualmente neste ambiente · **P** = pendente de validação no ambiente real (ver limitações).

| # | Cenário | Como foi validado | Situação |
| --- | --- | --- | --- |
| 1 | Admin cadastra usuários e configura permissões | A: revogação individual e restrição por papel valem no banco · criação via Auth Admin API (código) | ✅ banco · P criação real (exige service role) |
| 2 | Login por matrícula e senha | A: `resolve_login_email` (case-insensitive, inativo bloqueado) · M: tela e validações | ✅ · P login real |
| 3 | Entrega cadastrada persiste | A | ✅ |
| 4 | Entrega aparece no histórico | A: histórico de status · tela Histórico usa a mesma consulta da lista | ✅ |
| 5 | Endereço no mapa quando a geocodificação funciona | Código + rota com cache/limite · M: rota exige sessão | P (rede do ambiente bloqueia o Nominatim) |
| 6 | Atribuição a motoboy | A: atribuição, permissão `entregas.atribuir` e notificação ao motoboy | ✅ |
| 7 | Motoboy vê apenas as próprias entregas | A (RLS) | ✅ |
| 8 | Confirmação de entrega registra histórico | A: "Pedido entregue" idempotente, autor e histórico; correção só por gestor com motivo | ✅ |
| 9 | Cobrança, repasse e extras corretos | A: banco (visão financeira, extra automático uma única vez, cancelamento automático, descontos) + unitário (centavos) | ✅ |
| 10 | Conferência recebe a imagem e processa o OCR | Código do endpoint (upload privado, registro, OCR, comparação) · A: comparação | P (exige `ANTHROPIC_API_KEY` e Supabase acessível) |
| 11 | OCR apresenta resultados e exige aprovação manual | A: aprovação só com `conferencia.aprovar`; aprovar com divergência exige justificativa; conferência revisada é imutável | ✅ |
| 12 | Falhas de OCR tratadas | A: falha gera notificação real · código: status `falha_ocr`, mensagem, nova tentativa, conferência manual | ✅ |
| 13 | Relatórios com os mesmos totais dos registros | A: soma dos grupos = total geral; fechamento = soma da visão | ✅ |
| 14 | PDFs legíveis e em A4 | A: 210×297 mm, várias páginas, cabeçalho repetido | ✅ |
| 15 | Fechamento quinzenal consolida corretamente | A | ✅ banco · P produção (migration 0007 pendente) |
| 16 | Fechamento encerrado bloqueia alterações comuns | A: bloqueio de inserir/alterar; correção autorizada com justificativa auditada; reabertura com permissão | ✅ banco · P produção |
| 17 | Notificações por eventos reais | A: atribuição, divergência, falha de OCR, pagamento, fechamento · pg_cron para pendências | ✅ |
| 18 | Sem permissão não executa operações restritas | A: RLS + funções recusam (`42501`) · M: APIs respondem 401/403 | ✅ |
| 19 | Empresa não acessa dados de outra | A: leitura, alteração e `company_id` forjado | ✅ banco · P produção (migration 0850 pendente para tabelas legadas) |
| 20 | Funciona em celular e computador | M: login em 390 px e 1280 px · layout com navegação inferior/menu lateral | ✅ parcial |
| 21 | Dados persistem após recarregar | Todos os dados vêm do banco (sem estado local) | ✅ por construção |
| 22 | Falha de rede não perde dados silenciosamente | Ações recusam o envio sem conexão, com aviso; formulários mantêm o conteúdo; aviso global offline | ✅ por construção |
| 23 | Operações financeiras sem duplicidade | A: pagamento idempotente; entrega em dois pagamentos recusada; transições inválidas recusadas | ✅ |
| 24 | Botões e formulários executam funções reais | Revisão: toda ação chama ação de servidor/RPC e exibe o resultado real | ✅ por revisão · P navegação completa |

## Limitações deste ambiente

- **Sem acesso de rede ao Supabase, ao Nominatim e aos tiles do OpenStreetMap** a partir do contêiner de
  desenvolvimento. Por isso o fluxo ponta a ponta com login real, mapa e upload de foto não foi exercitado aqui. As
  mesmas regras foram validadas no Postgres local com as migrations reais.
- **OCR real** não foi chamado por falta de `ANTHROPIC_API_KEY` neste ambiente.
- **Migrations 0007 e 0850** dependem de aprovação manual no SQL Editor (ver README).

## Roteiro de aceite no ambiente real (após configurar as variáveis)

1. Entrar como administrador → Áreas: definir valores; Bairros: associar.
2. Usuários → criar um Gestor e um Motoboy (anotar a senha provisória) → entrar como Motoboy e trocar a senha.
3. Entregas → nova entrega com busca de endereço → conferir área, valores e marcador no mapa.
4. Entrar como Motoboy → Minhas entregas → Iniciar → Pedido entregue → conferir o histórico.
5. Fotos → Fotografar comanda → conferir a comparação → Conferência → aprovar.
6. Pagamentos → A pagar → gerar → aprovar → registrar pagamento.
7. Fechamentos → gerar a quinzena → aprovar → encerrar → tentar editar uma entrega do período (deve bloquear) → exportar PDF.
8. Relatórios → gerar cada um dos 10 tipos e conferir os totais com a tela Entregas filtrada.
