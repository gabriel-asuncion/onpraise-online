import { EngineProvider } from "./context/EngineContext";
import ClientLayoutWrapper from "../components/ClientLayoutWrapper";
import IOSInstallPrompt from "../components/IOSInstallPrompt"; 
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from 'next/script';
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

// ✅ SURGICAL FIX: Import the Client-Side Wrapper instead!
import FabWrapper from "../components/FabWrapper";

export const metadata: Metadata = {
  title: "Worship Matrix",
  description: "Live Setlist and Worship Management",
  appleWebApp: {
    capable: true,
    title: "Matrix",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#07111f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, 
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-[#0b1020] text-slate-100" suppressHydrationWarning>
        <Script 
          id="service-worker-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                // ... your existing SW code
              }
            `
          }} 
        />

        <EngineProvider>
          <ClientLayoutWrapper>
            {children}
            {/* ✅ Will now safely mount only on the client! */}
            <SpeedInsights />
            <Analytics />
            <FabWrapper />
          </ClientLayoutWrapper>
        </EngineProvider>

        <IOSInstallPrompt />
      </body>
    </html>
  );
}