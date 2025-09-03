"use strict";

/* CDN (cached by SW after first success) */
const CDN = {
  chess: [
    "https://cdn.jsdelivr.net/npm/chess.js@1.0.0/dist/chess.min.js",
    "https://unpkg.com/chess.js@1.0.0/dist/chess.min.js"
  ],
  stockfish: [
    "https://cdn.jsdelivr.net/npm/stockfish@16.1.0/src/stockfish.js",
    "https://unpkg.com/stockfish@16.1.0/src/stockfish.js"
  ]
};

/* UI refs */
const ui = {
  boardEl: document.getElementById("board"),
  filesEl: document.getElementById("files"),
  ranksEl: document.getElementById("ranks"),
  moveList: document.getElementById("moveList"),
  evalGraph: document.getElementById("evalGraph"),
  evalFill: document.getElementById("evalFill"),
  pvBox: document.getElementById("pvBox"),
  engineStatus: document.getElementById("engineStatus"),
  statusBar: document.getElementById("statusBar"),
  topPlayerLabel: document.getElementById("topPlayerLabel"),
  bottomPlayerLabel: document.getElementById("bottomPlayerLabel"),
  overlay: document.getElementById("overlay"),
  openingName: document.getElementById("openingName")
};
const c = {
  mode: document.getElementById("mode"),
  difficulty: document.getElementById("difficulty"),
  whoStarts: document.getElementById("whoStarts"),
  yourSide: document.getElementById("yourSide"),
  moveTimer: document.getElementById("moveTimer"),
  boardTheme: document.getElementById("boardTheme"),
  newGame: document.getElementById("newGame"),
  undoBtn: document.getElementById("undoBtn"),
  flipBtn: document.getElementById("flipBtn"),
  fsBtn: document.getElementById("fsBtn"),
  prevMove: document.getElementById("prevMove"),
  nextMove: document.getElementById("nextMove"),
  analyzeToggle: document.getElementById("analyzeToggle"),
  annotateGame: document.getElementById("annotateGame"),
  depthRange: document.getElementById("depthRange"),
  multiPV: document.getElementById("multiPV"),
  copyFEN: document.getElementById("copyFEN"),
  pasteFEN: document.getElementById("pasteFEN"),
  exportPGN: document.getElementById("exportPGN"),
  importPGN: document.getElementById("importPGN"),
  pgnBox: document.getElementById("pgnBox"),
  startEditor: document.getElementById("startEditor"),
  exitEditor: document.getElementById("exitEditor"),
  showCoords: document.getElementById("showCoords"),
  showLegal: document.getElementById("showLegal"),
  showLast: document.getElementById("showLast"),
  useUnicode: document.getElementById("useUnicode"),
  themeToggle: document.getElementById("themeToggle"),
  soundToggle: document.getElementById("soundToggle"),
  hintBtn: document.getElementById("hintBtn"),
  clearHint: document.getElementById("clearHint")
};

/* State */
let chess;                 // chess.js instance (when available)
let RULES_READY = false;   // protection for first‑run offline
let gameOver = false, isReplaying = false;
let tInterval = null;      // per-move timer
let S = {
  orientation: "white",
  selected: null,
  lastFrom: null,
  lastTo: null,
  mode: "ai",
  analyzing: false,
  engineReady: false,
  evalHistory: [],
  editor: false,
  sounds: true
};
const UNI = { p:"♟", r:"♜", n:"♞", b:"♝", q:"♛", k:"♚", P:"♙", R:"♖", N:"♘", B:"♗", Q:"♕", K:"♔" };

/* Start-position fallback (when chess.js not yet loaded) */
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const START_MAP = fenToMap(START_FEN);
function fenToMap(fen){
  const map = {};
  const board = fen.split(" ")[0].split("/");
  for (let r=0; r<8; r++){
    let file = 0;
    for (const ch of board[r]){
      if (/\d/.test(ch)) file += Number(ch);
      else {
        const sq = "abcdefgh"[file] + (8 - r);
        map[sq] = ch;
        file++;
      }
    }
  }
  return map;
}
function fallbackGet(sq){
  const p = START_MAP[sq]; if (!p) return null;
  return { type: p.toLowerCase(), color: (p===p.toUpperCase()?"w":"b") };
}

