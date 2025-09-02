"use strict";

/*
Requirements:
- lib/chess.min.js must be present (from chess.js, MIT) for rules/Pgn.
- engine-worker.js + engine/stockfish.js (WASM worker build) for Engine mode + analysis.
Serve via http(s) or localhost (not file://) so WASM loads.
*/

const ui = {
  boardEl: document.getElementById("board"),
  filesEl: document.getElementById("files"),
  ranksEl: document.getElementById("ranks"),
  moveList: document.getElementById("moveList"),
  evalGraph: document.getElementById("evalGraph"),
  pvBox: document.getElementById("pvBox"),
  engineStatus: document.getElementById("engineStatus"),
  statusBar: document.getElementById("statusBar"),
  topClock: document.getElementById("topClock"),
  bottomClock: document.getElementById("bottomClock"),
  topPlayerLabel: document.getElementById("topPlayerLabel"),
  bottomPlayerLabel: document.getElementById("bottomPlayerLabel"),
  promoDialog: document.getElementById("promoDialog"),
};

const controls = {
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
  themeToggle: document.getElementById("themeToggle"),
  soundToggle: document.getElementById("soundToggle"),
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
  replayPlay: document.getElementById("replayPlay"),
};

let chess = null;
try { chess = new Chess(); } catch { alert("Missing lib/chess.min.js — download from chess.js and place in /lib."); }

const S = {
  N: 8,
  orientation: "white",
  dragging: null,
  selected: null,
  lastFrom: null,
  lastTo: null,
  mode: "ai", // ai | pvp
  analyzing: false,
  analysisOnMove: true,
  engineReady: false,
  engineOn: false,
  engineDepth: 16,
  engineMultiPV: 1,
  evalHistory: [], // { ply, cp, mate }
  plyPointer: 0,
  editor: false,
  moveTimerSec: 0,
  tInterval: null,
  remainMs: 0,
  turnMark: "white",
  altStart: "white",
  sounds: true,
  theme: "dark",
  boardTheme: "green",
};

const PIECES_UNI = {
  p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚",
  P: "♙", R: "♖", N: "♘", B: "♗", Q: "♕", K: "♔",
};

function setStatus(t){ ui.statusBar.textContent = t; }

function applyTheme(){
  const cur = document.documentElement.getAttribute("data-theme") || "auto";
  const next = (cur==="auto") ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark") : (cur==="dark"?"light":"dark");
  document.documentElement.setAttribute("data-theme", next);
  controls.themeToggle.textContent = next==="dark" ? "☀️" : "🌙";
}
function applyThemeFromPref(){
  const pref = localStorage.getItem("ch-theme") || "auto";
  document.documentElement.setAttribute("data-theme", pref);
  controls.themeToggle.textContent = (pref==="dark") ? "☀️" : "🌙";
}
function setBoardTheme(name){
  document.documentElement.setAttribute("data-board", name);
}

function squareSize(){ return ui.boardEl.clientWidth / 8; }

function xyToSquare(x,y){
  const file = "abcdefgh"[x];
  const rank = (S.orientation==="white") ? (8-y) : (y+1);
  return `${file}${rank}`;
}
function squareToXY(sq){
  const file = "abcdefgh".indexOf(sq[0]);
  const rank = Number(sq[1]);
  const y = (S.orientation==="white") ? 8-rank : rank-1;
  return { x:file, y };
}

