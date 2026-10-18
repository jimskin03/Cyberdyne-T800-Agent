import {defineConfig} from 'vite';
export default defineConfig({
 build:{chunkSizeWarningLimit:1400,rollupOptions:{output:{manualChunks:{'default-brain':['./src/cell/default-brain.json']}}}},
 server:{host:'127.0.0.1',port:5340,strictPort:true,fs:{strict:true},
  watch:{ignored:['**/test/**','**/docs/**','**/tools/**','**/logs/**','**/saved-world/**'],usePolling:process.platform==='win32',interval:300},
  proxy:{'/llm':{target:'http://127.0.0.1:18081',changeOrigin:true,rewrite:p=>p.replace(/^\/llm/,'')}}}
});
