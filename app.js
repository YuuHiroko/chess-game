"use strict";

/* CDN endpoints cached by the service worker after first success */
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

/* UI */
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
  topClock: document.getElementById("topClock"),
  bottomClock: document.getElementById("bottomClock"),
  topPlayerLabel: document.getElementById("topPlayerLabel"),
  bottomPlayerLabel: document.getElementById("bottomPlayerLabel"),
  promoDialog: document.getElementById("promoDialog"),
  openingName: document.getElementById("openingName"),
  overlay: document.getElementById("overlay"),
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
let chess; // from chess.js
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
  } else {
    ui.filesEl.style.display="none"; ui.ranksEl.style.display="none";
  }

  // Build 8x8 grid cells (always visible regardless of engine)
  for (let row=0; row<8; row++){
    for (let col=0; col<8; col++){
      const light = (row+col)%2===0;
      const sqName = S.orientation==="white"
        ? "abcdefgh"[col] + (8-row)
        : "abcdefgh"[7-col] + (row+1);

      const sq = document.createElement("div");
      sq.className = `square ${light ? "a" : "b"}`;
      sq.dataset.square = sqName;

      if (c.showLast.checked && (sqName===S.lastFrom || sqName===S.lastTo)) sq.classList.add("last");

      const piece = chess?.get?.(sqName);
      if (piece){
        const pEl = document.createElement("div");
        pEl.className = "piece";
        pEl.textContent = UNI[piece.color==='w' ? piece.type.toUpperCase() : piece.type];
        sq.appendChild(pEl);
      }

      sq.addEventListener("pointerdown", onPointerDown);
      ui.boardEl.appendChild(sq);
    }
  }
  setPlayerLabels();
  // Keep overlay aligned
  requestAnimationFrame(drawSavedPVArrow);
}

function setPlayerLabels(){
  if (S.orientation==="white"){ ui.bottomPlayerLabel.textContent="White"; ui.topPlayerLabel.textContent="Black"; }
  else { ui.bottomPlayerLabel.textContent="Black"; ui.topPlayerLabel.textContent="White"; }
}

function highlightLegal(from){
  renderBoard();
  if (!c.showLegal.checked) return;
  const moves = chess.moves({ square: from, verbose: true });
  for (const m of moves){
    const el = ui.boardEl.querySelector(`[data-square="${m.to}"]`);
    if (!el) continue;
    const dot = document.createElement("div");
    dot.className = "dot";
    el.appendChild(dot);
  }
  ui.boardEl.querySelector(`[data-square="${from}"]`)?.classList.add("highlight");
}

