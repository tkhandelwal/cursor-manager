import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ServiceWorkerRegistrar } from "@/components/service-worker"
import { SkipLink } from "@/components/skip-link"
import { THEME_COLOR } from "@/lib/manifest"
import { THEME_BOOT_SCRIPT } from "@/lib/theme"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Session Guard",
  description:
    "Cap Cursor agents at 5, get told when to start a new chat, then auto-rotate and delete older ones.",
  // Next injects <link rel="manifest"> from app/manifest.ts automatically.
  appleWebApp: { capable: true, title: "Cursor Mgr", statusBarStyle: "black-translucent" },
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SkipLink />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