/* Helpers */
function setStatus(t){ ui.statusBar.textContent = t; }
function applyTheme(){
  const cur = document.documentElement.getAttribute("data-theme") || "auto";
  const next = (cur==="auto") ? (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark") : (cur==="dark"?"light":"dark");
  document.documentElement.setAttribute("data-theme", next);
  c.themeToggle.textContent = next==="dark" ? "☀️" : "🌙";
}
function applyThemeFromPref(){
  const pref = localStorage.getItem("ch-theme") || "auto";
  document.documentElement.setAttribute("data-theme", pref);
  c.themeToggle.textContent = (pref==="dark") ? "☀️" : "🌙";
}
function setBoardTheme(name){ document.documentElement.setAttribute("data-board", name); }

/* Render 8x8 board every time (squares always visible) */
function renderBoard(){
  ui.boardEl.innerHTML = "";
  ui.filesEl.innerHTML = "";
  ui.ranksEl.innerHTML = "";

  const files = S.orientation==="white" ? "a b c d e f g h".split(" ") : "h g f e d c b a".split(" ");
  const ranks = S.orientation==="white" ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];

  if (c.showCoords.checked){
    ui.filesEl.style.display="flex"; ui.ranksEl.style.display="flex";
    ui.filesEl.innerHTML = files.map(f=>`<span>${f}</span>`).join("");
    ui.ranksEl.innerHTML = ranks.map(r=>`<span>${r}</span>`).join("");
  } else { ui.filesEl.style.display="none"; ui.ranksEl.style.display="none"; }

  for (let row=0; row<8; row++){
    for (let col=0; col<8; col++){
      const light = (row+col)%2===0;
      const sqName = S.orientation==="white" ? "abcdefgh"[col] + (8-row)
                                             : "abcdefgh"[7-col] + (row+1);

      const sq = document.createElement("div");
      sq.className = `square ${light ? "a" : "b"}`;
      sq.dataset.square = sqName;

      if (c.showLast.checked && (sqName===S.lastFrom || sqName===S.lastTo)) sq.classList.add("last");

      // Draw piece (from chess rules if ready, otherwise fallback from start FEN)
      const pieceObj = RULES_READY ? chess.get(sqName) : fallbackGet(sqName);
      if (pieceObj){
        const pEl = document.createElement("div");
        pEl.className = "piece";
        const code = pieceObj.color==='w' ? pieceObj.type.toUpperCase() : pieceObj.type;
        pEl.textContent = UNI[code];
        sq.appendChild(pEl);
      }

      // Click only if rules ready
      if (RULES_READY) sq.addEventListener("pointerdown", onPointerDown);
      ui.boardEl.appendChild(sq);
    }
  }
  setPlayerLabels();
  // Keep overlay aligned with current PV
  requestAnimationFrame(drawSavedPVArrow);
}

function setPlayerLabels(){
  if (S.orientation==="white"){ ui.bottomPlayerLabel.textContent="White"; ui.topPlayerLabel.textContent="Black"; }
  else { ui.bottomPlayerLabel.textContent="Black"; ui.topPlayerLabel.textContent="White"; }
}

/* Interaction (guarded by RULES_READY) */
async function onPointerDown(e){
  if (!RULES_READY) return;
  if (S.editor) return editorPointerDown(e);
  if (gameOver || isReplaying) return;
  const sq = e.currentTarget.dataset.square;
  const piece = chess.get(sq);
  const turnColor = chess.turn()==='w'?'white':'black';
  if (S.mode==="ai"){
    const you = c.yourSide.value;
    if ((you==="white" && turnColor!=="white") || (you==="black" && turnColor!=="black")) return;
  }
  if (!S.selected){
    if (piece && ((piece.color==='w' && chess.turn()==='w') || (piece.color==='b' && chess.turn()==='b'))){
      S.selected = sq; highlightLegal(sq);
    }
  } else {
    if (sq===S.selected){ S.selected=null; renderBoard(); return; }
    tryMove(S.selected, sq);
  }
}

