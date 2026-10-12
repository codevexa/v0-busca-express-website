import type { Metadata, Viewport } from "next"
import { Toaster } from "@/components/ui/sonner"
import { ServiceWorkerRegister } from "@/components/ossala/sw-register"

export const metadata: Metadata = {
  title: { default: "OSSALA - Controle de Entregas", template: "%s | OSSALA" },
  description: "Gestão operacional e financeira das entregas da OSSALA.",
  manifest: "/ossala.webmanifest",
  applicationName: "OSSALA",
  appleWebApp: { capable: true, title: "OSSALA", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/pwa-icon/192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/pwa-icon/180", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#800020",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function OssalaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ossala min-h-dvh">
      {children}
      <Toaster />
      <ServiceWorkerRegister />
    </div>
  )
}
