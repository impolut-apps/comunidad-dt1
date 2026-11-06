import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(async ({ mode }) => {
  // Make .env values visible to brand.config.ts before importing it.
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'VITE_'))
  const { brand } = await import('./brand.config')

  return {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      __BRAND__: JSON.stringify(brand),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'brand-html',
        transformIndexHtml: (html: string) =>
          html.replaceAll('%APP_NAME%', brand.name).replaceAll('%APP_DESCRIPTION%', brand.description),
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: brand.name,
          short_name: brand.shortName,
          description: brand.description,
          lang: 'es',
          start_url: '/home',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: brand.colors.ice,
          theme_color: brand.colors.primary,
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          // Never cache Supabase API responses: they are private, per-user data.
          runtimeCaching: [],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
      }),
    ],
  }
})
