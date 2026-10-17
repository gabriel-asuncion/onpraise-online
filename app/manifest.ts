import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OnPraise-Online',
    short_name: 'OPOnline',
    description: 'Live Setlist and Worship Management',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090B',
    theme_color: '#09090B',
    // ✅ SURGICAL ADDITION: Registering the custom protocol
    protocol_handlers: [
      {
        protocol: "web+onpraise",
        url: "/?mode=%s"
      }
    ] as any, // 'as any' prevents Next.js strict typing from throwing a false error here
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}