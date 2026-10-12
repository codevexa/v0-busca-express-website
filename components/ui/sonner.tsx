"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: "border border-border" } }}
      {...props}
    />
  )
}

export { Toaster }
