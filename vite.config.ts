import {defineConfig} from 'vite';
export default defineConfig({
  build:{outDir:'dist/web',emptyOutDir:true,assetsInlineLimit:0},
  server:{host:'127.0.0.1',port:4321,strictPort:true},
});
