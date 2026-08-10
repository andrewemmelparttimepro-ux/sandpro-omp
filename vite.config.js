import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Stamped into client error telemetry so a report can be tied to the deploy
// that produced it, and published as /version.json so running sessions can
// detect that a newer build shipped (the stale-bundle heartbeat).
const BUILD_ID = new Date().toISOString().slice(0, 16).replace('T', '-')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'omp-version-file',
      writeBundle() {
        writeFileSync(resolve('dist', 'version.json'), JSON.stringify({ build: BUILD_ID }))
      },
    },
  ],
  define: {
    __OMP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
})
