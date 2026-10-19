import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Chess,type Square,type Color,type Move} from 'chess.js';
import { Activity, ArrowDownToLine, ArrowLeftRight, BarChart3, BookOpen, BrainCircuit, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Crown, Flag, Github, Lightbulb, LoaderCircle, Medal, Moon, Play, RotateCcw, Settings2, Shield, Sparkles, Swords, Target, Trophy, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import {engine,whiteScore} from './engine';
type Mode='ai'|'local';type Difficulty='Easy'|'Medium'|'Hard'|'Legend';type Grade='Best'|'Excellent'|'Good'|'Inaccuracy'|'Mistake'|'Blunder';
type Review={san:string;color:Color;grade:Grade;loss:number;best:string|null;fen:string;score:number|null};
const levels:Record<Difficulty,{depth:number;skill:number;description:string}>= {Easy:{depth:2,skill:0,description:'Learning the ropes'},Medium:{depth:5,skill:5,description:'A worthy opponent'},Hard:{depth:9,skill:13,description:'Think two steps ahead'},Legend:{depth:14,skill:20,description:'No mercy on the board'}};
const glyph:Record<string,string>={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
const grades:Record<Grade,string>={Best:'best',Excellent:'excellent',Good:'good',Inaccuracy:'inaccuracy',Mistake:'mistake',Blunder:'blunder'};
const STORAGE='knightfall-settings-v1';
const getSettings=()=>{try{return JSON.parse(localStorage.getItem(STORAGE)||'{}')}catch{return {}}};
function getStatus(c:Chess){if(c.isCheckmate())return `${c.turn()==='w'?'Black':'White'} wins by checkmate`;if(c.isStalemate())return 'Draw by stalemate';if(c.isThreefoldRepetition())return 'Draw by repetition';if(c.isInsufficientMaterial())return 'Draw — insufficient material';if(c.isDraw())return 'Game drawn';if(c.isCheck())return `${c.turn()==='w'?'White':'Black'} is in check`;return `${c.turn()==='w'?'White':'Black'} to move`;}
function moveToUci(m:Move){return m.from+m.to+(m.promotion||'')}
function gradeLoss(loss:number,isBest:boolean):Grade{if(isBest||loss<=10)return 'Best';if(loss<=35)return 'Excellent';if(loss<=85)return 'Good';if(loss<=170)return 'Inaccuracy';if(loss<=350)return 'Mistake';return 'Blunder'}
function fallbackMove(fen:string,level:Difficulty):string|null{
 const position=new Chess(fen);const moves=position.moves({verbose:true});if(!moves.length)return null;
 const values:Record<string,number>={p:1,n:3,b:3.2,r:5,q:9,k:0};
 const scored=moves.map(m=>{const next=new Chess(fen);next.move(m);const material=(m.captured?values[m.captured]||0:0)*10+(m.promotion?values[m.promotion]*7:0);const check=next.isCheckmate()?500:next.isCheck()?2:0;const center=3.5-Math.abs(3.5-('abcdefgh'.indexOf(m.to[0])));return {m,score:material+check+center*.18+Math.random()*(level==='Easy'?18:level==='Medium'?9:level==='Hard'?3:.8)};});
 scored.sort((a,b)=>b.score-a.score);const m=scored[0].m;return moveToUci(m);
}
function exportText(name:string,content:string){const blob=new Blob([content],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
function App(){
 const initial=useMemo(getSettings,[]);
 const [game,setGame]=useState(()=>new Chess());
 const [mode,setMode]=useState<Mode>(initial.mode==='local'?'local':'ai');
 const [difficulty,setDifficulty]=useState<Difficulty>(levels[initial.difficulty as Difficulty]?initial.difficulty:'Medium');
 const [side,setSide]=useState<Color>(initial.side==='b'?'b':'w');
 const [flip,setFlip]=useState(false);
 const [selected,setSelected]=useState<Square|null>(null);
 const [promotion,setPromotion]=useState<{from:Square;to:Square}|null>(null);
 const [lastMove,setLastMove]=useState<Move|null>(null);
 const [thinking,setThinking]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [finished,setFinished]=useState<string|null>(null);
 const [review,setReview]=useState<Review[]>([]);
 const [reviewing,setReviewing]=useState(false);
 const [progress,setProgress]=useState(0);
 const [viewPly,setViewPly]=useState<number|null>(null);
 const [sound,setSound]=useState(false);
 const [hint,setHint]=useState<string|null>(null);
 const [tab,setTab]=useState<'moves'|'insights'>('moves');
 const [showHelp,setShowHelp]=useState(false);
 const pendingAnimation=useRef<{from:Square;to:Square}|null>(null);const boardRef=useRef<HTMLDivElement|null>(null);const request=useRef(0);const gameRef=useRef(game);const audioRef=useRef<AudioContext|null>(null);
 useEffect(()=>{gameRef.current=game},[game]);
 useEffect(()=>{localStorage.setItem(STORAGE,JSON.stringify({mode,difficulty,side}))},[mode,difficulty,side]);
 const history=game.history({verbose:true});
 const isOver=game.isGameOver()||finished!==null;
 const canPlay=!thinking&&!busy&&!isOver&&(mode==='local'||game.turn()===side)&&viewPly===null;
 const orientation=flip?(side==='w'?'b':'w'):side;
 const at=useMemo(()=>{if(viewPly===null)return game;const c=new Chess();for(const m of history.slice(0,viewPly))c.move(m);return c},[game,viewPly]);
 const shown=at.board();
 // Animate the destination piece from the source square using the Web Animations API.
 // This uses actual DOM square centers, so orientation and responsive sizing are respected.
 useLayoutEffect(()=>{
  const move=pendingAnimation.current;
  pendingAnimation.current=null;
  if(!move||viewPly!==null||!boardRef.current)return;
  const from=boardRef.current.querySelector<HTMLElement>(`[data-square="${move.from}"]`);
  const to=boardRef.current.querySelector<HTMLElement>(`[data-square="${move.to}"]`);
  const img=to?.querySelector<HTMLImageElement>('img.piece-art');
  if(!from||!to||!img)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const a=from.getBoundingClientRect(), b=to.getBoundingClientRect();
  img.animate([
   {transform:`translate(${a.left-b.left}px, ${a.top-b.top}px) scale(1.04)`,filter:'drop-shadow(0 8px 5px #0005)'},
   {transform:'translate(0px, 0px) scale(1)',filter:'drop-shadow(0 2px 2px #15241955)'}
  ],{duration:300,easing:'cubic-bezier(.20,.85,.25,1)',iterations:1});
 },[game,viewPly]);

 const legal=selected&&canPlay?at.moves({square:selected,verbose:true}).map(m=>m.to):[];
 const status=finished||getStatus(game);
 const alert=(msg:string)=>{setError(msg);};
 function clickTone(){if(!sound)return;try{const ctx=audioRef.current||new AudioContext();audioRef.current=ctx;const o=ctx.createOscillator();const g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(560,ctx.currentTime);g.gain.setValueAtTime(.045,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.1);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.1)}catch{}}
 const commit=useCallback((from:Square,to:Square,p='q')=>{
  const next=new Chess(gameRef.current.fen());
  // Reconstruct history for export, undo, and review.
  next.reset();for(const m of gameRef.current.history())next.move(m);
  let m:Move;try{m=next.move({from,to,promotion:p})}catch{return false}
  pendingAnimation.current={from:m.from,to:m.to};gameRef.current=next;setGame(next);setLastMove(m);setSelected(null);setHint(null);setReview([]);setViewPly(null);setError('');clickTone();return true;
 },[sound]);
 function onSquare(sq:Square){
  if(!canPlay)return;
  if(selected){const potential=at.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
   if(potential.length){if(potential.some(m=>m.isPromotion()))setPromotion({from:selected,to:sq});else commit(selected,sq);return;}}
  const piece=at.get(sq);if(piece?.color===at.turn())setSelected(sq);else setSelected(null);
 }
 function newGame(nextMode=mode,nextSide=side){request.current++;engine.reset();const fresh=new Chess();gameRef.current=fresh;setGame(fresh);setMode(nextMode);setSide(nextSide);setLastMove(null);setSelected(null);setFinished(null);setReview([]);setReviewing(false);setProgress(0);setViewPly(null);setHint(null);setThinking(false);setBusy(false);setError('');setPromotion(null);setTab('moves')}
 // A position-keyed task: UI state updates must never cancel the computer's turn.
 useEffect(()=>{
  if(mode!=='ai'||isOver||game.turn()===side||busy||viewPly!==null)return;
  const token=++request.current;
  let deadline:ReturnType<typeof setTimeout>|undefined;
  let settled=false;
  setThinking(true);
  const fen=game.fen();
  const playUci=(uci:string|null)=>{
   if(token!==request.current||settled)return;
   settled=true;
   if(uci){const didMove=commit(uci.slice(0,2) as Square,uci.slice(2,4) as Square,uci[4]||'q');if(!didMove)setError('Computer returned an invalid move. Start a new game.');}
   else setError('No legal computer move was found.');
   setThinking(false);
  };
  const fallback=(reason:string)=>{
   if(token!==request.current||settled)return;
   engine.reset();
   setError(`Stockfish could not respond (${reason}). Using the built-in computer for this move.`);
   playUci(fallbackMove(fen,difficulty));
  };
  const delay=window.setTimeout(()=>{
   if(token!==request.current)return;
   deadline=window.setTimeout(()=>fallback('timeout'),5000);
   engine.analyze(fen,levels[difficulty].depth,levels[difficulty].skill)
    .then(r=>playUci(r.best||fallbackMove(fen,difficulty)))
    .catch(e=>fallback(e instanceof Error?e.message:'unavailable'));
  },300);
  return()=>{window.clearTimeout(delay);if(deadline)window.clearTimeout(deadline);};
 },[game,mode,side,difficulty,isOver,busy,viewPly,commit]);
 function undo(){if(busy||thinking||!history.length)return;request.current++;engine.reset();const c=new Chess();for(const m of history.slice(0,Math.max(0,history.length-(mode==='ai'&&history.length>=2?2:1))))c.move(m);gameRef.current=c;setGame(c);setFinished(null);setLastMove(c.history({verbose:true}).at(-1)||null);setReview([]);setViewPly(null);setSelected(null);setHint(null);setError('')}
 async function hintMove(){if(thinking||busy||isOver)return;setBusy(true);setHint(null);try{const r=await engine.analyze(game.fen(),11);setHint(r.best?`${r.best.slice(0,2)} → ${r.best.slice(2,4)}`:'No move found')}catch(e){alert((e as Error).message)}finally{setBusy(false)}}
 async function analyze(){if(!history.length)return;setReviewing(true);setProgress(0);setReview([]);setTab('insights');setViewPly(null);setBusy(true);const id=++request.current;
  try{
   const rows:Review[]=[];const board=new Chess();let beforeResult=await engine.analyze(board.fen(),10);let before=whiteScore(beforeResult,board.turn());
   for(let i=0;i<history.length;i++){
    if(id!==request.current)break;
    const m=board.move(history[i].san);if(!m)break;
    const afterResult=board.isGameOver()?null:await engine.analyze(board.fen(),10);
    let after=afterResult?whiteScore(afterResult,board.turn()):board.isCheckmate()?(board.turn()==='w'?-10000:10000):0;
    const color=m.color;const drop=before===null||after===null?0:Math.max(0,(color==='w'?before-after:after-before));
    const isBest=moveToUci(m)===beforeResult.best;
    rows.push({san:m.san,color,grade:gradeLoss(drop,isBest),loss:Math.round(drop),best:beforeResult.best,fen:board.fen(),score:after});setReview([...rows]);setProgress(Math.round((i+1)/history.length*100));
    if(afterResult){beforeResult=afterResult;before=after}else break;
   }
  }catch(e){alert('Review stopped: '+(e as Error).message)}finally{if(id===request.current){setReviewing(false);setBusy(false)}}
 }
 const counts=useMemo(()=>{const x:Record<Grade,number>={Best:0,Excellent:0,Good:0,Inaccuracy:0,Mistake:0,Blunder:0};review.forEach(m=>x[m.grade]++);return x},[review]);
 const accuracy=useMemo(()=>{if(!review.length)return null;const per=(color:Color)=>{const moves=review.filter(m=>m.color===color);return moves.length?Math.round(moves.reduce((sum,m)=>sum+Math.exp(-m.loss/260)*100,0)/moves.length):null};return {w:per('w'),b:per('b')}},[review]);
 function startReview(i:number){setViewPly(i+1)}
 const renderedLast=viewPly===null?lastMove:history[viewPly-1]||null;
 const lastPair=Array.from({length:Math.ceil(history.length/2)},(_,i)=>({n:i+1,w:history[2*i],b:history[2*i+1]}));
 return <div className="app"><aside className="sidebar"><div className="brand"><div className="brand-icon">♞</div><div><strong>KNIGHTFALL</strong><small>CHESS, REIMAGINED</small></div></div><div className="sidebar-section">PLAY</div><button className={'nav '+(mode==='ai'?'active':'')} onClick={()=>newGame('ai',side)}><BrainCircuit size={18}/> Play Computer <span className="tag">AI</span></button><button className={'nav '+(mode==='local'?'active':'')} onClick={()=>newGame('local',side)}><Swords size={18}/> Local Multiplayer</button><div className="sidebar-section with-margin">YOUR TOOLS</div><button className="nav" onClick={hintMove} disabled={thinking||busy||isOver}><Lightbulb size={18}/> Get a hint</button><button className="nav" onClick={()=>setTab('insights')}><BarChart3 size={18}/> Game analysis</button><button className="nav" onClick={()=>setShowHelp(true)}><BookOpen size={18}/> How to play</button><div className="sidebar-bottom"><div className="sidebar-promo"><div className="glow-star"><Sparkles size={18}/></div><b>Every move matters.</b><p>Find your best moves and learn from your mistakes with Stockfish analysis.</p><button onClick={analyze} disabled={!history.length||busy||thinking}>Analyze my game <ChevronRight size={16}/></button></div><div className="footer-links"><span><Shield size={13}/> 100% free</span><span><Moon size={13}/> Local-first</span></div></div></aside>
 <main className="main"><header className="topbar"><div className="crumb">PLAYGROUND <ChevronRight size={14}/> <strong>{mode==='ai'?'VS COMPUTER':'LOCAL MATCH'}</strong></div><div className="top-right"><span className="live"><span/> ENGINE ON DEVICE</span><button className="icon-btn" title="Toggle sound" onClick={()=>setSound(!sound)}>{sound?<Volume2 size={18}/>:<VolumeX size={18}/>}</button><button className="icon-btn" title="Help" onClick={()=>setShowHelp(true)}><CircleHelp size={18}/></button><div className="avatar">K</div></div></header>
 <div className="content"><div className="heading-row"><div><div className="eyebrow"><span className="eyebrow-line"/> THE ARENA</div><h1>Make your <em>move.</em></h1><p className="subtitle">A beautiful game of strategy. An even better way to improve.</p></div><button className="new-button" onClick={()=>newGame()}><Play size={15} fill="currentColor"/> New game</button></div>
 <div className="game-layout"><section className="play-panel"><div className="player-info"><div className="player-identity"><div className="player-avatar opponent">{mode==='ai'?<BrainCircuit size={22}/>:<span>♚</span>}</div><div><b>{mode==='ai'?'Stockfish AI':orientation==='w'?'Player 2 · Black':'Player 1 · White'}</b><span>{mode==='ai'?`${difficulty} difficulty`:'Local multiplayer'}</span></div></div><div className="rating"><span className={thinking?'pulse':''}/>{thinking?'Thinking...':isOver?'Game ended':'Ready'}</div></div>
 <div className="board-shell"><div className="board" ref={boardRef} role="grid" aria-label="Chess board">{Array.from({length:64},(_,i)=>{const row=Math.floor(i/8),col=i%8;const file=orientation==='w'?col:7-col;const rank=orientation==='w'?7-row:row;const sq=(`${'abcdefgh'[file]}${rank+1}`) as Square;const piece=shown[7-rank][file];const light=(row+col)%2===0;const selectedHere=selected===sq;const possible=legal.includes(sq);const previous=renderedLast?.from===sq||renderedLast?.to===sq;const check=piece?.type==='k'&&piece.color===at.turn()&&at.isCheck();return <button key={sq} data-square={sq} role="gridcell" className={`square ${light?'light':'dark'} ${selectedHere?'selected':''} ${previous?'last':''} ${check?'check':''}`} style={{left:`${col*12.5}%`,top:`${row*12.5}%`}} onClick={()=>onSquare(sq)} aria-label={`${sq} ${piece?piece.color==='w'?'white':'black':'empty'} ${piece?.type||''}`}>
 {col===0&&<span className="rank-coordinate">{rank+1}</span>}{row===7&&<span className="file-coordinate">{'abcdefgh'[file]}</span>}{possible&&<span className={piece?'possible capture':'possible'}/>}{piece&&<img draggable={false} className="piece piece-art" src={`/pieces/${piece.color}${piece.type}.png`} alt={`${piece.color==='w'?'White':'Black'} ${piece.type}`} />}</button>})}</div>{viewPly!==null&&<div className="review-flag">REVIEWING MOVE {viewPly} / {history.length}<button onClick={()=>setViewPly(null)}>Back to game <X size={13}/></button></div>}</div>
 <div className="player-info below"><div className="player-identity"><div className="player-avatar you"><span>♔</span></div><div><b>{mode==='ai'?'You':orientation==='w'?'Player 1 · White':'Player 2 · Black'}</b><span>{mode==='ai'?(side==='w'?'Playing as White':'Playing as Black'):'Pass-and-play on this device'}</span></div></div><div className="status-chip">{status}</div></div>
 <div className="board-actions"><button onClick={undo} disabled={!history.length||busy||thinking}><Undo2 size={17}/> Undo</button><button onClick={()=>{setFlip(!flip);setSelected(null)}}><ArrowLeftRight size={17}/> Flip board</button><button onClick={()=>exportText('knightfall-game.pgn',game.pgn())} disabled={!history.length}><ArrowDownToLine size={17}/> Export PGN</button><button onClick={()=>{if(!isOver){setFinished(`${game.turn()==='w'?'Black':'White'} wins by resignation`);setSelected(null)}}} disabled={isOver}><Flag size={17}/> Resign</button></div></section>
 <section className="control-panel"><div className="panel-top"><div><span className="panel-kicker">GAME CONTROL</span><h2>Your match</h2></div><Settings2 size={19}/></div><div className="mode-label">GAME MODE</div><div className="mode-switch"><button className={mode==='ai'?'chosen':''} onClick={()=>newGame('ai',side)}><BrainCircuit size={17}/> vs. Computer</button><button className={mode==='local'?'chosen':''} onClick={()=>newGame('local',side)}><Swords size={17}/> 2 Players</button></div>
 {mode==='ai'&&<><div className="mode-label margin-top">AI DIFFICULTY</div><div className="difficulty-grid">{(Object.keys(levels) as Difficulty[]).map((lvl)=><button key={lvl} className={lvl===difficulty?'on':''} onClick={()=>{setDifficulty(lvl);newGame('ai',side)}}><span className="diff-mark">{lvl==='Easy'?'●':lvl==='Medium'?'◆':lvl==='Hard'?'✦':'♛'}</span><b>{lvl}</b></button>)}</div><p className="difficulty-caption"><Activity size={14}/>{levels[difficulty].description}</p><div className="mode-label margin-top">YOUR PIECES</div><div className="side-select"><button className={side==='w'?'chosen':''} onClick={()=>newGame(mode,'w')}><span className="mini-piece white">♔</span> White</button><button className={side==='b'?'chosen':''} onClick={()=>newGame(mode,'b')}><span className="mini-piece black">♚</span> Black</button></div></>}
 <div className="panel-divider"/><div className="tabs"><button className={tab==='moves'?'current':''} onClick={()=>setTab('moves')}><Clock3 size={16}/> Moves</button><button className={tab==='insights'?'current':''} onClick={()=>setTab('insights')}><BarChart3 size={16}/> Analysis</button></div>
 {tab==='moves'?<><div className="moves-area">{!history.length?<div className="empty"><span className="empty-icon">♞</span><b>Your story starts here</b><span>Make the first move to start your game.</span></div>:<div className="move-table">{lastPair.map(p=><div className="move-row" key={p.n}><span className="move-n">{p.n}.</span><button className={viewPly===2*p.n-1?'current-move':''} onClick={()=>setViewPly(2*p.n-1)}>{p.w.san}</button>{p.b?<button className={viewPly===2*p.n?'current-move':''} onClick={()=>setViewPly(2*p.n)}>{p.b.san}</button>:<span>—</span>}</div>)}</div>}</div>{viewPly!==null&&<div className="replay-nav"><button onClick={()=>setViewPly(Math.max(0,viewPly-1))}><ChevronLeft size={17}/></button><span>Move {viewPly} of {history.length}</span><button onClick={()=>setViewPly(viewPly>=history.length?null:viewPly+1)}><ChevronRight size={17}/></button></div>}<div className="bottom-action"><button className="analyze-btn" disabled={!history.length||busy||thinking} onClick={analyze}><Sparkles size={17}/>{reviewing?`Analyzing ${progress}%`:'Analyze game'}<ChevronRight size={16}/></button></div></>:<div className="insights-area">{review.length?<><div className="accuracy-title"><Target size={18}/> Estimated accuracy</div><div className="accuracy-cards"><div><span>WHITE</span><strong>{accuracy?.w??'—'}{accuracy?.w!==null?'%':''}</strong></div><div><span>BLACK</span><strong>{accuracy?.b??'—'}{accuracy?.b!==null?'%':''}</strong></div></div><div className="grade-head">MOVE QUALITY</div><div className="grade-grid">{(Object.keys(grades) as Grade[]).map(g=><div key={g}><i className={grades[g]}/><span>{g}</span><b>{counts[g]}</b></div>)}</div><div className="review-moves">{review.map((r,i)=><button key={i} onClick={()=>startReview(i)}><span>{Math.floor(i/2)+1}{i%2?'...':'.'} {r.san}</span><b className={'grade '+grades[r.grade]}>{r.grade}</b></button>)}</div><p className="analysis-note">Engine-based approximate centipawn-loss categories at depth 10. Accuracy is an original estimate, not Chess.com accuracy.</p></>:reviewing?<div className="analysis-loading"><LoaderCircle className="spin" size={30}/><b>Reviewing your game</b><p>Checking each move with Stockfish...</p><div className="progress"><span style={{width:`${progress}%`}}/></div><span>{progress}% complete</span></div>:<div className="empty analysis-empty"><BarChart3 size={35}/><b>Learn from every move</b><span>Play a few moves, then run a free engine review.</span><button onClick={analyze} disabled={!history.length||busy||thinking}><Sparkles size={15}/> Start analysis</button></div>}</div>}
 </section></div><div className="below-row"><div><Trophy size={17}/><span>Built for the love of the game.</span></div><span>POWERED BY <b>STOCKFISH</b> & CHESS.JS</span></div></div></main>
 {error&&<div className="toast" role="alert"><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>}
 {hint&&<div className="toast hint"><Lightbulb size={17}/><span>Suggested move: <b>{hint}</b></span><button onClick={()=>setHint(null)}><X size={16}/></button></div>}
 {promotion&&<div className="overlay"><div className="modal"><h2>Choose promotion</h2><p>Select the piece your pawn becomes.</p><div className="promotions">{(['q','r','b','n'] as const).map(p=><button key={p} onClick={()=>{commit(promotion.from,promotion.to,p);setPromotion(null)}}>{glyph[at.turn()+p]}</button>)}</div><button className="modal-close" onClick={()=>setPromotion(null)}>Cancel</button></div></div>}
 {showHelp&&<div className="overlay" onClick={()=>setShowHelp(false)}><div className="modal help" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowHelp(false)}><X size={19}/></button><div className="help-icon"><Medal size={24}/></div><h2>Welcome to Knightfall</h2><p>Click one of your pieces to see its legal moves. Click a highlighted square to move. All chess rules, including castling, en passant, checkmate, and promotion, are enforced.</p><p>Play a friend locally or challenge the Stockfish computer. Use <b>Analyze game</b> to review each completed move and identify mistakes. You can export any match as a PGN file.</p><p>All chess calculation happens on your device. No account, server, or payment needed.</p><button className="got-it" onClick={()=>setShowHelp(false)}>Let's play <Check size={16}/></button></div></div>}
 </div>
}
export default App;
