export type EngineResult = {best: string | null; cp: number | null; mate: number | null};
class Engine {
 private worker: Worker | null = null;
 private ready: Promise<void> | null = null;
 private queue: Promise<unknown> = Promise.resolve();
 private serial = 0;
 private async init() {
  if (this.ready) return this.ready;
  this.ready = new Promise<void>((resolve,reject) => {
   try {
    const worker = new Worker('/engine/stockfish-19-lite-single.js');
    this.worker=worker;
    const timeout = window.setTimeout(()=>{worker.removeEventListener('message',listen);this.ready=null;worker.terminate();this.worker=null;reject(new Error('Stockfish did not load. Try npm install and restart.'));},20000);
    const listen=(event:MessageEvent)=>{if(String(event.data).includes('uciok')) {clearTimeout(timeout);worker.removeEventListener('message',listen);resolve();}};
    worker.addEventListener('message',listen);
    worker.addEventListener('error',()=>{clearTimeout(timeout);this.worker=null;this.ready=null;reject(new Error('Could not load the local Stockfish engine.'));},{once:true});
    worker.postMessage('uci');
   } catch(e){this.ready=null;reject(e);}
  });
  return this.ready;
 }
 private async run(fen:string,depth:number,skill:number):Promise<EngineResult> {
  await this.init();
  const worker=this.worker!;
  return new Promise((resolve,reject)=>{
   let best:string|null=null,cp:number|null=null,mate:number|null=null;
   const timeout=window.setTimeout(()=>{worker.removeEventListener('message',listen);this.reset();reject(new Error('Chess engine took too long.'));},45000);
   const listen=(event:MessageEvent)=>{
    const line=String(event.data);
    if(line.startsWith('info ') && line.includes(' score ') && line.includes(' pv ')) {
     const c=line.match(/\bscore cp (-?\d+)/),m=line.match(/\bscore mate (-?\d+)/);
     if(c) {cp=Number(c[1]);mate=null;} else if(m){mate=Number(m[1]);cp=null;}
    }
    if(line.startsWith('bestmove ')) {
     best=line.split(' ')[1];clearTimeout(timeout);worker.removeEventListener('message',listen);resolve({best:best==='(none)'?null:best,cp,mate});
    }
   };
   worker.addEventListener('message',listen);
   worker.postMessage('ucinewgame');
   worker.postMessage(`setoption name Skill Level value ${skill}`);
   worker.postMessage(`position fen ${fen}`);
   worker.postMessage(`go depth ${depth}`);
  });
 }
 analyze(fen:string,depth=11,skill=20):Promise<EngineResult> {
  const ticket=this.serial;
  const work=()=> ticket===this.serial ? this.run(fen,depth,skill) : Promise.reject(new Error('Cancelled'));
  const pending=this.queue.then(work,work);
  this.queue=pending.catch(()=>{});return pending;
 }
 reset(){this.serial++;this.worker?.terminate();this.worker=null;this.ready=null;this.queue=Promise.resolve();}
}
export const engine=new Engine();
export function whiteScore(result:EngineResult,turn:'w'|'b'):number|null {
 const score=result.mate!==null ? Math.sign(result.mate)* (10000-Math.min(Math.abs(result.mate),99)*100) : result.cp;
 return score===null?null:(turn==='w'?score:-score);
}
