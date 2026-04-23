/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_M2M_API_BASE?: string
  readonly VITE_M2M_FUNCTION_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
