import type React from "react"

/** Substituto de next/link para o vídeo: os componentes reais não navegam aqui. */
export default function Link({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  )
}