function renderBoard(){
  ui.boardEl.innerHTML = "";
  ui.filesEl.innerHTML = "";
  ui.ranksEl.innerHTML = "";

  const files = S.orientation==="white" ? "a b c d e f g h".split(" ") : "h g f e d c b a".split(" ");
  const ranks = S.orientation==="white" ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];

  if (controls.showCoords.checked){
    ui.filesEl.style.display = "flex";
    ui.ranksEl.style.display = "flex";
    ui.filesEl.innerHTML = files.map(f=>`<span>${f}</span>`).join("");
    ui.ranksEl.innerHTML = ranks.map(r=>`<span>${r}</span>`).join("");
  } else {
    ui.filesEl.style.display = "none";
    ui.ranksEl.style.display = "none";
  }

  const size = squareSize();
  for (let y=0; y<8; y++){
    for (let x=0; x<8; x++){
      const sq = document.createElement("div");
      const isLight = (x+y)%2===0;
      sq.className = `square ${isLight?'a':'b'}`;
      sq.style.left = `${x*size}px`;
      sq.style.top = `${y*size}px`;
      sq.style.width = `${size}px`;
      sq.style.height = `${size}px`;
      const sqName = xyToSquare(x,y);
      sq.dataset.square = sqName;

      if (controls.showLast.checked && S.lastFrom && S.lastTo){
        if (sqName===S.lastFrom || sqName===S.lastTo) sq.classList.add("last");
      }

      const piece = chess.get(sqName);
      if (piece){
        const pEl = document.createElement("div");
        pEl.className = "piece";
        pEl.dataset.piece = piece.type + (piece.color==='w'?'w':'b');
        pEl.dataset.square = sqName;
        if (controls.useUnicode.checked){
          pEl.textContent = PIECES_UNI[piece.color==='w' ? piece.type.toUpperCase() : piece.type];
        } else {
          pEl.textContent = PIECES_UNI[piece.color==='w' ? piece.type.toUpperCase() : piece.type]; // still unicode unless you add sprites
        }
        sq.appendChild(pEl);
      }

      sq.addEventListener("pointerdown", onPointerDown);
      ui.boardEl.appendChild(sq);
    }
  }

  setPlayerLabels();
}

function setPlayerLabels(){
  if (S.orientation==="white"){
    ui.bottomPlayerLabel.textContent = "White";
    ui.topPlayerLabel.textContent = "Black";
  } else {
    ui.bottomPlayerLabel.textContent = "Black";
    ui.topPlayerLabel.textContent = "White";
  }
}

function onPointerDown(e){
  if (S.editor){
    // Place/remove piece in editor: tap cycles through piece types (simple editor)
    return editorPointerDown(e);
  }

  if (gameOver || isReplaying) return;
  const sq = e.currentTarget.dataset.square;
  const piece = chess.get(sq);
  const turnColor = chess.turn()==='w'?'white':'black';

  if (S.mode==="ai"){
    // Prevent moving engine side
    const you = controls.yourSide.value;
    if ((you==="white" && turnColor!=="white") || (you==="black" && turnColor!=="black")) return;
  }

  // Select or move
  if (!S.selected){
    if (piece && ((piece.color==='w' && S.orientation==='white') || (piece.color==='b' && S.orientation==='black') || true)){
      if ((piece.color==='w' && chess.turn()==='w') || (piece.color==='b' && chess.turn()==='b')){
        S.selected = sq;
        highlightLegal(sq);
      }
    }
  } else {
    if (sq===S.selected){
      S.selected = null; renderBoard();
      return;
    }
    tryMove(S.selected, sq);
  }
}

function highlightLegal(from){
  renderBoard();
  if (!controls.showLegal.checked) return;
  const moves = chess.moves({ square: from, verbose: true });
  for (const m of moves){
    const { x,y } = squareToXY(m.to);
    const size = squareSize();
    const el = document.createElement("div");
    el.className = "legal-dot";
    el.style.left = `${x*size + size/2 - (size*0.13)}px`;
    el.style.top = `${y*size + size/2 - (size*0.13)}px`;
    el.style.width = `${size*0.26}px`;
    el.style.height = `${size*0.26}px`;
    el.style.position = "absolute";
    el.style.pointerEvents = "none";
    ui.boardEl.appendChild(el);
  }
  const fromEl = [...ui.boardEl.children].find(d => d.dataset.square===from);
  fromEl?.classList.add("highlight");
}

function tryMove(from, to){
  const moves = chess.moves({ square: from, verbose: true });
  const legal = moves.find(m => m.to===to);
  if (!legal){
    // Reselect to or select new piece
    const piece = chess.get(to);
    if (piece && ((piece.color==='w' && chess.turn()==='w') || (piece.color==='b' && chess.turn()==='b'))){
      S.selected = to;
      highlightLegal(S.selected);
      return;
    }
    S.selected = null;
    renderBoard();
    return;
  }

  let promotion = "q";
  if (legal.flags.includes("p")){
    // ask promotion
    promotion = askPromotion();
  }

  const move = chess.move({ from, to, promotion });
  if (!move) return;

  if (S.sounds) beep(660, 70, "triangle", 0.03);
  S.selected = null;
  S.lastFrom = from;
  S.lastTo = to;
  moveApplied(move);
}

