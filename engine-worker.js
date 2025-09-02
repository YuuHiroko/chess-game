// Wrapper worker for Stockfish engine as a nested worker.
// Place engine/stockfish.js (WASM build) in /engine. Some builds require stockfish.wasm alongside.
//
// Messages:
// { cmd:"init" }
// { cmd:"analyze", fen, depth, multipv }
// { cmd:"bestmove", fen, depth?, movetime? }
//
// Responses:
// { type:"ready" }
// { type:"info", depth, cp?, mate?, scoreText, pv }
// { type:"bestmove", bestmove }
// { type:"error", message }

let engine = null;
let ready = false;

function spawnEngine(){
  try{
    engine = new Worker("engine/stockfish.js");
    engine.onmessage = (e)=>{
      const line = (typeof e.data === "string") ? e.data : (e.data?.data || "");
      if (!line) return;
      // Parse UCI info
      if (line.startsWith("Stockfish")) {
        // ignore banner
      } else if (line.startsWith("uciok")){
        // ok
      } else if (line.startsWith("readyok")){
        ready = true;
        postMessage({ type:"ready" });
      } else if (line.startsWith("info")){
        const depth = parseInt(getTok(line, "depth")) || undefined;
        const pv = capturePV(line);
        const scoreT = getTok(line, "score");
        let cp, mate;
        if (scoreT==="cp") cp = parseInt(nextTok(line, "score cp"));
        if (scoreT==="mate") mate = parseInt(nextTok(line, "score mate"));
        postMessage({ type:"info", depth, cp, mate, scoreText: scoreString(cp, mate), pv });
      } else if (line.startsWith("bestmove")){
        const parts = line.split(" ");
        postMessage({ type:"bestmove", bestmove: parts[1] });
      }
    };
    engine.postMessage("uci");
    engine.postMessage("isready");
  }catch(e){
    postMessage({ type:"error", message: "Engine not loaded. Place engine/stockfish.js (+.wasm) and serve over http(s)." });
  }
}
spawnEngine();

function getTok(line, key){
  const re = new RegExp("\\b"+key+"\\s+(\\S+)");
  const m = line.match(re);
  return m ? m[1] : undefined;
}
function nextTok(line, prefix){
  const i = line.indexOf(prefix);
  if (i<0) return undefined;
  const tail = line.slice(i + prefix.length).trim();
  return tail.split(/\s+/)[0];
}
function capturePV(line){
  const i = line.indexOf(" pv ");
  if (i<0) return "";
  return line.slice(i+4).trim();
}
function scoreString(cp, mate){
  if (mate!==undefined) return `#${mate}`;
  if (cp===undefined) return "";
  return (cp/100).toFixed(2);
}

onmessage = (e)=>{
  const m = e.data;
  if (!engine) return;
  if (m.cmd==="init"){
    // already spawned
  } else if (m.cmd==="analyze"){
    engine.postMessage("stop");
    engine.postMessage("setoption name MultiPV value " + (m.multipv || 1));
    engine.postMessage("position fen " + m.fen);
    engine.postMessage(`go depth ${m.depth || 16}`);
  } else if (m.cmd==="bestmove"){
    engine.postMessage("stop");
    engine.postMessage("position fen " + m.fen);
    if (m.movetime) engine.postMessage(`go movetime ${m.movetime}`);
    else engine.postMessage(`go depth ${m.depth || 16}`);
  }
};
