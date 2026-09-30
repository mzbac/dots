import { defineConfig } from 'vite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {socialMetadata} from './tools/social-metadata.mjs';
// GitHub Actions supplies the actual repository, including for forks and renames.
// Do not fall back to home.json or a copied git remote: absent identity is closed.
export default defineConfig({
  base: './',
  publicDir: 'public',
  plugins:[{name:'own-home-share-card',transformIndexHtml(html,context){if(context.path.endsWith('/experiment.html'))return [];return socialMetadata(JSON.parse(readFileSync(new URL('./home.json',import.meta.url),'utf8')),process.env.GITHUB_REPOSITORY||'');}}],
  define: { __HOME_REPOSITORY__: JSON.stringify(process.env.GITHUB_REPOSITORY || '') },
  build: { target: 'es2022', chunkSizeWarningLimit: 700, rollupOptions:{input:{home:fileURLToPath(new URL('./index.html',import.meta.url)),experiment:fileURLToPath(new URL('./experiment.html',import.meta.url))}} }
});
