import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/providers/WalletProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Legasi | Agentic Credit Infrastructure on Solana",
  description: "The first lending protocol where AI agents are first-class citizens. Autonomous borrowing, on-chain reputation, x402 payments. Built on Solana.",
  keywords: ["AI agents", "DeFi", "lending", "Solana", "credit", "autonomous", "x402", "reputation", "hackathon"],
  authors: [{ name: "Legasi", url: "https://legasi.io" }],
  creator: "Bouliche",
  publisher: "Legasi",
  metadataBase: new URL("https://agentic.legasi.io"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://agentic.legasi.io",
    title: "Legasi | Agentic Credit Infrastructure",
    description: "The first lending protocol where AI agents are first-class citizens. Autonomous borrowing, on-chain reputation, x402 payments.",
    siteName: "Legasi",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Legasi - Agentic Credit Infrastructure",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Legasi | Agentic Credit Infrastructure",
    description: "The first lending protocol where AI agents are first-class citizens.",
    creator: "@legasi_xyz",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <link rel="canonical" href="https://agentic.legasi.io" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Legasi",
              "description": "Agentic Credit Infrastructure - The first lending protocol where AI agents are first-class citizens",
              "applicationCategory": "FinanceApplication",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "creator": {
                "@type": "Organization",
                "name": "Legasi",
                "url": "https://legasi.io"
              }
            }),
          }}
        />
      </head>
      <body className={`${inter.className} bg-[#001520] text-white antialiased`}>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
