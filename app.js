"use strict";

/*
Offline-first Chess — Lichess-style
- Loads chess.js and Stockfish from CDN automatically, caches with SW for offline use.
- If engine not ready, Vs Computer uses a solid heuristic (Easy/Medium/Hard).
- CSS Grid board (always visible; mobile-friendly).
*/

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
  evalBar: document.getElementById("evalBar")
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
  themeBtn: document.getElementById("themeToggle"),
  soundBtn: document.getElementById("soundToggle"),
  openReplay: document.getElementById("openReplay"),
  importReplay: document.getElementById("importReplay"),
  fileInput: document.getElementById("fileInput"),
  replayOverlay: document.getElementById("replayOverlay"),
  closeReplay: document.getElementById("closeReplay"),
  replayMeta: document.getElementById("replayMeta"),
  stepBack: document.getElementById("stepBack"),
  stepForward: document.getElementById("stepForward"),
  restartReplay: document.getElementById("restartReplay"),
  replaySpeed: document.getElementById("replaySpeed"),
  replayPlay: document.getElementById("replayPlay")
};

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

function setStatus(t){ ui.statusBar.textContent = t; }

function applyTheme(){
  const cur = document.documentElement.getAttribute("data-theme") || "auto";
  const next = (cur==="auto") ? (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark") : (cur==="dark"?"light":"dark");
  document.documentElement.setAttribute("data-theme", next);
  c.themeBtn.textContent = next==="dark" ? "☀️" : "🌙";
}
function applyThemeFromPref(){
  const pref = localStorage.getItem("ch-theme") || "auto";
  document.documentElement.setAttribute("data-theme", pref);
  c.themeBtn.textContent = (pref==="dark") ? "☀️" : "🌙";
}
function setBoardTheme(name){ document.documentElement.setAttribute("data-board", name); }

function renderBoard(){
  ui.boardEl.innerHTML = "";
  ui.filesEl.innerHTML = "";
  ui.ranksEl.innerHTML = "";

  const files = S.orientation==="white" ? "a b c d e f g h".split(" ") : "h g f e d c b a".split(" ");
  const ranks = S.orientation==="white" ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];

  if (c.showCoords.checked){
    ui.filesEl.style.display = "flex"; ui.ranksEl.style.display = "flex";
    ui.filesEl.innerHTML = files.map(f=>`<span>${f}</span>`).join("");
    ui.ranksEl.innerHTML = ranks.map(r=>`<span>${r}</span>`).join("");
  } else {
    ui.filesEl.style.display = "none"; ui.ranksEl.style.display = "none";
  }

  for (let row = 0; row < 8; row++){
    for (let col = 0; col < 8; col++){
      const light = (row + col) % 2 === 0;
      const sqName = S.orientation === "white"
        ? "abcdefgh"[col] + (8 - row)
        : "abcdefgh"[7 - col] + (row + 1);

      const sq = document.createElement("div");
      sq.className = `square ${light ? "a" : "b"}`;
      sq.dataset.square = sqName;

      if (c.showLast.checked && (sqName === S.lastFrom || sqName === S.lastTo)) sq.classList.add("last");

      const piece = chess?.get?.(sqName);
      if (piece){
        const pEl = document.createElement("div");
        pEl.className = "piece";
        pEl.textContent = UNI[piece.color === "w" ? piece.type.toUpperCase() : piece.type];
        sq.appendChild(pEl);
      }

      sq.addEventListener("pointerdown", onPointerDown);
      ui.boardEl.appendChild(sq);
    }
  }
  setPlayerLabels();
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
  const fromEl = ui.boardEl.querySelector(`[data-square="${from}"]`);
  fromEl?.classList.add("highlight");
}

