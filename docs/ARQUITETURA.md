# OSSALA | Arquitetura

## 1. Arquitetura proposta

```
Navegador / PWA (React 19)
 ├─ Telas (app/app/(painel)/*)       ← leitura direta via Supabase JS (RLS) + Realtime
 ├─ Ações de servidor (lib/actions)  ← validação zod + permissão + sessão do usuário
 └─ Rotas de API (app/api/*)         ← login, OCR, geocodificação, cron
          │
          ▼
Next.js 16 no servidor (Vercel)
 ├─ proxy.ts          renova a sessão e protege /app
 ├─ lib/auth.ts       contexto do usuário (my_context) e checagem de permissão
 ├─ service_role      SOMENTE para criar usuários, redefinir senhas, revogar sessões e cron
 ├─ OCR               Claude (visão) → saída estruturada → comparação
 └─ Nominatim         fila de 1 req/s + cache de 5 minutos
          │
          ▼
Supabase
 ├─ PostgreSQL 17     tabelas, gatilhos de regra de negócio, visão financeira, funções RPC
 ├─ RLS               isolamento por empresa + permissões granulares (app.has_perm)
 ├─ Auth              e-mail interno derivado da matrícula; senha com hash no Auth
 ├─ Storage           delivery-photos (privado) · branding (público, só logotipo)
 ├─ Realtime          entregas, conferências e notificações
 └─ pg_cron           alerta de entregas pendentes a cada 10 minutos
```

Princípios:

- **O banco é a fonte da verdade das regras.** Cálculo de valores, transições de status, bloqueio de períodos
  encerrados, prevenção de duplicidade e auditoria ficam em gatilhos e funções SQL. Nenhum cliente consegue
  contorná-los, nem chamando a API diretamente.
- **Uma fórmula só.** A visão `delivery_financials` calcula `charge_total`, `repass_gross` e `repass_net`. Telas,
  relatórios, pagamentos e fechamentos usam essa visão. No TypeScript, `lib/money.ts` replica a fórmula em
  centavos inteiros, e os testes conferem que as duas batem.
- **Valores históricos preservados.** A entrega grava cobrança e repasse vigentes da área no momento do cadastro;
  alterar a área não muda entregas antigas (`delivery_fee_history` guarda a vigência).
- **Interface nunca é a única barreira.** Botões não autorizados ficam ocultos, mas o servidor e o RLS repetem a checagem.

## 2. Estrutura de pastas

| Pasta | Conteúdo |
| --- | --- |
| `app/app/login` | Login por matrícula (sem troca de foco ao digitar), recuperação de acesso |
| `app/app/(painel)` | Telas autenticadas: `page.tsx` (Hoje), `entregas`, `minhas-entregas`, `historico`, `calendario`, `mapa`, `fotos`, `conferencia`, `relatorios`, `pagamentos`, `fechamentos`, `alertas`, `motoboys`, `areas`, `usuarios`, `auditoria`, `configuracoes`, `perfil`, `ajuda` |
| `app/api` | `auth/login`, `auth/logout`, `auth/recover`, `conferencia/ocr`, `geocode`, `cron/retencao` |
| `components/ui` | Componentes base (padrão shadcn/ui sobre Radix) |
| `components/ossala` | Shell (menu lateral, navegação inferior), sessão, filtros, estados vazios, confirmações |
| `components/deliveries`, `map`, `conference` | Formulário/detalhe de entrega, mapa Leaflet, tabela de comparação |
| `lib/actions` | Ações de servidor por módulo |
| `lib/validation` | Esquemas zod compartilhados entre cliente e servidor |
| `lib/ocr`, `lib/geo`, `lib/reports` | Integrações isoladas da interface |
| `lib/queries` | Consultas reutilizáveis (filtros, paginação) |
| `supabase/migrations` | Banco versionado |
| `tests/unit`, `tests/db` | Testes |

## 3. Modelo de dados

Tabelas reaproveitadas da versão anterior (estendidas sem perda de dados): `companies`, `company_settings`,
`company_memberships`, `profiles`, `delivery_areas`, `neighborhoods`, `delivery_fee_history`, `notifications`,
`role_permissions`, `user_permissions`.

