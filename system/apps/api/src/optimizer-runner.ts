import { Worker } from 'node:worker_threads';
import type { SolverInput, solveBounded } from './optimizer-search.js';
export function runOptimizerWorker(input:SolverInput,signal:AbortSignal,onProgress?:(progress:Record<string,unknown>)=>void):Promise<ReturnType<typeof solveBounded>> {
  return new Promise((resolve,reject)=>{
    const ts=import.meta.url.endsWith('.ts');const worker=new Worker(new URL(`./optimizer-worker.${ts?'ts':'js'}`,import.meta.url),{workerData:input,execArgv:ts?['--import','tsx']:[],resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
    let settled=false;const finish=(error:Error|null,result?:ReturnType<typeof solveBounded>)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);void worker.terminate();error?reject(error):resolve(result!);};
    const abort=()=>finish(new Error('Optimization cancelled or job time budget reached'));
    const timer=setTimeout(()=>finish(new Error('Optimization worker time budget reached')),10000);
    worker.on('message',message=>{if(message.type==='progress')onProgress?.(message.progress);else if(message.type==='result')finish(null,message.result);else if(message.type==='failed')finish(new Error(message.message));});
    worker.on('error',error=>finish(error));worker.on('exit',code=>{if(!settled)finish(new Error(`Optimization worker exited (${code})`));});signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  });
}