function highlightLegal(from){
  renderBoard();
  if (!c.showLegal.checked) return;
  const moves = chess.moves({ square: from, verbose: true });
  for (const m of moves){
    const el = ui.boardEl.querySelector(`[data-square="${m.to}"]`);
    if (!el) continue; const dot=document.createElement("div");
    dot.className="dot"; el.appendChild(dot);
  }
  ui.boardEl.querySelector(`[data-square="${from}"]`)?.classList.add("highlight");
}

async function tryMove(from, to){
  const legal = chess.moves({ square: from, verbose: true }).find(m=>m.to===to);
  if (!legal){
    const p2 = chess.get(to);
    if (p2 && ((p2.color==='w' && chess.turn()==='w') || (p2.color==='b' && chess.turn()==='b'))){
      S.selected=to; highlightLegal(to); return;
    }
    S.selected=null; renderBoard(); return;
  }
  let promo="q";
  if (legal.flags.includes("p")) promo = await askPromotion();
  const move = chess.move({ from, to, promotion: promo });
  if (!move) return;
  if (S.sounds) beep(660,70,"triangle",0.03);
  S.selected=null; S.lastFrom=from; S.lastTo=to;
  moveApplied(move);
}

function askPromotion(){
  const dlg=document.getElementById("promoDialog");
  if (!HTMLDialogElement.prototype.showModal) return "q";
  return new Promise(res=>{
    dlg.addEventListener("close", ()=> res(dlg.returnValue || "q"), { once:true });
    dlg.showModal();
  });
}

function addMoveToList(move){
  const idx=chess.history().length; const ply=Math.ceil(idx/2);
  const li=document.createElement("li"); li.textContent=`${ply}. ${move.san}`;
  ui.moveList.appendChild(li); ui.moveList.scrollTop = ui.moveList.scrollHeight;
}

/* Overlay arrows (best move / last move) */
function clearOverlay(){
  const rect=ui.boardEl.getBoundingClientRect();
  ui.overlay.width = rect.width; ui.overlay.height = rect.height;
  ui.overlay.getContext("2d").clearRect(0,0,ui.overlay.width, ui.overlay.height);
}
function squareCenterPx(sq){
  const rect=ui.boardEl.getBoundingClientRect();
  const file="abcdefgh".indexOf(sq[0]); const rank=Number(sq[1])-1;
  const col=(S.orientation==="white")?file:7-file;
  const row=(S.orientation==="white")?7-rank:rank;
  const cw=rect.width/8, ch=rect.height/8;
  return { x:(col+0.5)*cw, y:(row+0.5)*ch };
}
function drawArrow(from,to,color="#5b8dff"){
  const ctx=ui.overlay.getContext("2d");
  const A=squareCenterPx(from), B=squareCenterPx(to);
  const dx=B.x-A.x, dy=B.y-A.y, len=Math.hypot(dx,dy); if (len<4) return;
  const nx=dx/len, ny=dy/len, head=14, wing=6;
  ctx.save(); ctx.globalAlpha=.95; ctx.lineWidth=8; ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.strokeStyle=color; ctx.fillStyle=color;
  ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x - nx*head, B.y - ny*head); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(B.x,B.y);
  ctx.lineTo(B.x - nx*head - ny*wing, B.y - ny*head + nx*wing);
  ctx.lineTo(B.x - nx*head + ny*wing, B.y - ny*head - nx*wing);
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawArrowSquares(from,to,color){ clearOverlay(); drawArrow(from,to,color); }
function drawSavedPVArrow(){
  const pv = (ui.pvBox.textContent||"").trim().split(/\s+/)[0];
  if (pv && pv.length>=4){ clearOverlay(); if (S.lastFrom&&S.lastTo) drawArrow(S.lastFrom,S.lastTo,"#10b981"); drawArrow(pv.slice(0,2), pv.slice(2,4), "#f59e0b"); }
}