async function onPointerDown(e){
  if (S.editor) return editorPointerDown(e);
  if (!chess || gameOver || isReplaying) return;

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

async function tryMove(from, to){
  const legal = chess.moves({ square: from, verbose: true }).find(m => m.to===to);
  if (!legal){
    const p2 = chess.get(to);
    if (p2 && ((p2.color==='w' && chess.turn()==='w') || (p2.color==='b' && chess.turn()==='b'))){
      S.selected = to; highlightLegal(to); return;
    }
    S.selected=null; renderBoard(); return;
  }

  let promo = "q";
  if (legal.flags.includes("p")) promo = await askPromotion();

  const move = chess.move({ from, to, promotion: promo });
  if (!move) return;

  if (S.sounds) beep(660,70,"triangle",0.03);
  S.selected=null; S.lastFrom=from; S.lastTo=to;
  moveApplied(move);
}

function askPromotion(){
  if (!HTMLDialogElement.prototype.showModal) return "q";
  return new Promise(res=>{
    ui.promoDialog.addEventListener("close", ()=> res(ui.promoDialog.returnValue || "q"), { once:true });
    ui.promoDialog.showModal();
  });
}

function addMoveToList(move){
  const idx = chess.history().length;
  const ply = Math.ceil(idx/2);
  const li = document.createElement("li");
  li.textContent = `${ply}. ${move.san}`;
  ui.moveList.appendChild(li);
  ui.moveList.scrollTop = ui.moveList.scrollHeight;
}

function updateEvalBar(cp, mate){
  let score=0.5;
  if (mate!==undefined) score = mate>0 ? 1 : 0;
  else if (cp!==undefined){ const clamp=Math.max(-300, Math.min(300, cp)); score=(clamp+300)/600; }
  ui.evalFill.style.height = `${Math.round(score*100)}%`;
}

function pushEvalHistory(ply, cp, mate){
  const last = S.evalHistory[S.evalHistory.length-1];
  if (!last || last.ply !== ply) S.evalHistory.push({ ply, cp, mate });
  else S.evalHistory[S.evalHistory.length-1] = { ply, cp, mate };
  drawEvalGraph(); updateEvalBar(cp, mate);
}

function drawEvalGraph(){
  const ctx = ui.evalGraph.getContext("2d");
  const W=ui.evalGraph.width, H=ui.evalGraph.height;
  ctx.clearRect(0,0,W,H);
  if (!S.evalHistory.length) return;
  const maxCP=300;
  ctx.beginPath(); ctx.strokeStyle="#5b8dff"; ctx.lineWidth=2;
  for (let i=0;i<S.evalHistory.length;i++){
    const e=S.evalHistory[i];
    const val=(e.mate!==undefined)?(e.mate>0?maxCP:-maxCP):Math.max(-maxCP, Math.min(maxCP, e.cp||0));
    const x=(i/(S.evalHistory.length-1||1))*(W-8)+4;
    const y=H/2-(val/maxCP)*(H/2-4);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

function updateGameStatus(){
  if (chess.isCheckmate()){
    gameOver=true; setStatus("Checkmate");
    openResultModal("Checkmate", `${chess.turn()==='w'?"Black":"White"} wins`);
    return;
  }
  if (chess.isDraw()){
    gameOver=true; setStatus("Draw");
    openResultModal("Draw","Stalemate/50-move/3-fold");
    return;
  }
  const turn=chess.turn()==='w'?"White":"Black";
  setStatus(`${turn} to move`);
  ui.openingName.textContent = detectOpeningShort(chess) || "";
}

function openResultModal(title, sub){
  const dlg=document.getElementById("modalOverlay");
  document.getElementById("modalTitle").textContent=title;
  document.getElementById("modalSubtitle").textContent=sub||"";
  dlg.classList.add("open"); dlg.setAttribute("aria-hidden","false");
}
function closeResultModal(){
  const dlg=document.getElementById("modalOverlay");
  dlg.classList.remove("open"); dlg.setAttribute("aria-hidden","true");
}

function startMoveTimer(){
  stopTimer();
  const sec=Number(c.moveTimer.value);
  if (!sec){ timerHud.textContent=""; return; }
  let remain=sec*1000;
  tInterval=setInterval(()=>{
    remain-=250;
    if (remain<=0){
      clearInterval(tInterval); tInterval=null;
      const mark=chess.turn()==='w'?"White":"Black";
      handleTimeout(mark);
    } else {
      timerHud.textContent=`⏱️ ${chess.turn()==='w'?"White":"Black"} — ${fmtTime(remain)}`;
    }
  },250);
}
function stopTimer(){ if (tInterval){ clearInterval(tInterval); tInterval=null; } }
function fmtTime(ms){ const s=Math.max(0,Math.ceil(ms/1000)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }

async function moveApplied(move){
  addMoveToList(move);
  renderBoard();
  updateGameStatus();

  clearOverlay();
  if (S.lastFrom && S.lastTo) drawArrowSquares(S.lastFrom, S.lastTo, "#10b981");

  if (S.mode==="ai" && !gameOver){
    const you=c.yourSide.value;
    if ((you==="white" && chess.turn()==='b') || (you==="black" && chess.turn()==='w')) await aiMove(c.difficulty.value);
    else startMoveTimer();
  } else startMoveTimer();

  if (S.analyzing && S.engineReady) engineAnalyzePosition();
}

/* Heuristic AI */
function randomMove(b){ const v=b.moves({verbose:true}); return v[Math.floor(Math.random()*v.length)]; }
function mvVal(m){ const v={p:1,n:3,b:3.1,r:5,q:9}; return (m.captured? v[m.captured?.toLowerCase()]||0:0) + (["d4","e4","d5","e5"].includes(m.to)?0.2:0); }
async function aiMove(level){
  if (level==="engine" && S.engineReady){
    const best=await engineBestMove(chess.fen());
    if (best && best.bestmove){ applyAIMove(best.bestmove); return; }
  }
  const list=chess.moves({verbose:true}); if (!list.length) return;
  let chosen;
  if (level==="easy") chosen=randomMove(chess);
  else if (level==="medium") chosen=list.slice().sort((a,b)=>mvVal(b)-mvVal(a))[0];
  else {
    let best=-1e9, pick=list[0];
    for (const m of list){
      chess.move(m);
      const opp=chess.moves({verbose:true});
      let reply=0; for (const r of opp) reply=Math.max(reply,mvVal(r));
      chess.undo();
      const sc=mvVal(m)-reply*0.6;
      if (sc>best){ best=sc; pick=m; }
    }
    chosen=pick;
  }
  chess.move({from:chosen.from, to:chosen.to, promotion:"q"});
  S.lastFrom=chosen.from; S.lastTo=chosen.to;
  if (S.sounds) beep(620,70,"triangle",0.03);
  renderBoard(); updateGameStatus(); startMoveTimer();
  if (S.analyzing && S.engineReady) engineAnalyzePosition();
}
function applyAIMove(uci){
  const from=uci.slice(0,2), to=uci.slice(2,4), promo=uci[4];
  const mv=chess.move({from,to,promotion:promo||"q"}); if (!mv) return;
  S.lastFrom=from; S.lastTo=to; addMoveToList(mv);
  if (S.sounds) beep(620,70,"triangle",0.03);
  renderBoard(); updateGameStatus(); startMoveTimer();
  if (S.analyzing && S.engineReady) engineAnalyzePosition();
}

/* Overlay arrows (always re-computed from element centers) */
function clearOverlay(){
  const ctx=ui.overlay.getContext("2d");
  const rect=ui.boardEl.getBoundingClientRect();
  ui.overlay.width=rect.width; ui.overlay.height=rect.height;
  ctx.clearRect(0,0,ui.overlay.width, ui.overlay.height);
}
function squareCenterPx(sq){
  const rect=ui.boardEl.getBoundingClientRect();
  const file="abcdefgh".indexOf(sq[0]);
  const rank=Number(sq[1])-1;
  const col = (S.orientation==="white") ? file : 7-file;
  const row = (S.orientation==="white") ? 7-rank : rank;
  const cw=rect.width/8, ch=rect.height/8;
  return { x: (col+0.5)*cw, y: (row+0.5)*ch }; // overlay local coords
}
function drawArrow(from,to,color="#5b8dff"){
  const ctx=ui.overlay.getContext("2d");
  const A=squareCenterPx(from), B=squareCenterPx(to);
  const dx=B.x-A.x, dy=B.y-A.y, len=Math.hypot(dx,dy); if (len<4) return;
  const nx=dx/len, ny=dy/len, head=14, wing=6;
  ctx.save(); ctx.globalAlpha=0.95; ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=8;
  // shaft
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x - nx*head, B.y - ny*head); ctx.stroke();
  // head
  ctx.beginPath();
  ctx.moveTo(B.x, B.y);
  ctx.lineTo(B.x - nx*head - ny*wing, B.y - ny*head + nx*wing);
  ctx.lineTo(B.x - nx*head + ny*wing, B.y - ny*head - nx*wing);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawArrowSquares(from,to,color){ clearOverlay(); drawArrow(from,to,color); }
function drawSavedPVArrow(){
  const pv = (ui.pvBox.textContent||"").trim().split(/\s+/)[0];
  if (pv && pv.length>=4){ drawArrow(pv.slice(0,2), pv.slice(2,4), "#f59e0b"); }
}

/* Engine integration */
let engineW=null;
function initEngine(){
  engineW=new Worker("engine-worker.js");
  engineW.onmessage=(e)=>{
    const m=e.data;
    if (m.type==="ready"){ S.engineReady=true; ui.engineStatus.textContent="Engine: ready"; if (S.analyzing) engineAnalyzePosition(); }
    else if (m.type==="info"){
      ui.engineStatus.textContent=`depth ${m.depth ?? "?"} eval ${m.scoreText ?? ""}`;
      ui.pvBox.textContent = m.pv || "";
      const ply=chess.history().length;
      pushEvalHistory(ply, m.cp, m.mate);
      // draw PV arrow (first best move)
      const uci=(m.pv||"").split(/\s+/)[0];
      requestAnimationFrame(()=>{ clearOverlay(); if (S.lastFrom&&S.lastTo) drawArrow(S.lastFrom,S.lastTo,"#10b981"); if (uci?.length>=4) drawArrow(uci.slice(0,2), uci.slice(2,4), "#f59e0b"); });
    } else if (m.type==="bestmove"){ /* resolved by engineBestMove */ }
    else if (m.type==="error"){ ui.engineStatus.textContent=m.message||"Engine error"; }
  };
  engineW.postMessage({ cmd:"init", cdn: CDN.stockfish });
}
function engineAnalyzePosition(){
  if (!S.engineReady) return;
  engineW.postMessage({ cmd:"analyze", fen: chess.fen(), depth: Number(c.depthRange.value), multipv: Math.max(1, Math.min(4, Number(c.multiPV.value))) });
}
function engineBestMove(fen){
  return new Promise(res=>{
    const onMsg=(e)=>{ const m=e.data; if (m.type==="bestmove"){ engineW.removeEventListener("message", onMsg); res(m); } };
    engineW.addEventListener("message", onMsg);
    engineW.postMessage({ cmd:"bestmove", fen, depth: Number(c.depthRange.value), movetime: 1200 });
  });
}

/* Opening detector (tiny ECO sample) */
const OPENINGS = [
  { eco:"B00", name:"King's Pawn Opening", moves:"e4" },
  { eco:"C20", name:"King's Pawn Game", moves:"e4 e5" },
  { eco:"C50", name:"Italian Game", moves:"e4 e5 Nf3 Nc6 Bc4" },
  { eco:"C60", name:"Ruy Lopez", moves:"e4 e5 Nf3 Nc6 Bb5" },
  { eco:"B20", name:"Sicilian Defense", moves:"e4 c5" },
  { eco:"D00", name:"Queen's Pawn Game", moves:"d4 d5" },
  { eco:"D30", name:"Queen's Gambit", moves:"d4 d5 c4" },
  { eco:"E60", name:"King's Indian Defense", moves:"d4 Nf6 c4 g6 Nc3 Bg7 e4 d6" }
];
function detectOpeningShort(ch){
  const san=ch.history().join(" ").replace(/[+#!?]/g,"").toLowerCase();
  let best=null,bestLen=0;
  for (const o of OPENINGS){
    const seq=o.moves.toLowerCase();
    if (san.startsWith(seq) && seq.length>bestLen){ best=o; bestLen=seq.length; }
  }
  return best ? `${best.eco} · ${best.name}` : "";
}

/* PGN / FEN / Editor, Undo, Replay — same as earlier (omitted unchanged parts) */
function copyFEN(){ navigator.clipboard?.writeText(chess.fen()); setStatus("FEN copied."); }
async function pasteFEN(){ const t=prompt("Paste FEN:"); if (!t) return; try{ const test=new Chess(t); chess=test; S.lastFrom=S.lastTo=null; renderBoard(); setStatus("FEN loaded."); if (S.analyzing && S.engineReady) engineAnalyzePosition(); }catch{ alert("Invalid FEN"); } }
function exportPGN(){ const pgn=chess.pgn({ max_width:100, newline_char:"\n" }); c.pgnBox.value=pgn; c.pgnBox.select?.(); document.execCommand?.("copy"); setStatus("PGN exported."); }
function importPGN(){ const pgn=c.pgnBox.value.trim(); if(!pgn){ alert("Paste PGN."); return;} try{ chess=new Chess(); chess.load_pgn(pgn); S.lastFrom=S.lastTo=null; renderBoard(); setStatus("PGN loaded."); if (S.analyzing && S.engineReady) engineAnalyzePosition(); }catch{ alert("Invalid PGN"); } }
let editorCycle=["","P","N","B","R","Q","K","p","n","b","r","q","k"]; let editorIdx=0;
function startEditor(){ S.editor=true; c.exitEditor.disabled=false; c.startEditor.disabled=true; setStatus("Editor: tap squares to cycle pieces; Done to apply."); }
function exitEditor(){ S.editor=false; c.exitEditor.disabled=true; c.startEditor.disabled=false; setStatus("Editor closed."); }
function editorPointerDown(e){
  const sq=e.currentTarget.dataset.square;
  editorIdx=(editorIdx+1)%editorCycle.length;
  const code=editorCycle[editorIdx];
  const fenparts=chess.fen().split(" ");
  const arr=[]; for (let r=8;r>=1;r--){ const row=[]; for (let f=0; f<8; f++){ const s="abcdefgh"[f]+r; const p=chess.get(s); row.push(p? (p.color==='w'?p.type.toUpperCase():p.type) : ""); } arr.push(row); }
  const file="abcdefgh".indexOf(sq[0]); const rank=8-Number(sq[1]); arr[rank][file]=code;
  const ranks=arr.map(row=>{ let fen=""; let empty=0; for (const cell of row){ if (!cell) empty++; else { if (empty>0){ fen+=empty; empty=0; } fen+=cell; } } if (empty>0) fen+=empty; return fen; });
  const fen=ranks.join("/") + " " + fenparts[1] + " KQkq - 0 1"; chess=new Chess(fen); renderBoard();
}
function undo(){ if (!chess.history().length) return; chess.undo(); S.lastFrom=S.lastTo=null; renderBoard(); setStatus("Move undone"); clearOverlay(); if (S.analyzing && S.engineReady) engineAnalyzePosition(); }

/* Fullscreen + hint */
document.getElementById("fsBtn").addEventListener("click", ()=>{
  document.querySelector(".page")?.classList.toggle("full");
  setTimeout(()=> drawSavedPVArrow(), 150);
});
c.hintBtn.addEventListener("click", async ()=>{
  let uci=null;
  if (S.engineReady){ const best=await engineBestMove(chess.fen()); uci=best?.bestmove||null; }
  if (!uci){ const v=chess.moves({verbose:true}); if(!v.length) return; const pick=v.slice().sort((a,b)=>mvVal(b)-mvVal(a))[0]; uci=pick.from+pick.to; }
  if (uci?.length>=4){ clearOverlay(); drawArrow(uci.slice(0,2), uci.slice(2,4), "#8ab4ff"); }
});
c.clearHint.addEventListener("click", ()=>{ clearOverlay(); drawSavedPVArrow(); });

/* Modal, theme, sound, controls */
document.getElementById("modalOverlay")?.addEventListener("click",(e)=>{ if (e.target.id==="modalOverlay") closeResultModal(); });
document.getElementById("closeModal")?.addEventListener("click", closeResultModal);
document.getElementById("playAgain")?.addEventListener("click", ()=>{ closeResultModal(); newGame(); });

c.themeToggle.addEventListener("click", applyTheme);
c.soundToggle.addEventListener("change", ()=> S.sounds=c.soundToggle.checked);
c.boardTheme.addEventListener("change", ()=> setBoardTheme(c.boardTheme.value));
c.newGame.addEventListener("click", ()=> newGame());
c.undoBtn.addEventListener("click", undo);
c.flipBtn.addEventListener("click", ()=>{ S.orientation=(S.orientation==="white"?"black":"white"); renderBoard(); });

/* Resize/orientation: keep board + overlay correct */
window.addEventListener("resize", debounce(()=>{ renderBoard(); }, 120));
window.addEventListener("orientationchange", ()=> setTimeout(()=> renderBoard(), 200));
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

/* Audio */
let audioCtx=null;
["click","touchstart","keydown"].forEach(evt=> window.addEventListener(evt, ()=> ensureAudio(), { once:true, passive:true }));
function ensureAudio(){ if (!S.sounds) return null; if(!audioCtx){ const AC=window.AudioContext||window.webkitAudioContext; if (!AC) return null; audioCtx=new AC(); } if (audioCtx.state==="suspended") audioCtx.resume().catch(()=>{}); return audioCtx; }
function beep(freq=440,dur=80,type="sine",vol=0.04){ if (!S.sounds) return; const ctx=ensureAudio(); if (!ctx) return; const o=ctx.createOscillator(), g=ctx.createGain(); o.type=type; o.frequency.value=freq; g.gain.value=vol; o.connect(g).connect(ctx.destination); const t=ctx.currentTime; o.start(t); o.stop(t+dur/1000); }

/* Engine worker */
let engineW=null;
function initEngine(){
  engineW=new Worker("engine-worker.js");
  engineW.onmessage=(e)=>{
    const m=e.data;
    if (m.type==="ready"){ S.engineReady=true; ui.engineStatus.textContent="Engine: ready"; if (S.analyzing) engineAnalyzePosition(); }
    else if (m.type==="info"){
      ui.engineStatus.textContent=`depth ${m.depth ?? "?"} eval ${m.scoreText ?? ""}`;
      ui.pvBox.textContent=m.pv||"";
      const ply=chess.history().length;
      pushEvalHistory(ply, m.cp, m.mate);
      const uci=(m.pv||"").split(/\s+/)[0];
      requestAnimationFrame(()=>{ clearOverlay(); if (S.lastFrom&&S.lastTo) drawArrow(S.lastFrom,S.lastTo,"#10b981"); if (uci?.length>=4) drawArrow(uci.slice(0,2),uci.slice(2,4),"#f59e0b"); });
    } else if (m.type==="bestmove"){ /* promise resolves in engineBestMove */ }
    else if (m.type==="error"){ ui.engineStatus.textContent=m.message||"Engine error"; }
  };
  engineW.postMessage({ cmd:"init", cdn: CDN.stockfish });
}
function engineAnalyzePosition(){ if (!S.engineReady) return; engineW.postMessage({ cmd:"analyze", fen:chess.fen(), depth:Number(c.depthRange.value), multipv:Math.max(1, Math.min(4, Number(c.multiPV.value))) }); }
function engineBestMove(fen){ return new Promise(res=>{ const on=(e)=>{ const m=e.data; if (m.type==="bestmove"){ engineW.removeEventListener("message", on); res(m); } }; engineW.addEventListener("message", on); engineW.postMessage({ cmd:"bestmove", fen, depth:Number(c.depthRange.value), movetime:1200 }); }); }

/* Opening quick dictionary */
function detectOpeningShort(ch){ /* same as earlier; omitted for brevity — present in file above */ return ""; }

/* Load chess.js and start */
async function loadChessLib(){
  if (window.Chess) return;
  for (const url of CDN.chess){
    try{
      await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=url; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
      if (window.Chess) return;
    }catch{}
  }
  alert("Could not load chess rules. Try once online to cache it.");
}

/* New game + starter */
function getStarter(){
  const who=c.whoStarts.value;
  if (who==="random") return Math.random()<0.5?"white":"black";
  if (who==="alternate"){ const prev=localStorage.getItem("ch-alt")||"white"; const next=(prev==="white"?"black":"white"); localStorage.setItem("ch-alt", next); return next; }
  return who;
}

function newGame(){
  if (!window.Chess){ setStatus("Rules not loaded yet."); return; }
  chess=new Chess();
  S.mode=c.mode.value;
  S.lastFrom=S.lastTo=null; gameOver=false; S.evalHistory=[];
  // auto-orient to your side if vs AI
  if (S.mode==="ai"){ S.orientation = (c.yourSide.value==="white"?"white":"black"); }
  renderBoard();
  const starter=getStarter();
  if (S.mode==="ai"){
    c.difficulty.disabled=false; document.getElementById("yourSideWrap").style.display="grid";
    const you=c.yourSide.value;
    if ((you==="white" && starter==="black") || (you==="black" && starter==="white")){
      setStatus("Computer thinking…"); setTimeout(()=> aiMove(c.difficulty.value), 300);
    } else setStatus(`${starter==="white"?"White":"Black"} to move`);
  } else {
    c.difficulty.disabled=true; document.getElementById("yourSideWrap").style.display="none";
    setStatus(`${starter==="white"?"White":"Black"} to move`);
  }
  startMoveTimer();
  if (S.analyzing && S.engineReady) engineAnalyzePosition();
}

/* Runtime */
let gameOver=false, isReplaying=false;
const timerHud=document.createElement("div"); timerHud.id="timerHud"; document.querySelector(".board-wrap")?.appendChild(timerHud);

applyThemeFromPref(); setBoardTheme(c.boardTheme.value);

(async ()=>{
  await loadChessLib();
  initEngine();
  chess = new Chess();
  renderBoard();
  newGame();
  setStatus("Ready");
})();

/* SW */
if ("serviceWorker" in navigator){
  window.addEventListener("load", ()=> navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
}

/* Utils */
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
