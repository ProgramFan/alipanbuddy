// Runs before any other module (first import in src/main.ts).
import { Buffer } from 'buffer'

if (typeof (window as any).Buffer === 'undefined') (window as any).Buffer = Buffer
if (typeof (globalThis as any).global === 'undefined') (globalThis as any).global = globalThis
