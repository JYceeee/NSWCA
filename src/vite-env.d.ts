/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 1 = no server: everything stays in this browser (see src/lib/api.ts). */
  readonly VITE_LOCAL_ONLY?: string
}