/* Game flow */
function updateEvalBar(cp, mate){
  let score=.5; if (mate!==undefined) score=mate>0?1:0;
  else if (cp!==undefined){ const clamp=Math.max(-300, Math.min(300, cp)); score=(clamp+300)/600; }
  ui.evalFill.style.height = `${Math.round(score*100)}%`;
}
function pushEvalHistory(ply, cp, mate){
  const last=S.evalHistory[S.evalHistory.length-1];
  if (!last || last.ply!==ply) S.evalHistory.push({ply,cp,mate});
  else S.evalHistory[S.evalHistory.length-1]={ply,cp,mate};
  drawEvalGraph(); updateEvalBar(cp, mate);
}
function drawEvalGraph(){
  const ctx=ui.evalGraph.getContext("2d"); const W=ui.evalGraph.width, H=ui.evalGraph.height;
  ctx.clearRect(0,0,W,H); if(!S.evalHistory.length) return;
  const maxCP=300; ctx.beginPath(); ctx.strokeStyle="#5b8dff"; ctx.lineWidth=2;
  for(let i=0;i<S.evalHistory.length;i++){
    const e=S.evalHistory[i]; const val=(e.mate!==undefined)?(e.mate>0?maxCP:-maxCP):Math.max(-maxCP,Math.min(maxCP,e.cp||0));
    const x=(i/(S.evalHistory.length-1||1))*(W-8)+4; const y=H/2-(val/maxCP)*(H/2-4);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  } ctx.stroke();
}
function updateGameStatus(){
  if (!RULES_READY){ setStatus("Offline first run: board ready. Connect once to enable rules & engine."); return; }
  if (chess.isCheckmate()){ gameOver=true; setStatus("Checkmate"); openResultModal("Checkmate",`${chess.turn()==='w'?"Black":"White"} wins`); return; }
  if (chess.isDraw()){ gameOver=true; setStatus("Draw"); openResultModal("Draw","Stalemate/50-move/3-fold"); return; }
  const turn=chess.turn()==='w'?"White":"Black"; setStatus(`${turn} to move`);
}
function openResultModal(title,sub){ const dlg=document.getElementById("modalOverlay"); document.getElementById("modalTitle").textContent=title; document.getElementById("modalSubtitle").textContent=sub||""; dlg.classList.add("open"); dlg.setAttribute("aria-hidden","false"); }
function closeResultModal(){ const dlg=document.getElementById("modalOverlay"); dlg.classList.remove("open"); dlg.setAttribute("aria-hidden","true"); }

async function moveApplied(move){
  addMoveToList(move); renderBoard(); updateGameStatus();
  clearOverlay(); if (S.lastFrom&&S.lastTo) drawArrow(S.lastFrom,S.lastTo,"#10b981");
  if (S.mode==="ai" && !gameOver){
    const you=c.yourSide.value;
    if ((you==="white" && chess.turn()==='b') || (you==="black" && chess.turn()==='w')) await aiMove(c.difficulty.value);
  }
  if (S.analyzing && S.engineReady) engineAnalyzePosition();
}

