import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
 root:process.cwd(),
 resolve:{alias:{'@':resolve(process.cwd(),'src')}},
 plugins:[react(),tsconfigPaths()],
 server:{host:'127.0.0.1',port:4173,strictPort:true},
 clearScreen:false,
});
