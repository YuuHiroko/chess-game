// Stockfish wrapper worker.
// Tries local engine/stockfish.js first (if you drop one), otherwise loads from pinned CDNs.
// Messages:
//  - { cmd:"init", cdn:[urls...] }
//  - { cmd:"analyze", fen, depth, multipv }
//  - { cmd:"bestmove", fen, depth?, movetime? }
// Replies:
//  - { type:"ready" }
//  - { type:"info", depth, cp?, mate?, scoreText, pv }
//  - { type:"bestmove", bestmove }
//  - { type:"error", message }

let sf = null;
let ready = false;

function postErr(msg){ postMessage({ type:"error", message: msg }); }

async function loadEngine(urls){
  // Try local
  try{ importScripts("engine/stockfish.js"); sf = self; }catch{}
  if (!sf){
    for (const u of urls){
      try{ importScripts(u); sf = self; break; }catch{}
    }
  }
  if (!sf){ postErr("Engine failed to load. Try once online to cache it."); return; }

  // init UCI
  sf.onmessage = onSF;
  sf.postMessage("uci");
  sf.postMessage("isready");
}

function onSF(e){
  const line = (typeof e.data === "string") ? e.data : (e.data?.data || "");
  if (!line) return;
  if (line.startsWith("readyok")){ ready = true; postMessage({ type:"ready" }); }
  if (line.startsWith("info")){
    const depth = token(line,"depth");
    const scoreType = token(line,"score");
    let cp, mate, pv="";
    if (scoreType==="cp") cp = parseInt(next(line,"score cp"));
    if (scoreType==="mate") mate = parseInt(next(line,"score mate"));
    const i=line.indexOf(" pv "); if (i>=0) pv=line.slice(i+4);
    postMessage({ type:"info", depth: depth?parseInt(depth):undefined, cp, mate, scoreText: mate!==undefined?("#"+mate):((cp/100)||"0"), pv });
  }
  if (line.startsWith("bestmove")){
    const parts=line.split(/\s+/);
    postMessage({ type:"bestmove", bestmove: parts[1] });
  }
}
function token(line, key){
  const m = line.match(new RegExp("\\b"+key+"\\s+(\\S+)"));
  return m ? m[1] : undefined;
}
function next(line, prefix){
  const i=line.indexOf(prefix); if (i<0) return undefined;
  const s=line.slice(i+prefix.length).trim(); return s.split(/\s+/)[0];
}

onmessage = (e)=>{
  const m = e.data;
  if (m.cmd==="init"){ loadEngine(m.cdn||[]); }
  else if (!ready){ /* queue? */ }
  else if (m.cmd==="analyze"){
    sf.postMessage("stop");
    sf.postMessage("setoption name MultiPV value "+(m.multipv||1));
    sf.postMessage("position fen "+m.fen);
    sf.postMessage(`go depth ${m.depth||16}`);
  } else if (m.cmd==="bestmove"){
    sf.postMessage("stop");
    sf.postMessage("position fen "+m.fen);
    if (m.movetime) sf.postMessage(`go movetime ${m.movetime}`); else sf.postMessage(`go depth ${m.depth||16}`);
  }
};
