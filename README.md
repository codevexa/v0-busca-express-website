# OSSALA | Controle de Entregas

Sistema web (PWA) para a gestão operacional e financeira das entregas da OSSALA: comandas, motoboys, áreas e
cobrança, extras, pagamentos, conferência por foto com OCR, mapa, relatórios em PDF, fechamento quinzenal,
notificações, auditoria e administração de usuários, com isolamento entre empresas.

- **Aplicativo:** `/app` (login por matrícula e senha)
- **Landing page da Busca Express:** `/` (mantida)

Documentação complementar:

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): arquitetura, estrutura de pastas, modelo de dados, segurança e plano por etapas
- [`docs/TESTES.md`](docs/TESTES.md): checklist dos 24 testes obrigatórios, com resultados e limitações

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Interface | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Radix UI / shadcn/ui, Lucide |
| Backend | Supabase: PostgreSQL 17, Auth, Storage, Realtime, RLS, funções SQL, pg_cron |
| Mapas | OpenStreetMap (tiles), Leaflet + React Leaflet, Nominatim (geocodificação via servidor, com cache de 5 min) |
| OCR | Claude (API da Anthropic, visão + saída estruturada) no endpoint interno `/api/conferencia/ocr` |
| Relatórios | jsPDF + jspdf-autotable (A4, cabeçalho repetido, totais e paginação) |
| Métricas | Vercel Analytics |
| Testes | Vitest; PGlite (Postgres em WebAssembly) para testar migrations, regras e RLS |

## Executar localmente

Requisitos: Node.js 20+ e pnpm 10+.

```bash
pnpm install
cp .env.example .env.local      # preencha as variáveis (veja abaixo)
pnpm dev                        # http://localhost:3000/app
```

Outros comandos:

```bash
pnpm typecheck    # verificação de tipos
pnpm test         # todos os testes (unitários + banco)
pnpm test:unit    # cálculos, períodos, OCR (comparação) e PDF
pnpm test:db      # migrations + regras de negócio + RLS em Postgres local (PGlite)
pnpm build        # build de produção
```

## Variáveis de ambiente

Todas estão documentadas em [`.env.example`](.env.example).

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | sim | chave pública (RLS aplicada) |
| `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_SECRET_KEY`) | para administrar usuários | criar usuários, redefinir senhas, revogar sessões, cron de retenção. **Somente servidor.** |
| `ANTHROPIC_API_KEY` | para o OCR | leitura das comandas fotografadas. Sem ela, a conferência é manual |
| `NOMINATIM_EMAIL` | recomendada | identificação exigida pela política do Nominatim |
| `CRON_SECRET` | para a retenção de fotos | autentica o Vercel Cron em `/api/cron/retencao` |
| `NEXT_PUBLIC_APP_URL` | recomendada | links de recuperação de senha |
| `NEXT_PUBLIC_COMPANY_SLUG` | não | empresa exibida no login (padrão `empresa-principal`) |

O projeto Vercel `v0-sistema-de-entregas-ossala` já tem as variáveis do Supabase (integração Vercel ↔ Supabase).
Faltam `ANTHROPIC_API_KEY`, `NOMINATIM_EMAIL` e `CRON_SECRET`.

## Configurar o Supabase

As migrations ficam em [`supabase/migrations`](supabase/migrations) e são idempotentes: funcionam num projeto novo
e no banco existente da versão anterior, sem apagar dados.

**Projeto em uso:** `supabase-fuchsia-window` (`rbfbzjesdjynbzpfgnwv`). Situação em 12/10/2026:

| Migration | Situação |
| --- | --- |
| 0001 baseline, 0002 identidade/permissões, 0003 operações, 0004 pagamentos, 0005 fotos/conferência, 0006 notificações, 0008 RLS, 0009 funções, 0910 identidade pública | ✅ aplicadas |
| **0007 fechamentos** e **0850 substituição das regras antigas** | ⚠️ **pendentes**: precisam de aprovação manual |

As duas pendentes contêm comandos `DROP`/`DELETE`, e o conector do Supabase exige confirmação humana para executá-los.
Para aplicar:

1. Abra **Supabase → SQL Editor → New query**.
2. Cole o conteúdo de [`supabase/manual/aplicar_no_sql_editor.sql`](supabase/manual/aplicar_no_sql_editor.sql) e clique em **Run**.

O arquivo roda numa transação única: ou aplica tudo, ou nada. Enquanto ele não for aplicado:

- os fechamentos quinzenais ficam indisponíveis;
- as funções Gestor/Administrativo/Motoboy ainda não recebem as permissões padrão novas (o Administrador já tem acesso total);
- as políticas antigas de `profiles`/`companies`/áreas/notificações, que não isolam empresas, continuam ativas.

**Projeto novo:** aplique todos os arquivos de `supabase/migrations` em ordem (`supabase db push` ou SQL Editor).
Depois crie o primeiro administrador:

1. Supabase → Authentication → Add user (e-mail interno, ex.: `admin@ossala.internal`, com senha).
2. No SQL Editor:
   ```sql
   insert into public.profiles (id, matricula, nome, tipo, role, company_id, email)
   select u.id, 'ADMIN', 'Administrador', 'admin', 'ADMIN', c.id, u.email
     from auth.users u, public.companies c
    where u.email = 'admin@ossala.internal' and c.slug = 'empresa-principal';
   ```
3. Entre em `/app/login` com a matrícula `ADMIN`. Os demais usuários são criados pela tela **Usuários**.

## Implantação na Vercel

1. Importe este repositório na Vercel (Framework: Next.js), ou conecte-o ao projeto existente.
2. Configure as variáveis de ambiente da tabela acima (Production e Preview).
3. Faça o deploy. O `vercel.json` agenda a limpeza diária de fotos expiradas (`/api/cron/retencao`).
4. Em **Supabase → Authentication → URL Configuration**, adicione `https://SEU-DOMINIO/app/auth/callback` às Redirect URLs
   (recuperação de senha por e-mail).

## Primeiro uso (administrador)

1. **Áreas e cobrança:** informe o valor cobrado e o repasse de Área 1, 2 e 3. Os valores não ficam fixos no código.
2. **Bairros:** associe os bairros às áreas.
3. **Mapa** ou **Configurações:** posicione a loja.
4. **Configurações:** envie o logotipo oficial. Sem arquivo, o sistema usa a marca textual "OSSALA".
5. **Usuários:** crie gestores, administrativos e motoboys.

## Estrutura

```
app/
  page.tsx                  landing Busca Express
  app/                      aplicativo OSSALA (/app)
    login/                  login por matrícula
    (painel)/               telas autenticadas (Hoje, Entregas, Mapa, Fotos, Conferência,
                            Relatórios, Pagamentos, Fechamentos, Alertas, Usuários, …)
  api/                      rotas de servidor (login, OCR, geocodificação, cron)
components/                 interface (ui/ = componentes base; ossala/, deliveries/, map/, conference/)
lib/
  actions/                  ações de servidor (validação zod + sessão do usuário)
  ocr/ geo/ reports/        integrações (OCR, Nominatim, PDF)
  money.ts dates.ts         cálculos monetários e períodos (centavos, fuso de São Paulo)
  supabase/                 clientes (navegador, servidor, administrativo)
supabase/migrations/        banco versionado (tabelas, regras, RLS, funções)
tests/                      testes unitários e de banco (PGlite)
public/sw.js                service worker do PWA
```
