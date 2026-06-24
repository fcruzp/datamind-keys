import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DataMind BI — API Keys",
  description:
    "Manage per-user API keys for DataMind BI integrations (OpenFN, N8N, etc.). SHA-256 hashed, scope-aware, with full request logging.",
  keywords: [
    "DataMind BI",
    "API Keys",
    "OpenFN",
    "N8N",
    "Business Intelligence",
    "Next.js",
  ],
  authors: [{ name: "DataMind BI" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "DataMind BI — API Keys",
    description:
      "Per-user API keys for OpenFN / N8N integrations. Hashed, scoped, logged.",
    siteName: "DataMind BI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DataMind BI — API Keys",
    description:
      "Per-user API keys for OpenFN / N8N integrations. Hashed, scoped, logged.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <TooltipProvider delayDuration={200}>
              {children}
            </TooltipProvider>
            <Toaster />
            <Sonner position="top-right" richColors closeButton />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
