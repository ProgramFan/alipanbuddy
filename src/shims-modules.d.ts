// Ambient declarations for dependencies that ship no types (must stay a script file: no imports/exports).
declare module 'axios/unsafe/helpers/buildURL.js' {
  const buildURL: (url: string, params?: any, options?: any) => string
  export default buildURL
}
declare module 'axios/unsafe/core/buildFullPath.js' {
  const buildFullPath: (baseURL: string | undefined, requestedURL: string | undefined, allowAbsoluteUrls?: boolean) => string
  export default buildFullPath
}
declare module 'axios/unsafe/core/settle.js' {
  const settle: (resolve: (value: any) => void, reject: (reason?: any) => void, response: any) => void
  export default settle
}
declare module 'secp256k1/elliptic' {
  export * from 'secp256k1'
}
declare module 'mime-db' {
  const db: Record<string, { source?: string; extensions?: string[]; compressible?: boolean; charset?: string }>
  export default db
}