async function onPointerDown(e){
  if (!chess || S.editor) return S.editor ? editorPointerDown(e) : undefined;
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

async function tryMove(from, to){
  const moves = chess.moves({ square: from, verbose: true });
  const legal = moves.find(m => m.to===to);
  if (!legal){
    const p2 = chess.get(to);
    if (p2 && ((p2.color==='w' && chess.turn()==='w') || (p2.color==='b' && chess.turn()==='b'))){
      S.selected = to; highlightLegal(S.selected); return;
    }
    S.selected=null; renderBoard(); return;
  }

  let promo = "q";
  if (legal.flags.includes("p")) promo = await askPromotion();

  const move = chess.move({ from, to, promotion: promo });
  if (!move) return;

  if (S.sounds) beep(660,70,"triangle",0.03);
  S.selected = null; S.lastFrom = from; S.lastTo = to;
  moveApplied(move);
}

function askPromotion(){
  if (!HTMLDialogElement.prototype.showModal) return "q";
  return new Promise(res=>{
    ui.promoDialog.addEventListener("close", ()=>res(ui.promoDialog.returnValue || "q"), { once:true });
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
  let score = 0.5; // 0..1, 1 = white winning
  if (mate !== undefined){ score = mate > 0 ? 1 : 0; }
  else if (cp !== undefined){ const clamp = Math.max(-300, Math.min(300, cp)); score = (clamp + 300) / 600; }
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
    const val = (e.mate!==undefined) ? (e.mate>0? maxCP : -maxCP) : Math.max(-maxCP, Math.min(maxCP, e.cp||0));
    const x = (i/(S.evalHistory.length-1||1))*(W-8)+4;
    const y = H/2 - (val/maxCP)*(H/2-4);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

function updateGameStatus(){
  if (chess.isCheckmate()){
    gameOver = true; setStatus("Checkmate");
    openResultModal("Checkmate", `${chess.turn()==='w' ? "Black" : "White"} wins`);
    return;
  }
  if (chess.isDraw()){
    gameOver = true; setStatus("Draw");
    openResultModal("Draw","Stalemate/50-move/3-fold");
    return;
  }
  const turn = chess.turn()==='w'?"White":"Black";
  setStatus(`${turn} to move`);
  ui.openingName.textContent = detectOpeningShort(chess) || "";
}

function openResultModal(title, sub){
  const dlg = document.getElementById("modalOverlay");
  document.getElementById("modalTitle").textContent=title;
  document.getElementById("modalSubtitle").textContent=sub||"";
  dlg.classList.add("open"); dlg.setAttribute("aria-hidden","false");
}
function closeResultModal(){
  const dlg = document.getElementById("modalOverlay");
  dlg.classList.remove("open"); dlg.setAttribute("aria-hidden","true");
}

function startMoveTimer(){
  stopTimer();
  const sec = Number(c.moveTimer.value);
  if (!sec){ timerHud.textContent=""; return; }
  let remain = sec*1000;
  tInterval = setInterval(()=>{
    remain -= 250;
    if (remain<=0){
      clearInterval(tInterval); tInterval=null;
      const mark = chess.turn()==='w'?"White":"Black";
      handleTimeout(mark);
    } else {
      timerHud.textContent = `⏱️ ${chess.turn()==='w'?"White":"Black"} — ${fmtTime(remain)}`;
    }
  }, 250);
}
function stopTimer(){ if (tInterval){ clearInterval(tInterval); tInterval=null; } }
function fmtTime(ms){ const s=Math.max(0,Math.ceil(ms/1000)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }

async function moveApplied(move){
  addMoveToList(move);
  renderBoard();
  updateGameStatus();

  if (S.mode==="ai" && !gameOver){
    const you = c.yourSide.value;
    if ((you==="white" && chess.turn()==='b') || (you==="black" && chess.turn()==='w')) await aiMove(c.difficulty.value);
    else startMoveTimer();
  } else startMoveTimer();

  if (S.analyzing && S.engineReady) engineAnalyzePosition();
}

/* Heuristic AI (fallback) */
function randomMove(b){ const m=b.moves({verbose:true}); return m[Math.floor(Math.random()*m.length)]; }
function mvVal(m){ const v={ p:1,n:3,b:3.1,r:5,q:9 }; return (m.captured? v[m.captured.toLowerCase()]||0:0) + (["d4","e4","d5","e5"].includes(m.to)?0.2:0); }
async function aiMove(level){
  if (level==="engine" && S.engineReady){
    const best = await engineBestMove(chess.fen()); if (best && best.bestmove){ applyAIMove(best.bestmove); return; }
  }
  const v = chess.moves({verbose:true}); if (!v.length) return;
  let chosen;
  if (level==="easy") chosen = randomMove(chess);
  else if (level==="medium") chosen = v.slice().sort((a,b)=> mvVal(b)-mvVal(a))[0];
  else {
    let best=-1e9, pick=v[0];
    for (const m of v){
      chess.move(m);
      const opp = chess.moves({verbose:true});
      let reply=0; for (const r of opp) reply = Math.max(reply, mvVal(r));
      chess.undo();
      const sc = mvVal(m) - reply*0.6;
      if (sc>best){ best=sc; pick=m; }
    }
    chosen = pick;
  }
  chess.move({from:chosen.from, to:chosen.to, promotion:"q"});
  S.lastFrom=chosen.from; S.lastTo=chosen.to;
  if (S.sounds) beep(620,70,"triangle",0.03);
  renderBoard(); updateGameStatus(); startMoveTimer();
  if (S.analyzing && S.engineReady) engineAnalyzePosition();
}
function applyAIMove(uci){
  const from=uci.slice(0,2), to=uci.slice(2,4), promo=uci[4];
  const move = chess.move({from, to, promotion: promo||"q"});
  if (move){
    S.lastFrom=from; S.lastTo=to;
    addMoveToList(move);
    if (S.sounds) beep(620,70,"triangle",0.03);
    renderBoard(); updateGameStatus(); startMoveTimer();
    if (S.analyzing && S.engineReady) engineAnalyzePosition();
  }
}

/* Engine integration via worker */
let engineW = null;
function initEngine(){
  engineW = new Worker("engine-worker.js");
  engineW.onmessage = (e)=>{
    const m=e.data;
    if (m.type==="ready"){ S.engineReady=true; ui.engineStatus.textContent="Engine: ready"; if (S.analyzing) engineAnalyzePosition(); }
    else if (m.type==="info"){
      ui.engineStatus.textContent = `depth ${m.depth ?? "?"} eval ${m.scoreText ?? ""}`;
      ui.pvBox.textContent = m.pv || "";
      const ply = chess.history().length;
      pushEvalHistory(ply, m.cp, m.mate);
    } else if (m.type==="bestmove"){ /* requested by engineBestMove */ }
    else if (m.type==="error"){ ui.engineStatus.textContent = m.message || "Engine error"; }
  };
  engineW.postMessage({ cmd:"init", cdn: CDN.stockfish });
}
function engineAnalyzePosition(){
  engineW?.postMessage({ cmd:"analyze", fen: chess.fen(), depth: Number(c.depthRange.value), multipv: Math.max(1, Math.min(4, Number(c.multiPV.value))) });
}
function engineBestMove(fen){
  return new Promise(res=>{
    const onMsg = (e)=>{ const m=e.data; if (m.type==="bestmove"){ engineW.removeEventListener("message", onMsg); res(m); } };
    engineW.addEventListener("message", onMsg);
    engineW.postMessage({ cmd:"bestmove", fen, depth: Number(c.depthRange.value), movetime: 1200 });
  });
}

/* Opening detector (compact) */
const OPENINGS = [
  { eco:"B00", name:"King's Pawn Opening", moves:"e4" },
  { eco:"C20", name:"King's Pawn Game", moves:"e4 e5" },
  { eco:"C40", name:"Petrov Defense", moves:"e4 e5 Nf3 Nf6" },
  { eco:"C50", name:"Italian Game", moves:"e4 e5 Nf3 Nc6 Bc4" },
  { eco:"C60", name:"Ruy Lopez", moves:"e4 e5 Nf3 Nc6 Bb5" },
  { eco:"B01", name:"Scandinavian Defense", moves:"e4 d5" },
  { eco:"B20", name:"Sicilian Defense", moves:"e4 c5" },
  { eco:"D00", name:"Queen's Pawn Game", moves:"d4 d5" },
  { eco:"D30", name:"Queen's Gambit", moves:"d4 d5 c4" },
  { eco:"E60", name:"King's Indian Defense", moves:"d4 Nf6 c4 g6 Nc3 Bg7 e4 d6" },
  { eco:"A40", name:"Queen's Pawn", moves:"d4" },
  { eco:"A00", name:"Irregular Opening", moves:"b3" }
];
function detectOpeningShort(ch){
  const moves = ch.history({ verbose:true }).map(m=>m.san.replace(/[+#?!]/g,"").toLowerCase());
  const seq = moves.join(" ");
  let best=null, bestLen=0;
  for (const o of OPENINGS){
    const s=o.moves.toLowerCase();
    if (seq.startsWith(s) && s.length>bestLen){ best=o; bestLen=s.length; }
  }
  return best ? `${best.eco} · ${best.name}` : "";
}

/* PGN / FEN / Editor */
function copyFEN(){ navigator.clipboard?.writeText(chess.fen()); setStatus("FEN copied."); }
async function pasteFEN(){
  const t = prompt("Paste FEN:"); if (!t) return;
  try{ const test = new Chess(t); chess=test; S.lastFrom=S.lastTo=null; renderBoard(); setStatus("FEN loaded."); if (S.analyzing && S.engineReady) engineAnalyzePosition(); }
  catch{ alert("Invalid FEN"); }
}
function exportPGN(){
  const pgn = chess.pgn({ max_width:100, newline_char:"\n" });
  c.pgnBox.value = pgn; c.pgnBox.select?.(); document.execCommand?.("copy");
  setStatus("PGN exported to the box.");
}
function importPGN(){
  const pgn = c.pgnBox.value.trim(); if (!pgn){ alert("Paste PGN into the box."); return; }
  try{ chess = new Chess(); chess.load_pgn(pgn); S.lastFrom=S.lastTo=null; renderBoard(); setStatus("PGN loaded."); if (S.analyzing && S.engineReady) engineAnalyzePosition(); }
  catch{ alert("Invalid PGN."); }
}
let editorCycle = ["", "P","N","B","R","Q","K","p","n","b","r","q","k"]; let editorIdx = 0;
function startEditor(){ S.editor=true; c.exitEditor.disabled=false; c.startEditor.disabled=true; setStatus("Editor: tap squares to cycle pieces; Done to apply."); }
function exitEditor(){ S.editor=false; c.exitEditor.disabled=true; c.startEditor.disabled=false; setStatus("Editor closed."); }
function editorPointerDown(e){
  const sq = e.currentTarget.dataset.square;
  editorIdx = (editorIdx+1) % editorCycle.length;
  const code = editorCycle[editorIdx];
  const fenparts = chess.fen().split(" ");
  const arr=[]; for (let r=8;r>=1;r--){ const row=[]; for (let f=0; f<8; f++){ const s="abcdefgh"[f]+r; const p=chess.get(s); row.push(p? (p.color==='w'?p.type.toUpperCase():p.type) : ""); } arr.push(row); }
  const file = "abcdefgh".indexOf(sq[0]); const rank = 8-Number(sq[1]);
  arr[rank][file] = code;
  const ranks = arr.map(row=>{ let fen=""; let empty=0; for (const cell of row){ if (!cell) empty++; else { if (empty>0){ fen+=empty; empty=0; } fen+=cell; } } if (empty>0) fen+=empty; return fen; });
  const fen = ranks.join("/") + " " + fenparts[1] + " KQkq - 0 1";
  chess = new Chess(fen); renderBoard();
}

/* Undo / Replay (basic) */
function undo(){
  if (!chess.history().length) return;
  chess.undo(); S.lastFrom=S.lastTo=null; renderBoard(); setStatus("Move undone");
  if (S.analyzing && S.engineReady) engineAnalyzePosition();
}
let isReplaying=false, replayTimer=null;
function openReplay(){ isReplaying=true; setStatus("Replay mode — use controls"); }
function closeReplay(){ isReplaying=false; if (replayTimer){ clearInterval(replayTimer); replayTimer=null; } setStatus("Replay off"); }
function replayStepForward(){ /* optional: expand with stored snapshots */ }
function replayStepBack(){ chess.undo(); renderBoard(); }
function replayRestart(){ /* optional */ }
function replayPlayToggle(){
  if (replayTimer){ clearInterval(replayTimer); replayTimer=null; c.replayPlay.textContent="▶️ Play"; return; }
  c.replayPlay.textContent="⏸️ Pause";
  const sp = Number(c.replaySpeed.value||"1");
  replayTimer = setInterval(()=> replayStepForward(), Math.max(150, Math.round(700/sp)));
}

/* Annotate quick (stub) */
function annotateGameWithEngine(){
  if (!S.engineReady){ alert("Engine not ready yet."); return; }
  setStatus("Annotating… (quick evaluation swings)"); // Extend with CPL thresholds if desired
}

/* Timer helpers */
let tInterval=null;
const timerHud = document.getElementById("timerHud");

/* Timeout -> forfeit */
function handleTimeout(mark){
  if (gameOver) return;
  gameOver=true; setStatus(`${mark} flagged. ${mark==="White"?"Black":"White"} wins.`);
  openResultModal("Time out ⏱️", `${mark} ran out of time.`);
}

/* Resize: ensure correct board paint */
window.addEventListener("resize", debounce(renderBoard, 120));
window.addEventListener("orientationchange", ()=> setTimeout(renderBoard, 200));
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

/* Events */
document.getElementById("modalOverlay")?.addEventListener("click",(e)=>{ if (e.target.id==="modalOverlay") closeResultModal(); });
document.getElementById("closeModal")?.addEventListener("click", closeResultModal);
document.getElementById("playAgain")?.addEventListener("click", ()=>{ closeResultModal(); newGame(); });

c.themeBtn.addEventListener("click", applyTheme);
c.soundBtn.addEventListener("change", ()=> S.sounds = c.soundBtn.checked);

c.boardTheme.addEventListener("change", ()=> setBoardTheme(c.boardTheme.value));
c.newGame.addEventListener("click", ()=> newGame());
c.undoBtn.addEventListener("click", undo);
c.flipBtn.addEventListener("click", ()=>{ S.orientation=(S.orientation==="white"?"black":"white"); renderBoard(); });
c.prevMove.addEventListener("click", ()=>{ chess.undo(); renderBoard(); });
c.nextMove.addEventListener("click", ()=>{/* can be extended with forward stack */});
c.analyzeToggle.addEventListener("click", ()=>{ S.analyzing=!S.analyzing; c.analyzeToggle.textContent=S.analyzing?"Analyzing…":"Live analyze"; if (S.analyzing && S.engineReady) engineAnalyzePosition(); });
c.annotateGame.addEventListener("click", annotateGameWithEngine);
c.depthRange.addEventListener("input", ()=>{/* handled live on analyze */});
c.multiPV.addEventListener("change", ()=>{/* handled live on analyze */});
c.copyFEN.addEventListener("click", copyFEN);
c.pasteFEN.addEventListener("click", pasteFEN);
c.exportPGN.addEventListener("click", exportPGN);
c.importPGN.addEventListener("click", importPGN);
c.startEditor.addEventListener("click", startEditor);
c.exitEditor.addEventListener("click", exitEditor);

/* Board keyboard nav */
ui.boardEl.addEventListener("keydown",(e)=>{
  if (e.key==="Escape"){ S.selected=null; renderBoard(); }
});

/* Sounds */
["click","touchstart","keydown"].forEach(evt=> window.addEventListener(evt, ()=> ensureAudio(), { once:true, passive:true }));
let audioCtx=null;
function ensureAudio(){
  if (!S.sounds) return null;
  if (!audioCtx){
    const AC=window.AudioContext||window.webkitAudioContext; if (!AC) return null;
    audioCtx=new AC();
  }
  if (audioCtx.state==="suspended") audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function beep(freq=440,dur=80,type="sine",vol=0.04){
  if (!S.sounds) return;
  const ctx=ensureAudio(); if (!ctx) return;
  const o=ctx.createOscillator(), g=ctx.createGain(); o.type=type; o.frequency.value=freq; g.gain.value=vol; o.connect(g).connect(ctx.destination);
  const t=ctx.currentTime; o.start(t); o.stop(t+dur/1000);
}

/* Load chess.js from CDN, then init engine and app */
async function loadChessLib(){
  if (window.Chess) return;
  for (const url of CDN.chess){
    try{
      await new Promise((res, rej)=>{
        const s=document.createElement("script"); s.src=url; s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
      if (window.Chess) return;
    }catch{}
  }
  alert("Could not load chess rules. Try once online to cache it.");
}

function getStarter(){
  const who=c.whoStarts.value;
  if (who==="random") return Math.random()<0.5?"white":"black";
  if (who==="alternate"){ const prev=localStorage.getItem("ch-alt")||"white"; const next=(prev==="white"?"black":"white"); localStorage.setItem("ch-alt", next); return next; }
  return who;
}

function newGame(){
  if (!window.Chess){ setStatus("Rules not loaded yet."); return; }
  chess = new Chess();
  S.mode = c.mode.value;
  S.lastFrom=S.lastTo=null; gameOver=false; S.evalHistory=[];
  renderBoard();

  const starter = getStarter();
  if (S.mode==="ai"){
    c.difficulty.disabled=false; document.getElementById("yourSideWrap").style.display="grid";
    const you=c.yourSide.value;
    if ((you==="white" && starter==="black") || (you==="black" && starter==="white")){
      setStatus("Computer thinking…"); setTimeout(()=> aiMove(c.difficulty.value), 300);
    } else { setStatus(`${starter==="white"?"White":"Black"} to move`); }
  } else {
    c.difficulty.disabled=true; document.getElementById("yourSideWrap").style.display="none";
    setStatus(`${starter==="white"?"White":"Black"} to move`);
  }
  startMoveTimer();
  if (S.analyzing && S.engineReady) engineAnalyzePosition();
}

/* Init */
let gameOver=false;
let isReplaying=false;
applyThemeFromPref(); setBoardTheme(c.boardTheme.value);
(async ()=>{
  await loadChessLib();
  initEngine();
  chess = new Chess();
  renderBoard();
  newGame();
  setStatus("Ready");
})();

/* Helpers */
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