/* AI (heuristic + engine when ready) */
function randomMove(b){ const v=b.moves({verbose:true}); return v[Math.floor(Math.random()*v.length)]; }
function mvVal(m){ const v={p:1,n:3,b:3.1,r:5,q:9}; return (m.captured? v[m.captured?.toLowerCase()]||0:0)+(["d4","e4","d5","e5"].includes(m.to)?0.2:0); }
async function aiMove(level){
  if (!RULES_READY) return;
  if (level==="engine" && S.engineReady){
    const best=await engineBestMove(chess.fen()); if (best?.bestmove){ applyAIMove(best.bestmove); return; }
  }
  const list=chess.moves({verbose:true}); if (!list.length) return;
  let chosen;
  if (level==="easy") chosen=randomMove(chess);
  else if (level==="medium") chosen=list.slice().sort((a,b)=>mvVal(b)-mvVal(a))[0];
  else { let best=-1e9, pick=list[0]; for (const m of list){ chess.move(m); const opp=chess.moves({verbose:true}); let reply=0; for (const r of opp) reply=Math.max(reply,mvVal(r)); chess.undo(); const sc=mvVal(m)-reply*0.6; if (sc>best){ best=sc; pick=m; } } chosen=pick; }
  chess.move({from:chosen.from,to:chosen.to,promotion:"q"}); S.lastFrom=chosen.from; S.lastTo=chosen.to;
  renderBoard(); updateGameStatus(); if (S.analyzing && S.engineReady) engineAnalyzePosition();
}
function applyAIMove(uci){ const from=uci.slice(0,2), to=uci.slice(2,4), promo=uci[4]; const m=chess.move({from,to,promotion:promo||"q"}); if(!m) return; S.lastFrom=from; S.lastTo=to; addMoveToList(m); renderBoard(); updateGameStatus(); }

/* Hint & Clear */
c.hintBtn.addEventListener("click", async ()=>{
  if (!RULES_READY){ setStatus("Connect once to enable hints (engine)."); return; }
  let uci=null; if (S.engineReady){ const best=await engineBestMove(chess.fen()); uci=best?.bestmove||null; }
  if (!uci){ const v=chess.moves({verbose:true}); if(!v.length) return; const pick=v.slice().sort((a,b)=>mvVal(b)-mvVal(a))[0]; uci=pick.from+pick.to; }
  clearOverlay(); drawArrow(uci.slice(0,2), uci.slice(2,4), "#8ab4ff");
});
c.clearHint.addEventListener("click", ()=>{ clearOverlay(); drawSavedPVArrow(); });

/* Engine worker */
let engineW=null;
function initEngine(){
  engineW=new Worker("engine-worker.js");
  engineW.onmessage=(e)=>{
    const m=e.data;
    if (m.type==="ready"){ S.engineReady=true; ui.engineStatus.textContent="Engine: ready"; if (S.analyzing && RULES_READY) engineAnalyzePosition(); }
    else if (m.type==="info"){
      ui.engineStatus.textContent = `depth ${m.depth ?? "?"} eval ${m.scoreText ?? ""}`;
      ui.pvBox.textContent = m.pv || "";
      const ply = RULES_READY ? chess.history().length : 0;
      pushEvalHistory(ply, m.cp, m.mate);
      const uci=(m.pv||"").split(/\s+/)[0];
      requestAnimationFrame(()=>{ clearOverlay(); if (S.lastFrom&&S.lastTo) drawArrow(S.lastFrom,S.lastTo,"#10b981"); if (uci?.length>=4) drawArrow(uci.slice(0,2), uci.slice(2,4), "#f59e0b"); });
    } else if (m.type==="error"){ ui.engineStatus.textContent=m.message||"Engine error"; }
  };
  engineW.postMessage({ cmd:"init", cdn: CDN.stockfish });
}
function engineAnalyzePosition(){ if (!S.engineReady || !RULES_READY) return; engineW.postMessage({ cmd:"analyze", fen: chess.fen(), depth: Number(c.depthRange.value), multipv: Math.max(1, Math.min(4, Number(c.multiPV.value))) }); }
function engineBestMove(fen){ return new Promise(res=>{ const on=(e)=>{ const m=e.data; if(m.type==="bestmove"){ engineW.removeEventListener("message", on); res(m); } }; engineW.addEventListener("message", on); engineW.postMessage({ cmd:"bestmove", fen, depth: Number(c.depthRange.value), movetime:1200 }); }); }

