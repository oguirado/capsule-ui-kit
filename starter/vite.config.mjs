import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 root: fileURLToPath(new URL('./', import.meta.url)), base: './', plugins: [vue()],
 resolve: { dedupe: ['vue','dockview-vue','dockview-core'] },
 define: { __VUE_OPTIONS_API__: false, __VUE_PROD_DEVTOOLS__: false },
 build: { outDir: 'dist/renderer', emptyOutDir: true, sourcemap: false, modulePreload: false }
});
