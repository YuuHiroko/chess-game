// Stockfish wrapper worker (WASM via stockfish.js).
// Tries local engine/stockfish.js first, then CDN URLs provided by main thread.
// Messages:
//  { cmd:"init", cdn:[urls...] }
//  { cmd:"analyze", fen, depth, multipv }
//  { cmd:"bestmove", fen, depth?, movetime? }
// Replies:
//  { type:"ready" } | { type:"info", depth, cp?, mate?, scoreText, pv } | { type:"bestmove", bestmove } | { type:"error", message }

let sf = null;
let ready = false;

function postErr(msg){ postMessage({ type:"error", message: msg }); }

function token(line, key){
  const m = line.match(new RegExp("\\b"+key+"\\s+(\\S+)")); return m ? m[1] : undefined;
}
function nextTok(line, prefix){
  const i=line.indexOf(prefix); if (i<0) return undefined;
  const s=line.slice(i+prefix.length).trim(); return s.split(/\s+/)[0];
}

function onSF(e){
  const line = (typeof e.data === "string") ? e.data : (e.data?.data || "");
  if (!line) return;
  if (line.startsWith("readyok")){ ready = true; postMessage({ type:"ready" }); }
  if (line.startsWith("info")){
    const depth = parseInt(token(line,"depth")) || undefined;
    const st = token(line,"score");
    let cp, mate; if (st==="cp") cp=parseInt(nextTok(line,"score cp")); if (st==="mate") mate=parseInt(nextTok(line,"score mate"));
    const i=line.indexOf(" pv "); const pv = i>=0 ? line.slice(i+4) : "";
    postMessage({ type:"info", depth, cp, mate, scoreText: mate!==undefined?("#"+mate):((cp!==undefined)?(cp/100).toFixed(2):""), pv });
  }
  if (line.startsWith("bestmove")){
    const parts=line.split(/\s+/); postMessage({ type:"bestmove", bestmove: parts[1] });
  }
}

async function loadEngine(urls){
  try{ importScripts("engine/stockfish.js"); sf=self; }catch{}
  if (!sf){
    for (const u of urls){
      try{ importScripts(u); sf=self; break; }catch{}
    }
  }
  if (!sf){ postErr("Engine failed to load. Try once online to cache it."); return; }
  sf.onmessage = onSF;
  sf.postMessage("uci");
  sf.postMessage("isready");
}

onmessage = (e)=>{
  const m = e.data;
  if (m.cmd==="init"){ loadEngine(m.cdn||[]); return; }
  if (!sf || !ready) return;
  if (m.cmd==="analyze"){
    sf.postMessage("stop");
    sf.postMessage("setoption name MultiPV value "+(m.multipv||1));
    sf.postMessage("position fen "+m.fen);
    sf.postMessage(`go depth ${m.depth||18}`);
  } else if (m.cmd==="bestmove"){
    sf.postMessage("stop");
    sf.postMessage("position fen "+m.fen);
    if (m.movetime) sf.postMessage(`go movetime ${m.movetime}`); else sf.postMessage(`go depth ${m.depth||18}`);
  }
};