function askPromotion(){
  if (!HTMLDialogElement.prototype.showModal){
    // fallback
    return "q";
  }
  return new Promise(resolve => {
    ui.promoDialog.addEventListener("close", () => resolve(ui.promoDialog.returnValue || "q"), { once:true });
    ui.promoDialog.showModal();
  });
}

async function moveApplied(move){
  addMoveToList(move);
  renderBoard();
  updateGameStatus();

  if (S.mode==="ai" && !gameOver){
    // Engine or heuristic move
    const diff = controls.difficulty.value;
    const you = controls.yourSide.value;
    if ((you==="white" && chess.turn()==='b') || (you==="black" && chess.turn()==='w')){
      // engine turn
      await aiMove(diff);
    } else {
      startMoveTimer();
    }
  } else {
    startMoveTimer();
  }

  // Analysis after move
  if (S.analyzing){
    engineAnalyzePosition();
  }
}

function updateGameStatus(){
  if (chess.isCheckmate()){
    gameOver = true;
    setStatus("Checkmate");
    openResultModal("Checkmate", `${chess.turn()==='w' ? "Black" : "White"} wins`);
    return;
  }
  if (chess.isDraw()){
    gameOver = true;
    setStatus("Draw");
    openResultModal("Draw", "Stalemate or 50-move/repetition");
    return;
  }
  const turn = chess.turn()==='w' ? "White" : "Black";
  setStatus(`${turn} to move`);
}

function openResultModal(title, sub){
  const dlg = document.getElementById("modalOverlay");
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalSubtitle").textContent = sub || "";
  dlg.classList.add("open");
  dlg.setAttribute("aria-hidden", "false");
}
function closeResultModal(){
  const dlg = document.getElementById("modalOverlay");
  dlg.classList.remove("open");
  dlg.setAttribute("aria-hidden", "true");
}

function addMoveToList(move){
  const san = move.san;
  const li = document.createElement("li");
  li.textContent = `${Math.ceil(chess.history().length/2)}. ${san}`;
  if (chess.in_check()) li.classList.add("good");
  ui.moveList.appendChild(li);
  ui.moveList.scrollTop = ui.moveList.scrollHeight;
}

function startMoveTimer(){
  const sec = Number(controls.moveTimer.value);
  stopTimer();
  if (!sec) { timerHud.textContent = ""; return; }
  let remain = sec * 1000;
  tInterval = setInterval(()=>{
    remain -= 250;
    if (remain <= 0){
      clearInterval(tInterval); tInterval=null;
      const mark = chess.turn()==='w' ? "White" : "Black";
      handleTimeout(mark);
    } else {
      timerHud.textContent = `⏱️ ${chess.turn()==='w'?"White":"Black"} — ${fmtTime(remain)}`;
    }
  }, 250);
}
function stopTimer(){
  if (tInterval){ clearInterval(tInterval); tInterval = null; }
}

function flipBoard(){
  S.orientation = (S.orientation==="white") ? "black" : "white";
  renderBoard();
}

