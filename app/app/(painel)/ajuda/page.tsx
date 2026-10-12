import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/ossala/page-header"
import { requireContext } from "@/lib/auth"

export const metadata: Metadata = { title: "Ajuda" }

const SECTIONS = [
  {
    title: "Primeiros passos (administrador)",
    items: [
      ["Configure valores das áreas", "Áreas e cobrança → defina valor cobrado e repasse de cada área.", "/app/areas"],
      ["Associe os bairros às áreas", "Entregas com bairro cadastrado recebem a área automaticamente.", "/app/areas"],
      ["Posicione a loja no mapa", "Mapa → Posicionar a loja, ou informe latitude/longitude em Configurações.", "/app/mapa"],
      ["Cadastre motoboys e usuários", "Usuários → Novo usuário (perfil Motoboy cria o vínculo automaticamente).", "/app/usuarios"],
      ["Envie o logotipo oficial", "Configurações → Logotipo oficial.", "/app/configuracoes"],
    ],
  },
  {
    title: "Rotina da operação",
    items: [
      ["Cadastrar comandas", "Entregas → Nova entrega. A busca de endereço preenche bairro, cidade e posição.", "/app/entregas"],
      ["Acompanhar o dia", "Hoje mostra indicadores, alertas e entregas por motoboy e área em tempo real.", "/app"],
      ["Conferir comandas por foto", "Fotos → Fotografar ou Galeria. A conferência exige aprovação manual.", "/app/fotos"],
      ["Pagar motoboys", "Pagamentos → A pagar → selecione as entregas → aprovar → registrar pagamento.", "/app/pagamentos"],
      ["Fechar a quinzena", "Fechamentos → gerar consolidação → revisar divergências → aprovar → encerrar → exportar.", "/app/fechamentos"],
    ],
  },
  {
    title: "Motoboy",
    items: [
      ["Minhas entregas", "Mostra somente as entregas atribuídas a você. Use \"Pedido entregue\" ao concluir.", "/app/minhas-entregas"],
      ["Foto da comanda", "Use o botão Foto em cada entrega para enviar a comanda para conferência.", "/app/fotos"],
    ],
  },
]

export default async function AjudaPage() {
  await requireContext()
  return (
    <>
      <PageHeader title="Ajuda" description="Guia rápido do OSSALA | Controle de Entregas." />
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <section key={s.title} className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold text-[#e8c98e]">{s.title}</h2>
            <ol className="space-y-2 text-sm">
              {s.items.map(([t, d, href], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#800020] text-xs text-[#d4af37]">{i + 1}</span>
                  <span>
                    <Link href={href} className="font-medium text-[#d4af37] hover:underline">
                      {t}
                    </Link>
                    <span className="block text-muted-foreground">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <section className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <h2 className="mb-2 font-semibold text-[#e8c98e]">Instalar no celular</h2>
          No Android (Chrome): menu ⋮ → Instalar app. No iPhone (Safari): Compartilhar → Adicionar à Tela de Início.
        </section>
      </div>
    </>
  )
}
