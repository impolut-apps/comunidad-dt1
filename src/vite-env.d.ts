/// <reference types="vite/client" />

interface BrandConfig {
  name: string
  shortName: string
  slogan: string
  sloganEn: string
  description: string
  colors: Record<'primary' | 'electric' | 'soft' | 'ice' | 'midnight' | 'mint', string>
}
declare const __BRAND__: BrandConfig

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SITE_URL?: string
}