async function aiMove(difficulty){
  // If Engine mode selected and engine available, use engine
  if (difficulty==="engine" && S.engineReady){
    const best = await engineBestMove(chess.fen());
    if (best && best.bestmove){
      applyAIMoveStr(best.bestmove);
      return;
    }
  }

  // Otherwise pick heuristic: Medium = capture > center > random; Hard = 1-ply lookahead with simple score
  const verbose = chess.moves({ verbose: true });
  if (verbose.length===0) return;

  function scoreMove(m){
    // Basic MVV/LVA + center bias
    const val = pieceValue(m.captured) + centerBias(m.to) + (m.san.includes("!")?0.2:0);
    return val;
  }
  function pieceValue(p){
    if (!p) return 0;
    const v = { p:1, n:3, b:3.1, r:5, q:9, k:0 };
    return v[p.toLowerCase()] || 0;
  }
  function centerBias(to){
    const c = ['d4','e4','d5','e5'];
    return c.includes(to) ? 0.2 : 0;
  }

  let chosen = null;
  if (difficulty==="easy"){
    chosen = verbose[Math.floor(Math.random()*verbose.length)];
  } else if (difficulty==="medium"){
    chosen = verbose.slice().sort((a,b)=> scoreMove(b)-scoreMove(a))[0];
  } else { // hard
    // 1-ply lookahead
    let bestScore = -1e9, best = verbose[0];
    for (const m of verbose){
      chess.move(m);
      const opp = chess.moves({ verbose: true });
      let replyScore = 0;
      for (const r of opp) replyScore = Math.max(replyScore, scoreMove(r));
      chess.undo();
      const sc = scoreMove(m) - replyScore*0.6;
      if (sc > bestScore){ bestScore=sc; best=m; }
    }
    chosen = best;
  }

  if (typeof chosen === "object"){
    chess.move({ from: chosen.from, to: chosen.to, promotion: "q" });
    S.lastFrom = chosen.from; S.lastTo = chosen.to;
    if (S.sounds) beep(620, 70, "triangle", 0.03);
    renderBoard();
    updateGameStatus();
    startMoveTimer();
    if (S.analyzing) engineAnalyzePosition();
  }
}

function applyAIMoveStr(uci){
  const from = uci.slice(0,2), to = uci.slice(2,4);
  const promo = uci[4];
  const move = chess.move({ from, to, promotion: promo || "q" });
  if (move){
    S.lastFrom = from; S.lastTo = to;
    addMoveToList(move);
    if (S.sounds) beep(620, 70, "triangle", 0.03);
    renderBoard();
    updateGameStatus();
    startMoveTimer();
    if (S.analyzing) engineAnalyzePosition();
  }
}

/* Engine integration */
let engine = null; // worker

function engineInit(){
  engine = new Worker("engine-worker.js");
  engine.onmessage = (e)=>{
    const msg = e.data;
    if (msg.type==="ready"){
      S.engineReady = true;
      ui.engineStatus.textContent = "Engine ready";
    } else if (msg.type==="info"){
      ui.engineStatus.textContent = `depth ${msg.depth} eval ${msg.scoreText}`;
      ui.pvBox.textContent = msg.pv || "";
      if (msg.cp !== undefined || msg.mate !== undefined){
        pushEval(msg);
        drawEvalGraph();
      }
    } else if (msg.type==="bestmove"){
      // ignore here; bestmove returned to requestor in engineBestMove
    } else if (msg.type==="error"){
      ui.engineStatus.textContent = msg.message || "Engine error";
    }
  };
  engine.postMessage({ cmd:"init" });
}

function pushEval(info){
  const ply = chess.history().length;
  const entry = { ply, cp: info.cp, mate: info.mate };
  const last = S.evalHistory[S.evalHistory.length-1];
  if (!last || last.ply !== ply){
    S.evalHistory.push(entry);
  } else {
    S.evalHistory[S.evalHistory.length-1] = entry;
  }
}

function engineAnalyzePosition(){
  if (!S.engineReady) return;
  const fen = chess.fen();
  engine.postMessage({
    cmd:"analyze",
    fen,
    depth: Number(controls.depthRange.value),
    multipv: Math.max(1, Math.min(5, Number(controls.multiPV.value)))
  });
}

function engineBestMove(fen){
  return new Promise(res=>{
    if (!S.engineReady) return res(null);
    const onMsg = (e)=>{
      const m = e.data;
      if (m.type==="bestmove"){
        engine.removeEventListener("message", onMsg);
        res(m);
      }
    };
    engine.addEventListener("message", onMsg);
    engine.postMessage({ cmd:"bestmove", fen, movetime: 1200, depth: Number(controls.depthRange.value) });
  });
}

