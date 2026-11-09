import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
 root:process.cwd(),
 resolve:{alias:[
  {find:'@tanstack/react-start/server',replacement:resolve(process.cwd(),'tests/battle/browser/tanstack-server-stub.ts')},
  {find:'@tanstack/react-start',replacement:resolve(process.cwd(),'tests/battle/browser/tanstack-start-stub.ts')},
  {find:'@',replacement:resolve(process.cwd(),'src')},
 ]},
 plugins:[react(),tsconfigPaths()],
 server:{host:'127.0.0.1',port:4173,strictPort:true},
 clearScreen:false,
});
