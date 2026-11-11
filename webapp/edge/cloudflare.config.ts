import { bindings, defineConfig, defineWorker } from 'cf/config';
import * as entrypoint from './src/index.ts' with { type: 'cf-worker' };
const worker = defineWorker({name:'talktobook-free',compatibilityDate:'2026-10-24',entrypoint,domains:['talktobook.forsvn.com'],assets:{htmlHandling:'drop-trailing-slash',notFoundHandling:'404-page'},observability:{enabled:true,logs:{enabled:false},traces:{enabled:false}}});
export default defineConfig({worker:{...worker,env:{ASSETS:bindings.assets()}}});
