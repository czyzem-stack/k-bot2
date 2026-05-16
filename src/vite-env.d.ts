/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEPLOY_CHANNEL?: 'dev' | 'live'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
