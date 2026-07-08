import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const PROXY  = "https://shah-jee-proxy-production.up.railway.app";
const PAIRS  = ["BTC/USDT","ETH/USDT","SOL/USDT"];
const SEED   = {"BTC/USDT":61000,"ETH/USDT":1620,"SOL/USDT":67};
const DP     = {"BTC/USDT":1,"ETH/USDT":2,"SOL/USDT":3};
const ICON   = {"BTC/USDT":"₿","ETH/USDT":"Ξ","SOL/USDT":"◎"};
const GRAD   = {"BTC/USDT":["#f7931a","#ff6b00"],"ETH/USDT":["#627eea","#a78bfa"],"SOL/USDT":["#9945ff","#14f195"]};
// Weex contract sizes (coins per contract)
const CS     = {"BTC/USDT":0.001,"ETH/USDT":0.01,"SOL/USDT":0.1};

// ─────────────────────────────────────────────────────────────────────────────
// INDICATORS
// ─────────────────────────────────────────────────────────────────────────────
function iEMA(closes,p){
  if(!closes||closes.length<2)return closes?.[0]||0;
  const k=2/(p+1);
  let e=closes.slice(0,Math.min(p,closes.length)).reduce((a,b)=>a+b,0)/Math.min(p,closes.length);
  for(let i=Math.min(p,closes.length);i<closes.length;i++)e=closes[i]*k+e*(1-k);
  return e;
}
function iRSI(closes,p=14){
  if(closes.length<p+1)return 50;
  let g=0,l=0;
  for(let i=closes.length-p;i<closes.length;i++){const d=closes[i]-closes[i-1];d>0?g+=d:l-=d;}
  return 100-100/(1+(g/(l||1e-9)));
}
function iATR(candles,p=14){
  if(!candles||candles.length<2)return 1;
  const s=candles.slice(-Math.min(p+1,candles.length));
  return s.map((c,i)=>i===0?c.h-c.l:Math.max(c.h-c.l,Math.abs(c.h-s[i-1].c),Math.abs(c.l-s[i-1].c))).reduce((a,b)=>a+b,0)/s.length;
}
function iBB(closes,p=20){
  const last=closes?.[closes.length-1]||0;
  if(!closes||closes.length<p)return{u:last*1.02,m:last,lo:last*0.98};
  const s=closes.slice(-p),m=s.reduce((a,b)=>a+b,0)/p;
  const sd=Math.sqrt(s.reduce((a,b)=>a+(b-m)**2,0)/p);
  return{u:m+2*sd,m,lo:m-2*sd};
}
function iMACD(closes){return iEMA(closes,12)-iEMA(closes,26);}
function iStoch(candles,p=14){
  const s=candles?.slice(-p);if(!s?.length)return 50;
  const hi=Math.max(...s.map(c=>c.h)),lo=Math.min(...s.map(c=>c.l));
  return((candles[candles.length-1].c-lo)/(hi-lo||1))*100;
}
function iVWAP(candles){
  if(!candles||candles.length<2)return 0;
  const s=candles.slice(-48),tv=s.reduce((a,c)=>a+c.v,0);
  return s.reduce((a,c)=>a+(((c.h+c.l+c.c)/3)*c.v),0)/(tv||1);
}

