/// <reference types="vite/client" />

// vite/client types ImportMetaEnv with a `[key: string]: any` index signature,
// which would silently make every import.meta.env read `any`. Declaring the
// vars the app actually uses restores `string | undefined` at the call sites
// in src/api.ts.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
