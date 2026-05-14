/**
 * @file register.js
 * Pre-loader script executed via --import flag.
 * Loads .env into process.env before the TypeScript module graph is evaluated.
 * This runs synchronously before any ESM imports are resolved.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(__dirname, '.env') });