// ─────────────────────────────────────────────────────────────────────────────
// CANDLE SEED
// ─────────────────────────────────────────────────────────────────────────────
function makeCandles(base,n=120){
  let p=base;
  return Array.from({length:n},(_,i)=>{
    const chg=(Math.random()-0.49)*p*0.006,o=p,c=p+chg;
    const h=Math.max(o,c)+Math.random()*p*0.002,l=Math.min(o,c)-Math.random()*p*0.002;
    p=c;return{o,h,l,c,v:50+Math.random()*200,t:Date.now()-(n-i)*900000};
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fp=(pair,v)=>v||v===0?Number(v).toLocaleString("en-US",{minimumFractionDigits:DP[pair],maximumFractionDigits:DP[pair]}):"—";
const SC=s=>s==="BUY"?"#00ff88":s==="SELL"?"#ff4466":"#ffd700";
const SBG=s=>s==="BUY"?"rgba(0,255,136,0.12)":s==="SELL"?"rgba(255,68,102,0.12)":"rgba(255,215,0,0.08)";
const glass=(ex={})=>({background:"rgba(255,255,255,0.05)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:18,padding:"14px 16px",marginBottom:12,...ex});
const mini=(ex={})=>({background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"10px 12px",...ex});
const pill=(bg,c,ex={})=>({fontSize:11,padding:"3px 10px",borderRadius:20,background:bg,color:c,fontWeight:600,...ex});
const btn=(bg,c,bd="transparent",ex={})=>({padding:"10px 18px",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:13,background:bg,color:c,border:`1.5px solid ${bd}`,...ex});

// ─────────────────────────────────────────────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────────────────────────────────────────────
function Spark({data,colors,w=120,h=44}){
  const ref=useRef();
  useEffect(()=>{
    const cv=ref.current;if(!cv||!data||data.length<2)return;
    const ctx=cv.getContext("2d");ctx.clearRect(0,0,w,h);
    const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;
    const pts=data.map((v,i)=>({x:(i/(data.length-1))*w,y:h-4-((v-mn)/rng)*(h-8)}));
    const gL=ctx.createLinearGradient(0,0,w,0);
    gL.addColorStop(0,colors[0]+"99");gL.addColorStop(1,colors[1]+"99");
    const gA=ctx.createLinearGradient(0,0,0,h);
    gA.addColorStop(0,colors[0]+"33");gA.addColorStop(1,colors[0]+"00");
    ctx.beginPath();ctx.moveTo(pts[0].x,h);
    pts.forEach(p=>ctx.lineTo(p.x,p.y));
    ctx.lineTo(pts[pts.length-1].x,h);ctx.closePath();
    ctx.fillStyle=gA;ctx.fill();
    ctx.beginPath();ctx.strokeStyle=gL;ctx.lineWidth=2;ctx.lineJoin="round";ctx.lineCap="round";
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.stroke();
  },[data,colors,w,h]);
  return <canvas ref={ref} width={w} height={h} style={{display:"block"}}/>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADE APPROVAL MODAL — shown before every trade
// User sets leverage + amount, then approves or rejects
// ─────────────────────────────────────────────────────────────────────────────
function TradeModal({signal, onApprove, onReject, maxUSDT}){
  const [lev, setLev]   = useState(10);
  const [pct, setPct]   = useState(10); // % of wallet
  if(!signal)return null;

  const usdt    = Math.min(maxUSDT*(pct/100), maxUSDT).toFixed(2);
  const price   = signal.price||0;
  const dp      = DP[signal.pair]||2;
  const cs      = CS[signal.pair]||0.01;
  const contracts = price>0 ? Math.max(1,Math.floor((parseFloat(usdt)*lev)/(cs*price))) : 1;
  const notional  = contracts*cs*price;
  const margin    = (notional/lev).toFixed(2);
  const potProfit = ((notional*(signal.rr||2)/1)*0.01*lev).toFixed(2);
  const [c1,c2]   = GRAD[signal.pair]||["#fff","#aaa"];
  const isBuy     = signal.signal==="BUY";

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(10px)",padding:16}}>
      <div style={{background:"linear-gradient(135deg,#0f0c29,#1a1640)",border:`2px solid ${isBuy?"rgba(0,255,136,0.4)":"rgba(255,68,102,0.4)"}`,borderRadius:24,padding:24,maxWidth:380,width:"100%"}}>

        {/* Header */}
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:36,marginBottom:8}}>{isBuy?"📈":"📉"}</div>
          <div style={{fontSize:22,fontWeight:800,color:isBuy?"#00ff88":"#ff4466"}}>{signal.signal} {signal.pair}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>{signal.strategy} · {signal.confidence}% confidence</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:4,fontStyle:"italic"}}>"{signal.reason}"</div>
        </div>

        {/* Signal levels */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:16}}>
          {[["Entry",`$${Number(signal.entry||signal.price).toFixed(dp)}`,"#fff"],["Stop Loss",`$${Number(signal.sl).toFixed(dp)}`,"#ff4466"],["Take Profit",`$${Number(signal.tp2).toFixed(dp)}`,"#00ff88"]].map(([l,v,c])=>(
            <div key={l} style={{background:"rgba(255,255,255,0.07)",borderRadius:10,padding:"8px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",marginBottom:3}}>{l}</div>
              <div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Leverage selector */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginBottom:8,fontWeight:600}}>LEVERAGE</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[1,2,5,10,20,25,50].map(l=>(
              <button key={l} onClick={()=>setLev(l)} style={{padding:"7px 14px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:700,background:lev===l?`linear-gradient(135deg,${c1},${c2})`:"rgba(255,255,255,0.08)",color:lev===l?"#fff":"rgba(255,255,255,0.5)",border:`1px solid ${lev===l?c1+"88":"rgba(255,255,255,0.1)"}`}}>
                {l}x
              </button>
            ))}
          </div>
        </div>

        {/* Amount selector */}
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.5)",fontWeight:600}}>USDT AMOUNT</span>
            <span style={{fontSize:12,color:"#ffd700",fontWeight:700}}>${usdt} ({pct}% of wallet)</span>
          </div>
          <input type="range" min="5" max="100" value={pct} onChange={e=>setPct(Number(e.target.value))}
            style={{width:"100%",accentColor:c1,height:4,cursor:"pointer"}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:4}}>
            <span>5%</span><span>50%</span><span>100%</span>
          </div>
        </div>

        {/* Trade summary */}
        <div style={{background:"rgba(0,0,0,0.3)",borderRadius:12,padding:"12px 14px",marginBottom:16,border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[["Contracts",contracts],["Margin Req",`$${margin}`],["Notional",`$${notional.toFixed(2)}`],["Est. Profit",`+$${potProfit}`]].map(([l,v])=>(
              <div key={l}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{l}</div>
                <div style={{fontSize:14,fontWeight:700,color:l==="Est. Profit"?"#00ff88":"#fff"}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button onClick={onReject} style={{...btn("rgba(255,255,255,0.07)","rgba(255,255,255,0.5)","rgba(255,255,255,0.15)"),padding:"13px"}}>
            ✕ Skip
          </button>
          <button onClick={()=>onApprove({leverage:lev,usdtAmount:parseFloat(usdt)})} style={{...btn(isBuy?"linear-gradient(135deg,#00c853,#00ff88)":"linear-gradient(135deg,#d50000,#ff4466)","#fff"),padding:"13px",fontSize:15}}>
            {isBuy?"📈 BUY":"📉 SELL"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMERGENCY MODAL
// ─────────────────────────────────────────────────────────────────────────────
function EmergencyModal({show,done,loading,onConfirm,onClose}){
  if(!show)return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,backdropFilter:"blur(8px)"}}>
      <div style={{background:"#0f0c29",border:"2px solid rgba(255,0,60,0.5)",borderRadius:24,padding:"28px 24px",maxWidth:320,width:"90%",textAlign:"center"}}>
        {!done?(
          <>
            <div style={{fontSize:52,marginBottom:12}}>🚨</div>
            <div style={{fontSize:20,fontWeight:800,color:"#ff0044",marginBottom:10}}>Emergency Stop</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",lineHeight:1.8,marginBottom:20}}>
              Stops bot completely.<br/>Closes ALL open positions on Weex.<br/>
              <b style={{color:"#ff4466"}}>No more trades until you manually restart.</b>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={onClose} style={{...btn("rgba(255,255,255,0.07)","rgba(255,255,255,0.6)","rgba(255,255,255,0.15)"),padding:"12px"}}>Cancel</button>
              <button onClick={onConfirm} disabled={loading} style={{...btn("linear-gradient(135deg,#ff0044,#ff4466)","#fff"),padding:"12px",opacity:loading?0.7:1}}>
                {loading?"Closing…":"🚨 STOP ALL"}
              </button>
            </div>
          </>
        ):(
          <>
            <div style={{fontSize:52,marginBottom:12}}>✅</div>
            <div style={{fontSize:18,fontWeight:800,color:"#00ff88",marginBottom:8}}>All Stopped</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:20}}>Bot locked. Positions closed on Weex.<br/>Press Start Bot to resume trading.</div>
            <button onClick={onClose} style={{...btn("rgba(0,255,136,0.15)","#00ff88","rgba(0,255,136,0.35)"),width:"100%",padding:"11px"}}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEX TAB
// ─────────────────────────────────────────────────────────────────────────────
function WeexTab({weexConnected,weexBalance,weexKey,setWeexKey,weexSecret,setWeexSecret,weexPassphrase,setWeexPassphrase,connecting,connectWeex,disconnectWeex}){
  if(!weexConnected)return(
    <div>
      <div style={{...glass({background:"linear-gradient(135deg,rgba(108,92,231,0.2),rgba(56,189,248,0.1))",marginBottom:16})}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>🔗 Connect Weex Account</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",lineHeight:1.7}}>One API key covers Spot and Futures. Enable <b style={{color:"#fff"}}>Read + Trade</b> permissions only.</div>
      </div>
      <div style={glass()}>
        {[["API KEY",weexKey,setWeexKey,"Your Weex API key","text"],["API SECRET",weexSecret,setWeexSecret,"Your Weex API secret","password"],["PASSPHRASE",weexPassphrase,setWeexPassphrase,"Your API passphrase","password"]].map(([label,val,setter,ph,type])=>(
          <div key={label} style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:600}}>{label}</div>
            <input value={val} onChange={e=>setter(e.target.value)} placeholder={ph} type={type}
              style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"11px 14px",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
        ))}
        <button onClick={connectWeex} disabled={connecting} style={{...btn("linear-gradient(135deg,#6c5ce7,#a78bfa)","#fff"),width:"100%",padding:"12px",opacity:connecting?0.6:1}}>
          {connecting?"Connecting…":"🔗 Connect"}
        </button>
        <div style={{marginTop:12,padding:"10px",background:"rgba(255,215,0,0.08)",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)",fontSize:12,color:"rgba(255,215,0,0.8)"}}>
          ⚠️ Read + Trade only. Never enable Withdraw.
        </div>
      </div>
    </div>
  );

  const futUSDT = parseFloat(weexBalance?.futures?.USDT?.available||0);
  const spotUSDT= parseFloat(weexBalance?.spot?.USDT?.available||0);

  return(
    <div>
      <div style={{...glass({background:"linear-gradient(135deg,rgba(0,255,136,0.1),rgba(56,189,248,0.08))",borderColor:"rgba(0,255,136,0.3)",marginBottom:12})}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:38,height:38,borderRadius:10,background:"rgba(0,255,136,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>✅</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"#00ff88"}}>Weex Connected</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Live trading active</div>
          </div>
        </div>
      </div>

      <div style={glass()}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Account Balance</div>
        {spotUSDT>0&&(
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:"#a78bfa",fontWeight:600,marginBottom:6}}>SPOT WALLET</div>
            {Object.entries(weexBalance.spot||{}).map(([asset,bal])=>(
              <div key={asset} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:13}}>
                <span style={{fontWeight:600}}>{asset}</span>
                <span style={{fontWeight:700}}>{parseFloat(bal.available).toFixed(asset==="USDT"?2:6)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{fontSize:11,color:"#38bdf8",fontWeight:600,marginBottom:6}}>FUTURES WALLET (USDT-M)</div>
        {futUSDT>0?(
          <div>
            <div style={{fontSize:24,fontWeight:800,color:"#38bdf8",marginBottom:4}}>${futUSDT.toFixed(2)} <span style={{fontSize:12,color:"rgba(255,255,255,0.4)",fontWeight:400}}>USDT available</span></div>
            {parseFloat(weexBalance.futures?.USDT?.unrealized||0)!==0&&(
              <div style={{fontSize:13,color:parseFloat(weexBalance.futures?.USDT?.unrealized)>=0?"#00ff88":"#ff4466",fontWeight:600}}>
                Unrealized PnL: {parseFloat(weexBalance.futures?.USDT?.unrealized)>=0?"+":""}${parseFloat(weexBalance.futures?.USDT?.unrealized).toFixed(2)}
              </div>
            )}
          </div>
        ):(
          <div style={{padding:"10px",background:"rgba(255,215,0,0.08)",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)",fontSize:12,color:"#ffd700"}}>
            ⚠️ No futures balance found. Transfer USDT to your Weex futures wallet.
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <button onClick={connectWeex} disabled={connecting} style={{...btn("rgba(0,255,136,0.12)","#00ff88","rgba(0,255,136,0.3)"),padding:"11px",textAlign:"center",opacity:connecting?0.6:1}}>
          {connecting?"…":"🔄 Refresh"}
        </button>
        <button onClick={disconnectWeex} style={{...btn("rgba(255,68,102,0.12)","#ff4466","rgba(255,68,102,0.3)"),padding:"11px",textAlign:"center"}}>Disconnect</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]               = useState("markets");
  const [selPair,setSelPair]       = useState("BTC/USDT");
  const [running,setRunning]       = useState(false);
  // TRADING MODE: "manual" = AI signals → approval modal before trade
  //               "auto"   = AI trades automatically with risk management
  const [tradeMode,setTradeMode]   = useState("manual");
  // LOCK: set to true after emergency stop — must manually press Start Bot
  const [locked,setLocked]         = useState(false);

  // Weex
  const [weexKey,setWeexKey]             = useState("");
  const [weexSecret,setWeexSecret]       = useState("");
  const [weexPassphrase,setWeexPassphrase] = useState("");
  const [weexConnected,setWeexConnected] = useState(false);
  const [weexBalance,setWeexBalance]     = useState(null);
  const [connecting,setConnecting]       = useState(false);

  // Market data
  const [prices,setPrices]         = useState({...SEED});
  const [candles,setCandles]       = useState(()=>Object.fromEntries(PAIRS.map(p=>[p,makeCandles(SEED[p])])));
  const [priceSource,setPriceSource] = useState("Simulation");

  // Trading state
  const [wallet,setWallet]         = useState({USDT:0,BTC:0,ETH:0,SOL:0});
  const [startBal,setStartBal]     = useState(0);
  const [signals,setSignals]       = useState({});
  const [positions,setPositions]   = useState({});
  const [trades,setTrades]         = useState([]);
  const [pnlHist,setPnlHist]       = useState([]);
  const [aiLoading,setAiLoading]   = useState({});
  const [pendingSignal,setPendingSignal] = useState(null); // waiting for user approval

  // Emergency
  const [showEmergency,setShowEmergency]       = useState(false);
  const [emergencyLoading,setEmergencyLoading] = useState(false);
  const [emergencyDone,setEmergencyDone]       = useState(false);

  // Logs
  const [logs,setLogs] = useState([{msg:"Shah Jee Bot v3.0 ready. Connect Weex → set Manual or Auto → Start Bot.",type:"info",ts:new Date().toLocaleTimeString()}]);

  // Refs — prevent stale closures
  const aiTimer    = useRef(null);
  const modeRef    = useRef("manual");
  const lockedRef  = useRef(false);
  const weexRef    = useRef({connected:false,key:"",secret:"",passphrase:""});
  const walletRef  = useRef({USDT:0});
  const pricesRef  = useRef({...SEED});
  const posRef     = useRef({});

  useEffect(()=>{ modeRef.current=tradeMode; },[tradeMode]);
  useEffect(()=>{ lockedRef.current=locked; },[locked]);
  useEffect(()=>{ weexRef.current={connected:weexConnected,key:weexKey,secret:weexSecret,passphrase:weexPassphrase}; },[weexConnected,weexKey,weexSecret,weexPassphrase]);
  useEffect(()=>{ walletRef.current=wallet; },[wallet]);
  useEffect(()=>{ pricesRef.current=prices; },[prices]);
  useEffect(()=>{ posRef.current=positions; },[positions]);

  const ts=()=>new Date().toLocaleTimeString();
  const addLog=useCallback((msg,type="info")=>setLogs(l=>[{msg,type,ts:ts()},...l].slice(0,120)),[]);

  // ── Portfolio ──────────────────────────────────────────────────────────────
  const totalVal=useCallback(()=>{
    let t=walletRef.current.USDT;
    PAIRS.forEach(p=>{t+=(walletRef.current[p.split("/")[0]]||0)*(pricesRef.current[p]||0);});
    return t;
  },[]);

  useEffect(()=>{
    const tv=totalVal();
    if(tv>0)setPnlHist(h=>[...h.slice(-99),tv]);
  },[prices,wallet]);

  // ── Live prices ────────────────────────────────────────────────────────────
  const loadPrices=useCallback(async()=>{
    try{
      const r=await fetch(`${PROXY}/prices`,{signal:AbortSignal.timeout(5000)});
      if(!r.ok)throw new Error("offline");
      const d=await r.json();
      if(d.BTC&&d.ETH&&d.SOL){
        const np={"BTC/USDT":d.BTC,"ETH/USDT":d.ETH,"SOL/USDT":d.SOL};
        setPrices(np);setPriceSource(`${d.source} ●`);
        setCandles(prev=>{
          const next={};
          for(const p of PAIRS){
            const rp=np[p],old=prev[p]||[];
            if(!old.length){next[p]=makeCandles(rp);continue;}
            const last=old[old.length-1].c,sc=rp/(last||rp);
            next[p]=Math.abs(sc-1)>0.001?old.map(c=>({...c,o:c.o*sc,h:c.h*sc,l:c.l*sc,c:c.c*sc})):old;
          }
          return next;
        });
      }
    }catch{
      // Simulation — only if Weex not connected
      if(!weexRef.current.connected){
        setPrices(prev=>{const n={};for(const p of PAIRS){const d=(Math.random()-0.5)*prev[p]*0.001;n[p]=Math.max(prev[p]*0.95,prev[p]+d);}return n;});
        setPriceSource("Simulation");
      }
    }
  },[]);

  useEffect(()=>{loadPrices();const iv=setInterval(loadPrices,8000);return()=>clearInterval(iv);},[loadPrices]);

  // ── SL/TP monitor ──────────────────────────────────────────────────────────
  useEffect(()=>{
    Object.entries(positions).forEach(([pair,pos])=>{
      const price=prices[pair];if(!price)return;
      const slHit =pos.side==="BUY"?price<=pos.sl:price>=pos.sl;
      const tp2Hit=pos.side==="BUY"?price>=pos.tp2:price<=pos.tp2;
      if(!slHit&&!tp2Hit)return;
      const isTP=tp2Hit&&!slHit;
      const pnl=isTP?((pos.side==="BUY"?(price-pos.entry):(pos.entry-price))*pos.qty):-(pos.riskAmt||0);
      addLog(`${isTP?"🟢 TP2 hit":"🔴 SL hit"} ${pair} @ $${fp(pair,price)} | ${pnl>=0?"+":""}$${Math.abs(pnl).toFixed(2)}`,isTP?"buy":"loss");
      setPositions(p=>{const n={...p};delete n[pair];return n;});
      setWallet(w=>({...w,USDT:w.USDT+(isTP?Math.abs(pnl):0)}));
      setTrades(t=>[{id:Date.now(),pair,action:isTP?"TP2 ✅":"SL 🔴",price:fp(pair,price),ts:ts(),pnl:`${pnl>=0?"+":""}$${Math.abs(pnl).toFixed(2)}`},...t].slice(0,200));
      // Refresh real balance after close
      if(weexRef.current.connected)setTimeout(()=>refreshBalance(),2000);
    });
  },[prices]);

  // ── Refresh balance from Weex ──────────────────────────────────────────────
  const refreshBalance=useCallback(async()=>{
    if(!weexRef.current.connected)return;
    try{
      const r=await fetch(`${PROXY}/weex/balance`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:weexRef.current.key,secret:weexRef.current.secret,passphrase:weexRef.current.passphrase}),signal:AbortSignal.timeout(10000)});
      const d=await r.json();
      setWeexBalance(d);
      const futUSDT=parseFloat(d.futures?.USDT?.available||0);
      const spotUSDT=parseFloat(d.spot?.USDT?.available||0);
      // Always use futures USDT — trading capital is in futures wallet
      const tradingUSDT=futUSDT;
      if(tradingUSDT>0){setWallet(w=>({...w,USDT:tradingUSDT}));addLog(`💰 Balance refreshed: $${tradingUSDT.toFixed(2)} futures USDT available`,"info");}
      else if(spotUSDT>0){addLog(`⚠️ Futures empty, spot has $${spotUSDT.toFixed(2)} — transfer to futures to trade`,"warn");}
    }catch(e){addLog(`⚠️ Balance refresh failed: ${e.message}`,"warn");}
  },[addLog]);

  // ── EXECUTE TRADE (after approval or in auto mode) ─────────────────────────
  const executeTrade=useCallback(async(sig,pair,leverage,usdtAmount)=>{
    if(lockedRef.current){addLog("🔒 Bot is locked after emergency stop. Press Start Bot to unlock.","warn");return;}
    const price=pricesRef.current[pair]||0;
    const isLive=weexRef.current.connected;

    // Update paper wallet
    const cs=CS[pair]||0.01;
    const contracts=price>0?Math.max(1,Math.floor((usdtAmount*leverage)/(cs*price))):1;
    const margin=(contracts*cs*price/leverage).toFixed(2);
    const qty=contracts*cs;

    setPositions(p=>({...p,[pair]:{
      side:sig.signal, entry:price, qty, contracts, leverage, margin:parseFloat(margin),
      sl:parseFloat(sig.sl), tp1:parseFloat(sig.tp1), tp2:parseFloat(sig.tp2), tp3:parseFloat(sig.tp3),
      riskAmt:usdtAmount*0.01, strategy:sig.strategy, ts:ts()
    }}));
    setWallet(w=>({...w,USDT:Math.max(0,w.USDT-parseFloat(margin))}));
    setTrades(t=>[{id:Date.now(),pair,action:`${sig.signal} ${contracts} contracts`,price:fp(pair,price),ts:ts(),conf:sig.confidence,strat:sig.strategy,leverage},...t].slice(0,200));
    addLog(`✅ ${sig.signal} ${contracts} contracts ${pair} @ $${fp(pair,price)} | ${leverage}x | Margin $${margin} | SL $${fp(pair,sig.sl)} | TP2 $${fp(pair,sig.tp2)}`,sig.signal==="BUY"?"buy":"sell");

    // Real Weex order
    if(isLive){
      try{
        const resp=await fetch(`${PROXY}/weex/order`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:weexRef.current.key,secret:weexRef.current.secret,passphrase:weexRef.current.passphrase,pair,side:sig.signal,leverage,usdtAmount,price})});
        const od=await resp.json();
        if(od.success)addLog(`📤 Weex order ✅ ${sig.signal}(${od.posSide}) ${od.contracts} contracts ${pair} | orderId:${od.orderId}`,"buy");
        else addLog(`⚠️ Weex order failed: ${od.error}`,"warn");
        // Refresh balance 3s after placing order
        setTimeout(()=>refreshBalance(),3000);
      }catch(e){addLog(`⚠️ Order error: ${e.message}`,"warn");}
    }
  },[addLog,refreshBalance]);

  // ── AI ANALYZE ─────────────────────────────────────────────────────────────
  const analyze=useCallback(async(pair)=>{
    if(lockedRef.current)return; // Hard lock after emergency stop
    let cd=candles[pair];
    if(!cd||cd.length<30){cd=makeCandles(prices[pair]||SEED[pair]);setCandles(p=>({...p,[pair]:cd}));}
    setAiLoading(l=>({...l,[pair]:true}));

    const cls=cd.map(c=>c.c),price=pricesRef.current[pair]||cls[cls.length-1],dp=DP[pair];
    const R=iRSI(cls),E9=iEMA(cls,9),E21=iEMA(cls,21),E50=iEMA(cls,50);
    const A=iATR(cd),B=iBB(cls),M=iMACD(cls),SK=iStoch(cd),VWAP=iVWAP(cd);
    const day=cd.slice(-96),dH=day.length?Math.max(...day.map(c=>c.h)):0,dL=day.length?Math.min(...day.map(c=>c.l)):0;
    const hasPos=!!posRef.current[pair];
    const avail=walletRef.current.USDT;

    const prompt=`You are an expert crypto futures trader. Analyze ${pair} on the 15-minute chart and provide the HIGHEST PROBABILITY signal — either LONG (BUY), SHORT (SELL), or HOLD.

LIVE DATA:
Price=$${price.toFixed(dp)} | DayHigh=$${dH.toFixed(dp)} | DayLow=$${dL.toFixed(dp)} | VWAP=$${VWAP.toFixed(dp)} | ATR=$${A.toFixed(dp)}

MOMENTUM: RSI=${R.toFixed(1)} | Stoch=${SK.toFixed(1)} | MACD=${M.toFixed(dp>0?3:1)}

TREND:
EMA9=$${E9.toFixed(dp)} | EMA21=$${E21.toFixed(dp)} | EMA50=$${E50.toFixed(dp)}
EMA Alignment: ${E9>E21&&E21>E50?"BULLISH (all stacked up)":E9<E21&&E21<E50?"BEARISH (all stacked down)":"MIXED"}
Price vs VWAP: ${price>VWAP?"ABOVE (bullish)":"BELOW (bearish)"}

VOLATILITY:
BB_Upper=$${B.u.toFixed(dp)} | BB_Mid=$${B.m.toFixed(dp)} | BB_Lower=$${B.lo.toFixed(dp)}
Price position: ${price>B.u?"ABOVE upper band":price<B.lo?"BELOW lower band":"Inside bands"}

ACCOUNT: Available=$${avail.toFixed(2)} | HasPosition=${hasPos}

EVALUATE ALL STRATEGIES:
1. EMA Crossover: EMA9×EMA21 with EMA50 confirmation
2. RSI: Oversold<30=BUY, Overbought>70=SELL
3. BB Breakout: Break above upper=SHORT setup, below lower=LONG setup  
4. VWAP Bounce: Price crossing VWAP direction
5. MACD Cross: Positive=BUY, Negative=SELL momentum
6. Day Hi/Lo: Near day high=SHORT, near day low=LONG

RULES:
- If already in position: HOLD only
- Minimum 3 confluent indicators required
- R:R must be at least 1.5:1
- If market is ranging/choppy: HOLD
- Consider BOTH long AND short setups equally
- SL: 1.5x ATR from entry | TP1: 2x ATR | TP2: 3.5x ATR | TP3: 5x ATR

Respond ONLY with this exact JSON:
{"signal":"BUY","confidence":72,"strategy":"EMA Cross + RSI Oversold","reason":"EMA9 crossed above EMA21 with RSI recovering from 28 oversold.","entry":${price.toFixed(dp)},"sl":${(price-A*1.5).toFixed(dp)},"tp1":${(price+A*2).toFixed(dp)},"tp2":${(price+A*3.5).toFixed(dp)},"tp3":${(price+A*5).toFixed(dp)},"rr":"2.3","bias":"bullish"}

For SELL: sl above entry, tp below entry.
For HOLD: {"signal":"HOLD","confidence":40,"strategy":"No Setup","reason":"Market ranging, no clear edge.","entry":${price.toFixed(dp)},"sl":0,"tp1":0,"tp2":0,"tp3":0,"rr":"0","bias":"neutral"}`;

    try{
      let sig;
      try{
        const r=await fetch(`${PROXY}/ai/analyze`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,pair}),signal:AbortSignal.timeout(35000)});
        if(!r.ok)throw new Error("proxy error");
        sig=await r.json();
        if(sig.error)throw new Error(sig.error);
      }catch{
        // Fallback: direct Anthropic (needs key in browser — mainly for dev)
        sig={signal:"HOLD",confidence:0,strategy:"Proxy Error",reason:"Check Railway deployment and ANTHROPIC_API_KEY env var.",entry:price,sl:0,tp1:0,tp2:0,tp3:0,rr:"0",bias:"neutral"};
      }

      setSignals(s=>({...s,[pair]:{...sig,price,atr:A,ts:ts()}}));
      addLog(`🤖 ${pair}: ${sig.signal} ${sig.confidence}% | ${sig.strategy}`,sig.signal==="BUY"?"buy":sig.signal==="SELL"?"sell":"info");

      const isLive  = weexRef.current.connected;
      const isAuto  = modeRef.current==="auto";
      const canTrade = !hasPos && running && !lockedRef.current && sig.signal!=="HOLD" && Number(sig.confidence)>=65;

      if(canTrade){
        if(isAuto){
          // AUTO MODE: check affordability then trade immediately
          const csVal  = CS[pair]||0.01;
          const defLev = 10;
          const marginPer = (csVal*price)/defLev;
          if(avail<marginPer){
            addLog(`⏸ ${pair} ${sig.signal} — insufficient margin ($${marginPer.toFixed(2)} needed)`, "warn");
          } else {
            const useUSDT=Math.min(avail*0.1,avail); // 10% of wallet
            addLog(`⚡ AUTO: executing ${sig.signal} ${pair} at ${defLev}x with $${useUSDT.toFixed(2)}`,"info");
            await executeTrade(sig,pair,defLev,useUSDT);
          }
        } else {
          // MANUAL MODE: show approval modal
          setPendingSignal({...sig,pair,price,atr:A});
          addLog(`👆 ${pair}: ${sig.signal} ${sig.confidence}% — tap to approve or skip`,"warn");
        }
      }
    }catch(e){
      addLog(`❌ AI error ${pair}: ${e.message}`,"warn");
      setSignals(s=>({...s,[pair]:{signal:"HOLD",confidence:0,strategy:"Error",reason:e.message,entry:price,sl:0,tp1:0,tp2:0,tp3:0,rr:"0",bias:"neutral",ts:ts()}}));
    }
    setAiLoading(l=>({...l,[pair]:false}));
  },[candles,prices,running,executeTrade,addLog]);

  // ── Bot loop ───────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(running&&!locked){
      const avail=walletRef.current.USDT;
      const isLive=weexRef.current.connected;

      // Only analyze pairs we can afford in live mode
      const affordable=isLive
        ?PAIRS.filter(p=>{const cs=CS[p]||0.01;const m=(cs*(pricesRef.current[p]||SEED[p]))/10;return m<=avail;})
        :PAIRS;

      if(isLive&&affordable.length===0){
        addLog(`❌ Balance $${avail.toFixed(2)} too low for any contract. Add USDT to futures wallet.`,"warn");
        setRunning(false);return;
      }

      const mode=modeRef.current;
      const skipped=PAIRS.filter(p=>!affordable.includes(p));
      addLog(`🤖 Bot started [${mode.toUpperCase()} mode] | Trading: ${affordable.join(", ")}${skipped.length?" | Skipping: "+skipped.join(", "):""}`,mode==="auto"?"sell":"info");
      if(mode==="manual")addLog("👆 Manual mode: AI will generate signals and ask your approval before every trade","info");
      else addLog("⚡ Auto mode: AI will trade automatically with 10% wallet risk per trade","info");

      affordable.forEach(p=>analyze(p));
      aiTimer.current=setInterval(()=>affordable.forEach(p=>analyze(p)),90000);
    } else {
      clearInterval(aiTimer.current);
    }
    return()=>clearInterval(aiTimer.current);
  },[running,locked]);

  // ── Weex connect ───────────────────────────────────────────────────────────
  const connectWeex=useCallback(async()=>{
    if(!weexKey||!weexSecret){addLog("Enter API key and secret first","warn");return;}
    setConnecting(true);
    try{
      const r=await fetch(`${PROXY}/weex/balance`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:weexKey,secret:weexSecret,passphrase:weexPassphrase}),signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      if(d.debug)d.debug.slice(0,4).forEach(l=>addLog(`🔍 ${l.slice(0,120)}`,"info"));
      if(d.error)throw new Error(d.error);
      setWeexBalance(d);
      setWeexConnected(true);
      const futUSDT=parseFloat(d.futures?.USDT?.available||0);
      const spotUSDT=parseFloat(d.spot?.USDT?.available||0);
      // ALWAYS use futures USDT for trading — that is where trading capital lives
      // Spot USDT is separate and not used for futures contracts
      const tradingUSDT = futUSDT; // futures wallet = trading capital
      if(tradingUSDT>0){
        setWallet(w=>({...w,USDT:tradingUSDT}));
        setStartBal(tradingUSDT);
        setPnlHist([tradingUSDT]);
        addLog(`✅ Weex connected! Trading wallet: $${tradingUSDT.toFixed(2)} USDT (Futures) | Spot: $${spotUSDT.toFixed(2)}`,"buy");
        const tradeable=PAIRS.filter(p=>{const cs=CS[p]||0.01;return(cs*(pricesRef.current[p]||SEED[p]))/10<=tradingUSDT;});
        addLog(`💰 With $${tradingUSDT.toFixed(2)} futures USDT, can trade: ${tradeable.join(", ")||"none"}`,"info");
      } else if(spotUSDT>0){
        addLog(`⚠️ Futures wallet empty ($0). You have $${spotUSDT.toFixed(2)} in spot — transfer it to your Weex futures wallet to trade.`,"warn");
        setWallet(w=>({...w,USDT:0}));
      } else {
        addLog("✅ Weex connected — both wallets empty. Transfer USDT to your futures wallet.","warn");
      }
    }catch(e){
      addLog(`❌ Connection failed: ${e.message}`,"warn");
    }
    setConnecting(false);
  },[weexKey,weexSecret,weexPassphrase,addLog]);

  const disconnectWeex=()=>{
    setWeexConnected(false);setWeexBalance(null);
    setWeexKey("");setWeexSecret("");setWeexPassphrase("");
    setWallet({USDT:0,BTC:0,ETH:0,SOL:0});setStartBal(0);setPnlHist([]);
    addLog("Weex disconnected","warn");
  };

  // ── Emergency Stop ─────────────────────────────────────────────────────────
  const executeEmergencyStop=useCallback(async()=>{
    setEmergencyLoading(true);
    // HARD LOCK — no trades until user presses Start Bot again
    setRunning(false);
    setLocked(true);
    lockedRef.current=true;
    clearInterval(aiTimer.current);
    setPendingSignal(null); // dismiss any pending approval
    addLog("🚨 EMERGENCY STOP — bot locked, closing all Weex positions…","loss");

    if(weexRef.current.connected){
      try{
        const r=await fetch(`${PROXY}/weex/close`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:weexRef.current.key,secret:weexRef.current.secret,passphrase:weexRef.current.passphrase})});
        const d=await r.json();
        if(d.success)addLog("✅ All Weex positions closed successfully","buy");
        else addLog(`⚠️ Close response: ${d.error||JSON.stringify(d.raw)}`,"warn");
        setTimeout(()=>refreshBalance(),3000);
      }catch(e){addLog(`⚠️ Close all error: ${e.message}`,"warn");}
    }

    // Clear paper positions
    setPositions({});setSignals({});
    addLog("🔒 Bot locked. Press ▶ Start Bot to unlock and resume trading.","warn");
    setEmergencyLoading(false);setEmergencyDone(true);
  },[refreshBalance,addLog]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const tv=totalVal(),pnl=startBal>0?tv-startBal:0,pnlPct=startBal>0?((pnl/startBal)*100).toFixed(2):"0.00";
  const openCount=Object.keys(positions).length;
  const sigCount=Object.values(signals).filter(s=>s?.signal!=="HOLD").length;
  const closed=trades.filter(t=>t.pnl),wins=closed.filter(t=>t.pnl?.startsWith("+")),winRate=closed.length?Math.round(wins.length/closed.length*100):0;
  const TABS=["markets","signals","chart","positions","trades","weex","logs","settings"];

  return(
    <div style={{background:"linear-gradient(135deg,#0f0c29,#302b63,#24243e)",minHeight:"100vh",fontFamily:"system-ui,sans-serif",color:"#fff",padding:12,boxSizing:"border-box"}}>

      {/* HEADER */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#6c5ce7,#a78bfa)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 4px 15px rgba(108,92,231,0.5)"}}>👑</div>
          <div>
            <div style={{fontWeight:800,fontSize:16,background:"linear-gradient(90deg,#ffd700,#ff6b00,#a78bfa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Shah Jee Trading Bot</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",display:"flex",gap:6,alignItems:"center"}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:priceSource.includes("Sim")?"#ffd700":"#00ff88",display:"inline-block"}}/>
              {priceSource}
              {weexConnected&&<span style={{color:"#00ff88",fontWeight:600}}>· Weex ✓</span>}
              {locked&&<span style={{color:"#ff4466",fontWeight:700}}>· 🔒 LOCKED</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>{if(locked){setLocked(false);lockedRef.current=false;addLog("🔓 Bot unlocked — ready to trade","info");}setRunning(r=>!r);}}
            style={{...btn(running?"rgba(255,68,102,0.2)":"rgba(0,255,136,0.2)",running?"#ff4466":"#00ff88",running?"rgba(255,68,102,0.5)":"rgba(0,255,136,0.5)"),padding:"9px 16px"}}>
            {running?"⏹ Stop":"▶ Start Bot"}
          </button>
        </div>
      </div>

      {/* TRADE MODE BAR */}
      <div style={{display:"flex",gap:8,marginBottom:12,background:"rgba(255,255,255,0.04)",borderRadius:14,padding:5}}>
        <button onClick={()=>setTradeMode("manual")} style={{flex:1,padding:"9px",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:700,background:tradeMode==="manual"?"linear-gradient(135deg,rgba(108,92,231,0.6),rgba(167,139,250,0.4))":"transparent",color:tradeMode==="manual"?"#fff":"rgba(255,255,255,0.4)",border:"none"}}>
          👆 Manual — I approve trades
        </button>
        <button onClick={()=>setTradeMode("auto")} style={{flex:1,padding:"9px",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:700,background:tradeMode==="auto"?"linear-gradient(135deg,rgba(0,200,100,0.4),rgba(0,255,136,0.3))":"transparent",color:tradeMode==="auto"?"#00ff88":"rgba(255,255,255,0.4)",border:"none"}}>
          ⚡ Auto — AI trades for me
        </button>
      </div>

      {/* TABS */}
      <div style={{display:"flex",gap:3,marginBottom:14,background:"rgba(255,255,255,0.04)",borderRadius:14,padding:4,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:"0 0 auto",padding:"7px 12px",borderRadius:10,cursor:"pointer",fontSize:11,fontWeight:tab===t?700:400,color:tab===t?"#fff":"rgba(255,255,255,0.4)",background:tab===t?"linear-gradient(135deg,rgba(108,92,231,0.6),rgba(167,139,250,0.4))":"transparent",border:"none",textTransform:"capitalize",whiteSpace:"nowrap"}}>
            {t==="weex"?"🔗 Weex":t==="signals"?"📊 Signals":t}
          </button>
        ))}
      </div>

      {/* ── MARKETS ── */}
      {tab==="markets"&&(
        <div>
          {/* Portfolio */}
          <div style={{...glass({background:"linear-gradient(135deg,rgba(108,92,231,0.3),rgba(56,189,248,0.2))",marginBottom:12})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:4}}>Portfolio</div>
                <div style={{fontSize:32,fontWeight:800,letterSpacing:-1}}>{tv>0?`$${tv.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—"}</div>
                {startBal>0&&<div style={{fontSize:13,color:pnl>=0?"#00ff88":"#ff4466",fontWeight:600,marginTop:4}}>{pnl>=0?"▲":"▼"} ${Math.abs(pnl).toFixed(2)} ({pnl>=0?"+":""}{pnlPct}%)</div>}
                {!weexConnected&&<div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:4}}>Connect Weex to see live balance</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Available USDT</div>
                <div style={{fontSize:20,fontWeight:800,margin:"4px 0",color:"#38bdf8"}}>${wallet.USDT.toFixed(2)}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Mode: <span style={{color:tradeMode==="auto"?"#00ff88":"#a78bfa",fontWeight:700}}>{tradeMode.toUpperCase()}</span></div>
              </div>
            </div>
            {pnlHist.length>2&&<div style={{marginTop:10}}><Spark data={pnlHist} colors={pnl>=0?["#00ff88","#38bdf8"]:["#ff4466","#f97316"]} w={580} h={36}/></div>}
          </div>

          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
            {[[openCount,"Positions","#38bdf8"],[sigCount,"Signals","#ffd700"],[trades.length,"Trades","#a78bfa"],[winRate+"%","Win Rate","#00ff88"]].map(([v,l,c])=>(
              <div key={l} style={mini()}><div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginBottom:4}}>{l}</div><div style={{fontSize:20,fontWeight:700,color:c}}>{v}</div></div>
            ))}
          </div>

          {/* Mode reminder */}
          <div style={{padding:"10px 14px",borderRadius:12,background:tradeMode==="auto"?"rgba(0,255,136,0.08)":"rgba(167,139,250,0.1)",border:`1px solid ${tradeMode==="auto"?"rgba(0,255,136,0.2)":"rgba(167,139,250,0.2)"}`,marginBottom:12,fontSize:12,color:tradeMode==="auto"?"#00ff88":"#a78bfa"}}>
            {tradeMode==="auto"?"⚡ AUTO MODE: AI analyzes every 90s and places trades automatically with 10% risk per trade.":"👆 MANUAL MODE: AI generates signals and asks your approval before every trade. You choose leverage and amount."}
          </div>

          {/* Pair cards */}
          {PAIRS.map(pair=>{
            const price=prices[pair]||0,cd=candles[pair]||[],cls=cd.map(c=>c.c);
            const prev=cd[cd.length-2]?.c||price,chg=prev?((price-prev)/prev*100):0;
            const sig=signals[pair],pos=positions[pair];
            const R=cls.length>15?iRSI(cls):50,A=cd.length>15?iATR(cd):0;
            const [c1,c2]=GRAD[pair];
            const csVal=CS[pair]||0.01;
            const minMargin=(csVal*price)/10;
            const canAfford=wallet.USDT>=minMargin;
            return(
              <div key={pair} onClick={()=>{setSelPair(pair);setTab("chart");}} style={{...glass({cursor:"pointer",borderColor:pos?c1+"66":"rgba(255,255,255,0.1)",marginBottom:10,opacity:(!canAfford&&weexConnected&&!pos)?0.6:1})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                      <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${c1},${c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700}}>{ICON[pair]}</div>
                      <span style={{fontWeight:700,fontSize:15}}>{pair}</span>
                      {pos&&<span style={{...pill(pos.side==="BUY"?"rgba(0,255,136,0.15)":"rgba(255,68,102,0.15)",pos.side==="BUY"?"#00ff88":"#ff4466")}}>OPEN {pos.side}</span>}
                      {!canAfford&&weexConnected&&!pos&&<span style={{...pill("rgba(255,215,0,0.1)","#ffd700")}}>Need ${minMargin.toFixed(0)}+ to trade</span>}
                      {sig&&!aiLoading[pair]&&<span style={{...pill(SBG(sig.signal),SC(sig.signal))}}>{sig.signal} {sig.confidence}%</span>}
                      {aiLoading[pair]&&<span style={{fontSize:11,color:"#a78bfa"}}>Analyzing…</span>}
                    </div>
                    <div style={{fontSize:28,fontWeight:800,background:`linear-gradient(90deg,${c1},${c2})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:3}}>
                      ${price>0?price.toLocaleString("en-US",{minimumFractionDigits:DP[pair],maximumFractionDigits:DP[pair]}):"—"}
                    </div>
                    <div style={{fontSize:12,color:chg>=0?"#00ff88":"#ff4466",fontWeight:600,marginBottom:5}}>{chg>=0?"▲":"▼"} {Math.abs(chg).toFixed(3)}%</div>
                    {sig&&<p style={{margin:"0 0 4px",fontSize:12,color:"rgba(255,255,255,0.5)",lineHeight:1.5}}>{sig.reason}</p>}
                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>RSI <b style={{color:R>70?"#ff4466":R<30?"#00ff88":"#ffd700"}}>{R.toFixed(0)}</b></span>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>ATR <b>{A.toFixed(DP[pair])}</b></span>
                      {sig?.strategy&&<span style={{fontSize:11,color:"#a78bfa",fontWeight:500}}>{sig.strategy}</span>}
                    </div>
                  </div>
                  <Spark data={cd.slice(-30).map(c=>c.c)} colors={GRAD[pair]}/>
                </div>
                {pos&&(
                  <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                      {[["Entry",`$${pos.entry.toFixed(DP[pair])}`],["Lev",`${pos.leverage}x`],["SL",`$${Number(pos.sl).toFixed(DP[pair])}`],["TP2",`$${Number(pos.tp2).toFixed(DP[pair])}`]].map(([l,v])=>(
                        <div key={l} style={{background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"5px 7px"}}>
                          <div style={{fontSize:9,color:"rgba(255,255,255,0.35)"}}>{l}</div>
                          <div style={{fontSize:11,fontWeight:700,color:l==="SL"?"#ff4466":l==="TP2"?"#00ff88":"#fff"}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:8,fontSize:11,color:(prices[pair]||0)>pos.entry?"#00ff88":"#ff4466",fontWeight:600}}>
                      {(()=>{const unreal=pos.side==="BUY"?(prices[pair]||0)-pos.entry:pos.entry-(prices[pair]||0);return`Unrealized: ${unreal>=0?"+":""}$${(unreal*pos.qty).toFixed(2)}`;})()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!running&&<div style={{textAlign:"center",padding:"1.5rem",color:"rgba(255,255,255,0.3)",fontSize:13,background:"rgba(255,255,255,0.03)",borderRadius:14,border:"1px dashed rgba(255,255,255,0.1)"}}>Press <b style={{color:"#00ff88"}}>▶ Start Bot</b> to begin AI trading</div>}
        </div>
      )}

      {/* ── SIGNALS ── */}
      {tab==="signals"&&(
        <div>
          <div style={{marginBottom:12,padding:"10px 14px",borderRadius:12,background:"rgba(108,92,231,0.12)",border:"1px solid rgba(108,92,231,0.2)",fontSize:12,color:"#a78bfa"}}>
            ℹ️ Tap <b>Analyze</b> on any pair to get a fresh AI signal. In Manual mode you'll see an approval card before any trade.
          </div>
          {PAIRS.map(pair=>{
            const sig=signals[pair],price=prices[pair]||0,dp=DP[pair];
            const cd=candles[pair]||[],cls=cd.map(c=>c.c);
            const R=iRSI(cls),E9=iEMA(cls,9),E21=iEMA(cls,21),M=iMACD(cls),SK=iStoch(cd);
            const [c1,c2]=GRAD[pair],pos=positions[pair];
            return(
              <div key={pair} style={{...glass({marginBottom:14,borderColor:sig?`${SC(sig.signal)}33`:"rgba(255,255,255,0.1)"})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(135deg,${c1},${c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{ICON[pair]}</div>
                    <div>
                      <div style={{fontWeight:700}}>{pair}</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>15m · ${price.toLocaleString("en-US",{minimumFractionDigits:dp,maximumFractionDigits:dp})}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    {sig&&<span style={{...pill(SBG(sig.signal),SC(sig.signal)),fontSize:13,padding:"5px 14px"}}>{sig.signal} {sig.confidence}%</span>}
                    <button onClick={e=>{e.stopPropagation();analyze(pair);}} disabled={!!aiLoading[pair]} style={{...btn("rgba(108,92,231,0.25)","#a78bfa","rgba(108,92,231,0.5)"),padding:"6px 14px",fontSize:12,opacity:aiLoading[pair]?0.5:1}}>
                      {aiLoading[pair]?"…":"Analyze"}
                    </button>
                  </div>
                </div>
                {sig&&(
                  <>
                    <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                      <span style={{...pill("rgba(167,139,250,0.15)","#a78bfa")}}>{sig.strategy}</span>
                      <span style={{...pill("rgba(255,255,255,0.07)","rgba(255,255,255,0.5)")}}>{sig.bias}</span>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"10px 12px",marginBottom:10,fontSize:13,color:"rgba(255,255,255,0.65)",lineHeight:1.6}}>💬 {sig.reason}</div>
                    {sig.signal!=="HOLD"&&(
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
                        <div style={{background:"rgba(255,68,102,0.1)",borderRadius:12,padding:"10px",border:"1px solid rgba(255,68,102,0.25)"}}>
                          <div style={{fontSize:10,color:"#ff4466",fontWeight:600,marginBottom:3}}>STOP LOSS</div>
                          <div style={{fontSize:18,fontWeight:800,color:"#ff4466"}}>${Number(sig.sl).toFixed(dp)}</div>
                        </div>
                        <div style={{background:"rgba(0,255,136,0.1)",borderRadius:12,padding:"10px",border:"1px solid rgba(0,255,136,0.25)"}}>
                          <div style={{fontSize:10,color:"#00ff88",fontWeight:600,marginBottom:3}}>TP2 TARGET</div>
                          <div style={{fontSize:18,fontWeight:800,color:"#00ff88"}}>${Number(sig.tp2).toFixed(dp)}</div>
                        </div>
                      </div>
                    )}
                    {sig.signal!=="HOLD"&&!pos&&(
                      <button onClick={()=>setPendingSignal({...sig,pair,price,atr:iATR(cd)})} style={{...btn("linear-gradient(135deg,rgba(0,255,136,0.3),rgba(56,189,248,0.2))","#fff","rgba(0,255,136,0.3)"),width:"100%",padding:"11px",fontSize:14}}>
                        👆 Take This Trade
                      </button>
                    )}
                    {pos&&<div style={{textAlign:"center",padding:"10px",background:"rgba(255,215,0,0.08)",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)",fontSize:12,color:"#ffd700"}}>⚡ Position open — monitoring SL/TP</div>}
                    {sig.signal==="HOLD"&&<div style={{textAlign:"center",padding:"12px",background:"rgba(255,215,0,0.06)",borderRadius:10,border:"1px solid rgba(255,215,0,0.15)",color:"#ffd700",fontSize:12}}>⏳ Waiting for better setup</div>}
                  </>
                )}
                {!sig&&<div style={{textAlign:"center",padding:"20px",color:"rgba(255,255,255,0.3)"}}>Tap Analyze to get AI signal</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                  {[["RSI",R.toFixed(0),R>70?"#ff4466":R<30?"#00ff88":"#ffd700"],["Stoch",SK.toFixed(0),SK>80?"#ff4466":SK<20?"#00ff88":"#ffd700"],["MACD",M.toFixed(DP[pair]>0?2:1),M>0?"#00ff88":"#ff4466"],["Trend",E9>E21?"Bull":"Bear",E9>E21?"#00ff88":"#ff4466"]].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center",background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"6px 4px"}}>
                      <div style={{fontSize:9,color:"rgba(255,255,255,0.35)"}}>{l}</div>
                      <div style={{fontSize:13,fontWeight:700,color:c,marginTop:2}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CHART ── */}
      {tab==="chart"&&(
        <div>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            {PAIRS.map(p=>(
              <button key={p} onClick={()=>setSelPair(p)} style={{flex:1,padding:"8px 0",borderRadius:12,cursor:"pointer",fontSize:12,fontWeight:selPair===p?700:400,color:selPair===p?"#fff":"rgba(255,255,255,0.4)",background:selPair===p?`linear-gradient(135deg,${GRAD[p][0]}44,${GRAD[p][1]}44)`:"rgba(255,255,255,0.05)",border:`1.5px solid ${selPair===p?GRAD[p][0]+"88":"rgba(255,255,255,0.08)"}`}}>
                {ICON[p]} {p.split("/")[0]}
              </button>
            ))}
          </div>
          <div style={{borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.1)",marginBottom:10}}>
            <iframe key={selPair}
              src={`https://s.tradingview.com/widgetembed/?symbol=${{ "BTC/USDT":"BINANCE:BTCUSDT","ETH/USDT":"BINANCE:ETHUSDT","SOL/USDT":"BINANCE:SOLUSDT" }[selPair]}&interval=15&theme=dark&style=1&locale=en&toolbar_bg=131722&withdateranges=1`}
              style={{width:"100%",height:420,border:"none",display:"block"}} title="Chart"/>
          </div>
          {(()=>{
            const sig=signals[selPair],cd=candles[selPair]||[],cls=cd.map(c=>c.c),dp=DP[selPair];
            const R=iRSI(cls),E9=iEMA(cls,9),E21=iEMA(cls,21),E50=iEMA(cls,50),A=iATR(cd),SK=iStoch(cd),M=iMACD(cls),VWAP=iVWAP(cd);
            return(
              <>
                <div style={glass()}>
                  <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>Live Indicators — {selPair}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {[["RSI",R.toFixed(0),R>70?"#ff4466 (OB)":R<30?"#00ff88 (OS)":"#ffd700"],["Stoch",SK.toFixed(0),SK>80?"#ff4466":SK<20?"#00ff88":"#ffd700"],["MACD",M.toFixed(dp>0?3:1),M>0?"#00ff88":"#ff4466"],["EMA9",`$${E9.toFixed(dp)}`,E9>E21?"#00ff88":"#ff4466"],["EMA50",`$${E50.toFixed(dp)}`,prices[selPair]>E50?"#00ff88":"#ff4466"],["VWAP",`$${VWAP.toFixed(dp)}`,prices[selPair]>VWAP?"#00ff88":"#ff4466"]].map(([l,v,c])=>(
                      <div key={l} style={mini({textAlign:"center"})}>
                        <div style={{fontSize:9,color:"rgba(255,255,255,0.4)"}}>{l}</div>
                        <div style={{fontSize:13,fontWeight:700,color:c.split(" ")[0],marginTop:3}}>{v}</div>
                        {c.includes("(")&&<div style={{fontSize:9,color:c.split(" ")[0]}}>{c.split(" ")[1]}</div>}
                      </div>
                    ))}
                  </div>
                </div>
                {sig&&sig.signal!=="HOLD"&&!positions[selPair]&&(
                  <button onClick={()=>setPendingSignal({...sig,pair:selPair,price:prices[selPair],atr:A})} style={{...btn("linear-gradient(135deg,rgba(0,255,136,0.3),rgba(56,189,248,0.2))","#fff","rgba(0,255,136,0.3)"),width:"100%",padding:"12px",fontSize:14,marginBottom:10}}>
                    👆 Take This Trade ({sig.signal} — {sig.confidence}%)
                  </button>
                )}
                <button onClick={()=>analyze(selPair)} disabled={!!aiLoading[selPair]} style={{...btn("linear-gradient(135deg,rgba(108,92,231,0.4),rgba(167,139,250,0.3))","#a78bfa","rgba(108,92,231,0.5)"),width:"100%",padding:"11px",opacity:aiLoading[selPair]?0.5:1}}>
                  {aiLoading[selPair]?"Analyzing with Claude AI…":"🤖 Analyze with Claude AI"}
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* ── POSITIONS ── */}
      {tab==="positions"&&(
        <div>
          {openCount===0
            ?<div style={{textAlign:"center",padding:"4rem 0",color:"rgba(255,255,255,0.3)"}}>No open positions</div>
            :Object.entries(positions).map(([pair,pos])=>{
              const price=prices[pair]||0,dp=DP[pair];
              const unreal=(pos.side==="BUY"?price-pos.entry:pos.entry-price)*pos.qty;
              const [c1,c2]=GRAD[pair];
              const prog=Math.min(100,Math.max(0,((price-(pos.sl||0))/((pos.tp2||0)-(pos.sl||0)||1))*100));
              return(
                <div key={pair} style={{...glass({borderColor:`${c1}55`,marginBottom:10})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${c1},${c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>{ICON[pair]}</div>
                      <span style={{fontWeight:700}}>{pair}</span>
                      <span style={{...pill(pos.side==="BUY"?"rgba(0,255,136,0.15)":"rgba(255,68,102,0.15)",pos.side==="BUY"?"#00ff88":"#ff4466")}}>{pos.side}</span>
                      <span style={{...pill("rgba(255,255,255,0.08)","rgba(255,255,255,0.6)")}}>@{pos.leverage}x</span>
                    </div>
                    <span style={{fontSize:18,fontWeight:800,color:unreal>=0?"#00ff88":"#ff4466"}}>{unreal>=0?"+":""}${unreal.toFixed(2)}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                    {[["Entry",`$${pos.entry.toFixed(dp)}`],["Now",`$${price.toFixed(dp)}`],["Margin",`$${pos.margin.toFixed(2)}`],["Qty",`${pos.qty.toFixed(4)}`]].map(([l,v])=>(
                      <div key={l} style={mini({textAlign:"center"})}><div style={{fontSize:9,color:"rgba(255,255,255,0.4)"}}>{l}</div><div style={{fontSize:12,fontWeight:700}}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{height:5,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden",marginBottom:6}}>
                    <div style={{height:"100%",width:`${prog}%`,background:`linear-gradient(90deg,${c1},${c2})`,borderRadius:3,transition:"width 0.5s"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                    <span style={{color:"#ff4466"}}>SL ${Number(pos.sl).toFixed(dp)}</span>
                    <span style={{color:"rgba(255,255,255,0.4)"}}>{pos.strategy}</span>
                    <span style={{color:"#00ff88"}}>TP2 ${Number(pos.tp2).toFixed(dp)}</span>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* ── TRADES ── */}
      {tab==="trades"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {[[`${pnl>=0?"+":""}$${Math.abs(pnl).toFixed(2)}`,"Total P&L",pnl>=0?"#00ff88":"#ff4466"],[closed.length,"Closed","#38bdf8"],[winRate+"%","Win Rate","#00ff88"]].map(([v,l,c])=>(
              <div key={l} style={glass()}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginBottom:4}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div></div>
            ))}
          </div>
          <div style={glass()}>
            <div style={{fontWeight:700,marginBottom:10}}>History</div>
            {!trades.length?<div style={{textAlign:"center",padding:"2rem",color:"rgba(255,255,255,0.3)"}}>No trades yet</div>
              :trades.map(tr=>(
                <div key={tr.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{width:30,height:30,borderRadius:8,background:tr.pnl?.startsWith("+")?"rgba(0,255,136,0.15)":tr.pnl?"rgba(255,68,102,0.15)":"rgba(167,139,250,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
                      {tr.pnl?.startsWith("+")?"✅":tr.pnl?"🔴":"⚡"}
                    </div>
                    <div>
                      <div style={{fontWeight:600,fontSize:13}}>{tr.action} {tr.pair}</div>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{tr.ts}{tr.leverage?" · "+tr.leverage+"x":""}{tr.conf?" · "+tr.conf+"%":""}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:600,fontSize:13}}>${tr.price}</div>
                    {tr.pnl&&<div style={{fontSize:12,fontWeight:700,color:tr.pnl.startsWith("+")?"#00ff88":"#ff4466"}}>{tr.pnl}</div>}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── WEEX ── */}
      {tab==="weex"&&<WeexTab weexConnected={weexConnected} weexBalance={weexBalance} weexKey={weexKey} setWeexKey={setWeexKey} weexSecret={weexSecret} setWeexSecret={setWeexSecret} weexPassphrase={weexPassphrase} setWeexPassphrase={setWeexPassphrase} connecting={connecting} connectWeex={connectWeex} disconnectWeex={disconnectWeex}/>}

      {/* ── LOGS ── */}
      {tab==="logs"&&(
        <div style={glass()}>
          <div style={{fontWeight:700,marginBottom:10}}>Activity Log</div>
          {logs.map((l,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",alignItems:"flex-start"}}>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.25)",minWidth:55,flexShrink:0}}>{l.ts}</span>
              <span style={{width:6,height:6,borderRadius:"50%",marginTop:4,flexShrink:0,background:l.type==="buy"?"#00ff88":l.type==="sell"||l.type==="loss"?"#ff4466":l.type==="warn"?"#ffd700":"rgba(255,255,255,0.25)"}}/>
              <span style={{fontSize:12,lineHeight:1.5,color:l.type==="buy"?"#00ff88":l.type==="sell"||l.type==="loss"?"#ff4466":l.type==="warn"?"#ffd700":"rgba(255,255,255,0.55)"}}>{l.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── SETTINGS ── */}
      {tab==="settings"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={glass()}>
            <div style={{fontWeight:700,marginBottom:12}}>Trading Mode</div>
            {[["manual","👆 Manual","AI signals require your approval. You choose leverage and amount.","#a78bfa"],["auto","⚡ Auto","AI analyzes and trades automatically using 10% wallet risk per trade.","#00ff88"]].map(([m,t,s,c])=>(
              <button key={m} onClick={()=>setTradeMode(m)} style={{display:"block",width:"100%",padding:"12px 14px",borderRadius:12,cursor:"pointer",background:tradeMode===m?`${c}18`:"rgba(255,255,255,0.04)",border:`1.5px solid ${tradeMode===m?c+"60":"rgba(255,255,255,0.1)"}`,textAlign:"left",marginBottom:8}}>
                <div style={{fontWeight:700,color:tradeMode===m?c:"#fff",fontSize:14}}>{t}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:3}}>{s}</div>
              </button>
            ))}
          </div>
          <div style={glass()}>
            <div style={{fontWeight:700,marginBottom:10}}>Bot Configuration</div>
            {[["Analysis interval","Every 90 seconds"],["Pairs","BTC/USDT · ETH/USDT · SOL/USDT"],["Timeframe","15 minutes"],["AI engine","Claude claude-sonnet-4-6"],["Min confidence","65% required"],["Directions","LONG (BUY) and SHORT (SELL)"],["Stop loss","1.5× ATR below/above entry"],["Take profits","TP1=2× · TP2=3.5× · TP3=5× ATR"],["Auto risk","10% of wallet per trade"],["Contract sizes","BTC=0.001 · ETH=0.01 · SOL=0.1"]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:12}}>
                <span style={{color:"rgba(255,255,255,0.45)"}}>{l}</span><span style={{fontWeight:600,color:"#a78bfa"}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={glass()}>
            <div style={{fontWeight:700,marginBottom:10}}>AI Strategies</div>
            {[["EMA Crossover","EMA9 × EMA21 with EMA50 trend filter"],["RSI Extremes","<30 oversold BUY · >70 overbought SELL"],["BB Breakout","Band breaks with volume"],["VWAP Bounce","Price crossing VWAP"],["MACD Momentum","MACD cross confirmation"],["Confluence","3+ indicators required"]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:12}}>
                <span style={{color:"rgba(255,255,255,0.45)"}}>{l}</span><span style={{fontSize:11,color:"rgba(255,255,255,0.45)",maxWidth:"55%",textAlign:"right"}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EMERGENCY STOP */}
      <div style={{marginTop:16,marginBottom:4}}>
        <button onClick={()=>setShowEmergency(true)} style={{width:"100%",padding:"14px",borderRadius:16,cursor:"pointer",fontWeight:800,fontSize:15,background:locked?"rgba(255,0,60,0.2)":"rgba(255,0,60,0.1)",color:"#ff0044",border:`2px solid ${locked?"rgba(255,0,60,0.6)":"rgba(255,0,60,0.35)"}`,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          {locked?"🔒 BOT LOCKED — Press Start Bot to unlock":"🚨 EMERGENCY STOP — Close All Positions"}
        </button>
      </div>

      <div style={{textAlign:"center",fontSize:10,color:"rgba(255,255,255,0.15)",marginTop:8,marginBottom:16}}>
        Shah Jee Bot v3.0 · Claude AI · Weex Futures · Long & Short
      </div>

      {/* MODALS */}
      <TradeModal
        signal={pendingSignal}
        maxUSDT={wallet.USDT}
        onApprove={({leverage,usdtAmount})=>{
          if(pendingSignal){executeTrade(pendingSignal,pendingSignal.pair,leverage,usdtAmount);}
          setPendingSignal(null);
        }}
        onReject={()=>{
          addLog(`⏭ Skipped ${pendingSignal?.pair} ${pendingSignal?.signal}`,"info");
          setPendingSignal(null);
        }}
      />
      <EmergencyModal show={showEmergency} done={emergencyDone} loading={emergencyLoading} onConfirm={executeEmergencyStop} onClose={()=>{setShowEmergency(false);setEmergencyDone(false);}}/>
    </div>
  );
}