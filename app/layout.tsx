import { EngineProvider } from "./context/EngineContext";
import ClientLayoutWrapper from "../components/ClientLayoutWrapper"; 
import { SetlistInviteProvider } from "../components/SetlistInviteProvider";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from 'next/script';
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

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
  themeColor: "#09090B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />

        <Script
          id="pwa-install-prompt-capture"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('beforeinstallprompt', function(event) {
                event.preventDefault();
                window.__onPraiseDeferredInstallPrompt = event;
              });
            `
          }}
        />
        
        {/* ✅ SURGICAL FIX: "Desktop Mode" Viewport Buster */}
        {/* This runs synchronously before CSS paints to prevent the tiny desktop layout flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var physicalWidth = window.screen.width;
                  var browserCanvasWidth = window.innerWidth;
                  
                  // If the hardware is a phone/tablet, but the browser is forcing a massive canvas
                  if (physicalWidth <= 1024 && browserCanvasWidth > physicalWidth) {
                    var meta = document.querySelector('meta[name="viewport"]');
                    if (!meta) {
                      meta = document.createElement('meta');
                      meta.name = 'viewport';
                      document.head.appendChild(meta);
                    }
                    // Force the browser back to the physical device width
                    meta.content = 'width=' + physicalWidth + ', initial-scale=1.0';
                  }
                } catch(e) {}
              })();
            `
          }}
        />
      </head>
      
      <body 
        className="bg-surface text-on-surface font-sans h-[100dvh] w-screen overflow-hidden flex flex-col antialiased select-none" 
        suppressHydrationWarning
      >
        <Script 
          id="service-worker-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(function(error) {
                  console.error('PWA service worker registration failed:', error);
                });
              }
            `
          }} 
        />

        <EngineProvider>
          <SetlistInviteProvider>
            <ClientLayoutWrapper>
              {children}
              <SpeedInsights />
              <Analytics />
            </ClientLayoutWrapper>
          </SetlistInviteProvider>
        </EngineProvider>
      </body>
    </html>
  );
}