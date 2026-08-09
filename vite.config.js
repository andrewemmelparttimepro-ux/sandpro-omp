import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Stamped into client error telemetry so a report can be tied to the
    // deploy that produced it.
    __OMP_BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', '-')),
  },
})