| Entidade | Função |
| --- | --- |
| `companies` / `company_settings` / `app_settings` | Empresa, identidade visual, loja, quinzena, retenção, alertas |
| `profiles` | Usuário (matrícula, nome, `role`, ativo, empresa); `tipo`/`roles` mantidos em sincronia por compatibilidade |
| `roles`, `permissions`, `role_permissions` | Papéis e catálogo de permissões padrão |
| `company_role_overrides`, `user_permissions` | Restrições/concessões por empresa e por usuário (`allowed`) |
| `motoboys` | Cadastro operacional (vínculo opcional com `profiles`) |
| `delivery_areas`, `neighborhoods`, `extra_rules` | Áreas com cobrança/repasse, bairros associados, regras de extras |
| `deliveries` | Comanda: endereço, coordenadas, motoboy, área, valores vigentes, status, pagamento, divergência |
| `delivery_extras` | Extras automáticos (uma vez por regra) e manuais, ajustes e descontos; cancelamento sem exclusão |
| `delivery_status_history` | Histórico de status (quem, quando, motivo) |
| `payments`, `payment_items` | Pagamentos com idempotência; uma entrega só pode estar em um pagamento ativo |
| `delivery_photos`, `delivery_conferences` | Fotos (Storage privado) e conferências OCR com revisão manual |
| `closing_periods`, `closing_items` | Fechamentos (sem sobreposição de períodos) e consolidação por motoboy |
| `manual_addresses` | Endereços marcados no mapa, com vínculo opcional à comanda |
| `audit_logs` | Auditoria genérica (antes/depois, campos alterados, justificativa) |

Valores monetários: `numeric(12,2)`. Datas de negócio: `date` + `time` no fuso da empresa.

## 4. Regras de segurança

- **RLS em todas as tabelas privadas.** Toda política exige `company_id = app.company_id()`, ou seja, a empresa do
  usuário ativo; usuário desativado ou empresa suspensa não enxerga nada.
- **Permissões granulares** por módulo e ação, avaliadas por `app.has_perm()` nesta ordem: ADMIN sempre permitido;
  depois ajuste individual (`user_permissions.allowed`); depois restrição da empresa para o papel; por fim o padrão do papel.
- **Motoboy** só lê as próprias entregas, pagamentos, fotos e conferências, e altera status apenas pela função
  `set_my_delivery_status` (sem `UPDATE` direto).
- **Escrita financeira só por funções**: `create_payment`, `set_payment_status` e `closing_*` validam transições e
  permissões e travam linhas (`FOR UPDATE`) contra concorrência.
- **Campos mantidos pelo banco** (totais, situação de pagamento, `company_id`, autor) são reescritos pelos gatilhos,
  mesmo se o cliente enviar outro valor.
- **Período encerrado**: gatilho bloqueia inserir, alterar ou excluir entregas e extras. A correção exige
  `fechamentos.corrigir`, justificativa de pelo menos 10 caracteres e fica registrada na auditoria e no fechamento.
- **Storage**: fotos no bucket privado `delivery-photos/{empresa}/…`, lidas por URL assinada (15 min). O logotipo
  fica no bucket público `branding/{empresa}/…`, com escrita restrita a `configuracoes.administrar`.
- **Credenciais**: `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY` existem só no servidor. Senhas ficam com
  hash no Supabase Auth; nada sensível vai para logs ou para o cache do service worker.
- **Login**: limite de tentativas por IP + matrícula e mensagem genérica (não revela se a matrícula existe).
  Usuário desativado tem as sessões revogadas.
- **Cabeçalhos HTTP**: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## 5. Plano de implementação (etapas)

| Etapa | Conteúdo | Situação |
| --- | --- | --- |
| 1 · Fundação | Estrutura, migrations, Auth por matrícula, papéis, permissões, RLS | ✅ |
| 2 · Operação | Entregas, motoboys, áreas, bairros, extras, cálculos, pagamentos | ✅ |
| 3 · Consulta | Hoje (indicadores do banco + tempo real), histórico, calendário, filtros | ✅ |
| 4 · Mapa | OSM/Leaflet, Nominatim com cache, marcadores, filtros, endereços manuais, correção por arraste, loja configurável | ✅ |
| 5 · Conferência | Câmera/galeria, Storage privado, OCR, comparação, aprovação manual, nova tentativa | ✅ |
| 6 · Financeiro | 10 relatórios em PDF A4, fechamento quinzenal com fluxo completo e bloqueio | ✅ |
| 7 · Administração | Notificações por evento real, auditoria, configurações, multiempresa | ✅ |
| 8 · Finalização | PWA, responsividade, testes, documentação | ✅ |

## 6. Dependências externas

| Serviço | Configuração | Sem configuração |
| --- | --- | --- |
| Supabase | URL + chave pública (+ service role) | o app não funciona |
| Anthropic (OCR) | `ANTHROPIC_API_KEY` | foto é armazenada; conferência manual; notificação de falha |
| Nominatim | `NOMINATIM_EMAIL` (recomendado) | funciona, mas fora da política recomendada; respeita 1 req/s |
| OpenStreetMap tiles | nenhuma | — |
| Vercel Cron | `CRON_SECRET` | fotos expiradas não são removidas automaticamente |
| pg_cron | habilitado pela migration 0006 | sem alertas periódicos de pendência (os alertas da tela Hoje continuam) |

## 7. Offline

O app exige conexão para ler e gravar, por segurança financeira. O service worker guarda só arquivos estáticos e
a tela offline. Sem conexão, um aviso aparece no topo, as ações recusam o envio com mensagem clara e os
formulários mantêm o que foi digitado. Não existe fila offline, então nenhuma operação fica pendente sem o usuário saber.
