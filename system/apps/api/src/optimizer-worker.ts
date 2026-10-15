import { parentPort, workerData } from 'node:worker_threads';
import { solveBounded, type SolverInput } from './optimizer-search.js';
try { parentPort!.postMessage({type:'result',result:solveBounded(workerData as SolverInput,progress=>parentPort!.postMessage({type:'progress',progress}))}); }
catch(error){parentPort!.postMessage({type:'failed',message:(error as Error).message});}
