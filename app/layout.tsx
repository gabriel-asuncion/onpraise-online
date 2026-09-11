import { EngineProvider } from "./context/EngineContext";
import ClientLayoutWrapper from "../components/ClientLayoutWrapper";
import IOSInstallPrompt from "../components/IOSInstallPrompt"; 
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
  maximumScale: 1,
  userScalable: false, 
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
        
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
                    meta.content = 'width=' + physicalWidth + ', initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
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
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `
          }} 
        />

        <EngineProvider>
          <ClientLayoutWrapper>
            {children}
            <SpeedInsights />
            <Analytics />
          </ClientLayoutWrapper>
        </EngineProvider>

        <IOSInstallPrompt />
      </body>
    </html>
  );
}