/* New game & startup */
function getStarter(){
  const who=c.whoStarts.value;
  if (who==="random") return Math.random()<0.5?"white":"black";
  if (who==="alternate"){ const prev=localStorage.getItem("ch-alt")||"white"; const next=(prev==="white"?"black":"white"); localStorage.setItem("ch-alt", next); return next; }
  return who;
}
function newGame(){
  if (!RULES_READY){
    S.orientation = (c.yourSide.value==="white") ? "white" : "black";
    renderBoard(); setStatus("Board ready. Connect once to enable rules & engine.");
    return;
  }
  chess = new Chess();
  gameOver=false; S.lastFrom=S.lastTo=null; S.mode=c.mode.value; renderBoard();
  S.orientation = (S.mode==="ai" ? (c.yourSide.value==="white"?"white":"black") : S.orientation);
  renderBoard();
  const starter=getStarter();
  setStatus(`${starter==="white"?"White":"Black"} to move`);
  if (S.mode==="ai"){
    const you=c.yourSide.value;
    if ((you==="white" && starter==="black") || (you==="black" && starter==="white")){
      setTimeout(()=> aiMove(c.difficulty.value), 300);
    }
  }
}

/* Load chess.js safely (no crash if offline) */
async function loadChessLib(){
  if (window.Chess){ RULES_READY=true; return; }
  for (const url of CDN.chess){
    try{
      await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=url; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
      if (window.Chess){ RULES_READY=true; return; }
    }catch{}
  }
  RULES_READY=false; // We will run in fallback mode
}

/* Misc / controls */
function openResultModal(){ /* wired in HTML; no-op here */ }
function closeResultModal(){ const dlg=document.getElementById("modalOverlay"); dlg.classList.remove("open"); dlg.setAttribute("aria-hidden","true"); }

c.themeToggle.addEventListener("click", applyTheme);
c.soundToggle.addEventListener("change", ()=> S.sounds=c.soundToggle.checked);
c.boardTheme.addEventListener("change", ()=> setBoardTheme(c.boardTheme.value));
c.newGame.addEventListener("click", ()=> newGame());
c.undoBtn.addEventListener("click", ()=> { if(!RULES_READY) return; if(!chess.history().length) return; chess.undo(); S.lastFrom=S.lastTo=null; renderBoard(); setStatus("Move undone"); clearOverlay(); if (S.analyzing && S.engineReady) engineAnalyzePosition(); });
c.flipBtn.addEventListener("click", ()=>{ S.orientation=(S.orientation==="white"?"black":"white"); renderBoard(); });
c.fsBtn.addEventListener("click", ()=>{ document.querySelector(".page")?.classList.toggle("full"); setTimeout(()=> drawSavedPVArrow(), 150); });

/* Resize/orientation re-render */
window.addEventListener("resize", debounce(()=> renderBoard(), 120));
window.addEventListener("orientationchange", ()=> setTimeout(()=> renderBoard(), 200));
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

/* Sounds */
let audioCtx=null;
["click","touchstart","keydown"].forEach(evt => window.addEventListener(evt, ()=> ensureAudio(), { once:true, passive:true }));
function ensureAudio(){ if (!S.sounds) return null; if (!audioCtx){ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null; audioCtx=new AC(); } if (audioCtx.state==="suspended") audioCtx.resume().catch(()=>{}); return audioCtx; }
function beep(freq=440,dur=80,type="sine",vol=0.04){ if(!S.sounds) return; const ctx=ensureAudio(); if(!ctx) return; const o=ctx.createOscillator(), g=ctx.createGain(); o.type=type; o.frequency.value=freq; g.gain.value=vol; o.connect(g).connect(ctx.destination); const t=ctx.currentTime; o.start(t); o.stop(t+dur/1000); }

/* Init */
applyThemeFromPref(); setBoardTheme(c.boardTheme.value);
(async ()=>{
  await loadChessLib();          // Never crashes if offline
  initEngine();                  // Engine upgrades when it can
  if (RULES_READY) chess = new Chess();
  renderBoard();                 // Always draws squares (and starting pieces via fallback)
  newGame();                     // Plays if rules ready, else shows board + message
  setStatus(RULES_READY ? "Ready" : "Ready (fallback — connect once to enable play)");
})();

/* SW */
if ("serviceWorker" in navigator){
  window.addEventListener("load", ()=> navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
}
