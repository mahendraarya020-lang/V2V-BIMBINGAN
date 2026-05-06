export const appConfig = {
  backendUrl: import.meta.env.VITE_BACKEND_URL
    ?? (import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin),
}
