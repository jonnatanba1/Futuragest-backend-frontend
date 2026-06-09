/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the FuturaGest backend API (no trailing slash). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
