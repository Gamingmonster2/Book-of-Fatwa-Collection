/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FILES_BASE?: string
  readonly VITE_ORIGINAL_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
