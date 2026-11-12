import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './lib/install' // catches the browser's one-time install event before any screen mounts
import { router } from './app/router'
import { AuthProvider } from './app/auth'
import { ThemeProvider } from './app/theme'
import { ToastProvider } from './components/ui'
import { isSupabaseConfigured } from './lib/supabase'
import { SetupRequiredPage } from './features/misc/pages'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      {isSupabaseConfigured ? (
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      ) : (
        <SetupRequiredPage />
      )}
    </ThemeProvider>
  </StrictMode>,
)
