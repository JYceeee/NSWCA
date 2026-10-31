import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error plain JS, run by Node
import { siteDefaults } from './scripts/site-defaults-plugin.mjs'

export default defineConfig({
  plugins: [react(), siteDefaults()],
})
