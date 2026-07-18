/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SITE_BASE_DOMAIN?: string;
  readonly VITE_WEB_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}