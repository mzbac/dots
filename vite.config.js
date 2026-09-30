import { defineConfig } from 'vite';
// GitHub Actions supplies the actual repository, including for forks and renames.
// Do not fall back to home.json or a copied git remote: absent identity is closed.
export default defineConfig({
  base: './',
  publicDir: 'public',
  define: { __HOME_REPOSITORY__: JSON.stringify(process.env.GITHUB_REPOSITORY || '') },
  build: { target: 'es2022', chunkSizeWarningLimit: 700 }
});