function drawEvalGraph(){
  const ctx = ui.evalGraph.getContext("2d");
  const W = ui.evalGraph.width, H = ui.evalGraph.height;
  ctx.clearRect(0,0,W,H);
  if (S.evalHistory.length===0) return;
  const maxCP = 300; // clamp +/- 3 pawns
  ctx.beginPath();
  ctx.strokeStyle = "#5b8dff";
  const n = S.evalHistory.length;
  for (let i=0;i<n;i++){
    const e = S.evalHistory[i];
    const val = (e.mate!==undefined) ? (e.mate>0? maxCP : -maxCP) : Math.max(-maxCP, Math.min(maxCP, e.cp || 0));
    const x = (i/(n-1)) * (W-8) + 4;
    const y = H/2 - (val/maxCP) * (H/2 - 4);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

/* Editor (simple): click to clear/set a piece cycling through [empty, P, N, B, R, Q, K, p, n, b, r, q, k] */
let editorCycle = ["", "P","N","B","R","Q","K","p","n","b","r","q","k"];
let editorIndex = 0;
function startEditor(){
  S.editor = true; controls.exitEditor.disabled = false; controls.startEditor.disabled = true;
  setStatus("Editor: tap squares to cycle pieces; Done to apply.");
}
function exitEditor(){
  S.editor = false; controls.exitEditor.disabled = true; controls.startEditor.disabled = false;
  setStatus("Editor closed.");
}
function editorPointerDown(e){
  const sq = e.currentTarget.dataset.square;
  editorIndex = (editorIndex + 1) % editorCycle.length;
  const code = editorCycle[editorIndex];
  const fenParts = chess.fen().split(" ");
  let boardMap = readBoardArray();
  // apply
  setBoardSquare(boardMap, sq, code);
  const fen = boardArrayToFen(boardMap) + " " + fenParts.slice(1).join(" ");
  chess = new Chess(fen);
  renderBoard();
}
function readBoardArray(){
  const arr = [];
  for (let rank=8; rank>=1; rank--){
    const row = [];
    for (let file=0; file<8; file++){
      const sq = "abcdefgh"[file] + rank;
      const p = chess.get(sq);
      row.push(p ? (p.color==='w'?p.type.toUpperCase():p.type) : "");
    }
    arr.push(row);
  }
  return arr; // 8x8 from rank8...1
}
function setBoardSquare(arr, sq, code){
  const file = "abcdefgh".indexOf(sq[0]); const rank = 8 - Number(sq[1]);
  arr[rank][file] = code;
}
function boardArrayToFen(arr){
  // arr rank8..1, file a..h
  const ranks = arr.map(row=>{
    let fen=""; let empty=0;
    for (const cell of row){
      if (!cell){ empty++; }
      else {
        if (empty>0){ fen += empty; empty=0; }
        fen += cell;
      }
    }
    if (empty>0) fen += empty;
    return fen;
  });
  return ranks.join("/") + " " + (chess.turn()==='w'?"w":"b") + " KQkq - 0 1";
}

/* PGN / FEN */
function copyFEN(){ navigator.clipboard?.writeText(chess.fen()); setStatus("FEN copied."); }
async function pasteFEN(){
  const t = prompt("Paste FEN:");
  if (!t) return;
  try{
    const test = new Chess(t);
    chess = test;
    S.lastFrom = S.lastTo = null;
    renderBoard();
    setStatus("FEN loaded.");
    if (S.analyzing) engineAnalyzePosition();
  }catch{ alert("Invalid FEN"); }
}
function exportPGN(){
  const pgn = chess.pgn({ max_width: 100, newline_char: "\n" });
  controls.pgnBox.value = pgn;
  controls.pgnBox.select?.();
  document.execCommand?.("copy");
  setStatus("PGN ready (copied to box).");
}
function importPGN(){
  const pgn = controls.pgnBox.value.trim();
  if (!pgn){ alert("Paste PGN into the box."); return; }
  try{
    chess = new Chess(); chess.load_pgn(pgn);
    S.lastFrom = S.lastTo = null; renderBoard();
    setStatus("PGN loaded.");
    if (S.analyzing) engineAnalyzePosition();
  }catch{ alert("Invalid PGN."); }
}

/* Replay (from current game) */
function openReplay(){
  const moves = chess.history({ verbose:true });
  const data = { N: 8, WIN_LEN: 0, moves: moves.map(m=>({ index: m.from+m.to, mark: m.piece })) }; // we will just step SAN in place
  controls.replayMeta.textContent = `Moves: ${moves.length}`;
  controls.replayOverlay.classList.add("open");
}
function closeReplay(){
  controls.replayOverlay.classList.remove("open");
}

/* Events */
controls.themeToggle.addEventListener("click", applyTheme);
controls.soundToggle.addEventListener("change", ()=>{ S.sounds = controls.soundToggle.checked; });

controls.boardTheme.addEventListener("change", ()=> setBoardTheme(controls.boardTheme.value));
controls.newGame.addEventListener("click", ()=>{ newGame(); });
controls.undoBtn.addEventListener("click", ()=>{ if (chess.history().length){ chess.undo(); S.lastFrom=S.lastTo=null; renderBoard(); setStatus("Move undone"); if (S.analyzing) engineAnalyzePosition(); } });
controls.flipBtn.addEventListener("click", flipBoard);
controls.prevMove.addEventListener("click", ()=>{
  const h = chess.history({ verbose:true }); if (h.length===0) return;
  chess.undo(); renderBoard();
});
controls.nextMove.addEventListener("click", ()=>{
  // Not storing forward list here for brevity
});

controls.analyzeToggle.addEventListener("click", ()=>{
  S.analyzing = !S.analyzing;
  controls.analyzeToggle.textContent = S.analyzing ? "Analyzing…" : "Live analyze";
  if (S.analyzing) engineAnalyzePosition();
});
controls.depthRange.addEventListener("input", ()=> S.engineDepth = Number(controls.depthRange.value));
controls.multiPV.addEventListener("change", ()=> S.engineMultiPV = Math.max(1, Math.min(5, Number(controls.multiPV.value))));

controls.copyFEN.addEventListener("click", copyFEN);
controls.pasteFEN.addEventListener("click", pasteFEN);
controls.exportPGN.addEventListener("click", exportPGN);
controls.importPGN.addEventListener("click", importPGN);
controls.startEditor.addEventListener("click", startEditor);
controls.exitEditor.addEventListener("click", exitEditor);

document.getElementById("modalOverlay")?.addEventListener("click", (e)=>{ if (e.target.id==="modalOverlay") closeResultModal(); });
document.getElementById("closeModal")?.addEventListener("click", closeResultModal);
document.getElementById("playAgain")?.addEventListener("click", ()=>{ closeResultModal(); newGame(); });

controls.openReplay.addEventListener("click", openReplay);
controls.closeReplay.addEventListener("click", closeReplay);
controls.stepForward.addEventListener("click", replayStepForward);
controls.stepBack.addEventListener("click", replayStepBack);
controls.restartReplay.addEventListener("click", replayRestart);
controls.replayPlay.addEventListener("click", ()=>{
  if (replayTimer){ clearInterval(replayTimer); replayTimer=null; controls.replayPlay.textContent="▶️ Play"; return; }
  controls.replayPlay.textContent="⏸️ Pause";
  const sp = Number(controls.replaySpeed.value||"1");
  replayTimer = setInterval(()=>{
    // Here we’d step a snapshot; simplified for brevity
    replayStepForward();
  }, Math.max(150, Math.round(700/sp)));
});

controls.mode.addEventListener("change", ()=>{
  const isAI = controls.mode.value==="ai";
  controls.difficulty.disabled = !isAI;
  document.getElementById("yourSideWrap").style.display = isAI?"grid":"none";
});
controls.moveTimer.addEventListener("change", ()=> startMoveTimer());

/* Board key nav */
ui.boardEl.addEventListener("keydown", (e)=>{
  if (e.key==="Escape"){ S.selected=null; renderBoard(); }
});

/* Engine init */
engineInit();

/* Init */
applyThemeFromPref();
setBoardTheme(controls.boardTheme.value);
function init(){
  renderBoard();
  newGame();
}
window.addEventListener("load", init);

/* ===== Engine Worker helpers ===== */
async function engineBestMoveWrapper(depth=Number(controls.depthRange.value)){
  return engineBestMove(chess.fen(), depth);
}

/* ===== Sounds and helpers already above ===== */
