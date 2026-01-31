import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App.jsx'
import PWAApp from './PWAApp.jsx'
import './index.css'

// Initialize Sentry if DSN is provided
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
if (SENTRY_DSN) {
  // Detect environment from URL
  const hostname = window.location.hostname
  const environment = hostname.includes('uat') || hostname.includes('staging')
    ? 'uat'
    : hostname.includes('localhost') || hostname.includes('127.0.0.1')
    ? 'development'
    : 'production'

  Sentry.init({
    dsn: SENTRY_DSN,
    environment,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // Release tracking
    release: import.meta.env.VITE_APP_VERSION || 'unknown',
  })
  console.log('✅ Sentry initialized for environment:', environment)
} else {
  console.log('ℹ️ Sentry not initialized (VITE_SENTRY_DSN not set)')
}

// Detect if running as installed PWA
const isPWA = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone // iOS Safari
  || document.referrer.includes('android-app://') // Android TWA

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('✅ Service Worker registered:', registration.scope)
        
        // Check for updates periodically
        setInterval(() => {
          registration.update()
        }, 60 * 60 * 1000) // Check every hour
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error)
      })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary 
    fallback={({ error, resetError }) => (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Something went wrong</h1>
        <p style={{ color: '#666', marginTop: '1rem' }}>{error.message}</p>
        <button 
          onClick={resetError}
          style={{ 
            marginTop: '1rem', 
            padding: '0.5rem 1rem', 
            cursor: 'pointer',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
        >
          Try again
        </button>
      </div>
    )}
    showDialog={false}
  >
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            {isPWA ? <PWAApp /> : <App />}
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </Sentry.ErrorBoundary>
)
