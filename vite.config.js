import {defineConfig} from 'vite';
import {sceneProxy,llmProxy} from './tools/scene-proxy.mjs';

export default defineConfig({
 plugins:[sceneProxy()],
 preview:{proxy:llmProxy()},
 build:{chunkSizeWarningLimit:1400,rollupOptions:{output:{manualChunks:{'default-brain':['./src/cell/default-brain.json']}}}},
 server:{
  // 1. Allow all incoming host connections (local network and public IPs)
  host: '0.0.0.0', 
  port: 5340,
  // 2. Allow Vite to pick the next available port if 5340 is taken
  strictPort: false, 
  // 3. Disable strict file system routing to allow accessing files outside the workspace root
  fs: { strict: false },
  // 4. (Optional) Allow all incoming HTTP Host headers to bypass host checking
  allowedHosts: true, 
  watch:{ignored:['**/test/**','**/docs/**','**/tools/**','**/logs/**','**/saved-world/**'],usePolling:process.platform==='win32',interval:300},
  proxy:llmProxy()}
});
