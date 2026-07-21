import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serve o projeto num subcaminho (usuario.github.io/repo/), não
// na raiz — a Action de deploy passa VITE_BASE nesse caso. Em dev/local
// (sem a variável) fica em '/', normal.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Pesquisa de Satisfação — ISV',
        short_name: 'ISV',
        description: 'Coleta (totem) e painel de gestão do Instituto São Vicente',
        theme_color: '#0B6E63',
        background_color: '#0B6E63',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // O app shell (JS/CSS/HTML) fica pré-cacheado. As respostas de leitura
        // do Supabase (config/perguntas) ficam em cache "melhor esforço": usa a
        // rede quando dá, cai pro último cache bom se estiver offline. A
        // gravação de resposta já tem fila própria em localStorage (isv.js) —
        // não precisa (e não deve) passar pelo cache do service worker.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              url.hostname.endsWith('.supabase.co') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'isv-supabase-leitura',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true },
});
