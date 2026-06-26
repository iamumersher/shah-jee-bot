import { useState, useEffect, useRef, useCallback } from "react";

const PROXY   = "https://shah-jee-proxy-production.up.railway.app";
const PAIRS   = ["BTC/USDT","ETH/USDT","SOL/USDT"];
const SEED    = {"BTC/USDT":61000,"ETH/USDT":1600,"SOL/USDT":67};
const DP      = {"BTC/USDT":1,"ETH/USDT":2,"SOL/USDT":3};
const CS      = {"BTC/USDT":0.001,"ETH/USDT":0.01,"SOL/USDT":0.1};
const LEVERAGE= 10;
const GRAD    = {"BTC/USDT":["#f7931a","#ff6b00"],"ETH/USDT":["#627eea","#a78bfa"],"SOL/USDT":["#9945ff","#14f195"]};
const ICON    = {"BTC/USDT":"B","ETH/USDT":"E","SOL/USDT":"S"};

// ── Indicators ────────────────────────────────────────────────────────────────
function iRSI(cls,p=14){
  if(cls.length<p+1)return 50;
  let g=0,l=0;
  for(let i=cls.length-p;i<cls.length;i++){const d=cls[i]-cls[i-1];d>0?g+=d:l-=d;}
  return 100-100/(1+(g/(l||1e-9)));
}
function iEMA(cls,p){
  if(!cls||cls.length<2)return cls?.[0]||0;
  const k=2/(p+1);
  let e=cls.slice(0,Math.min(p,cls.length)).reduce((a,b)=>a+b,0)/Math.min(p,cls.length);
  for(let i=Math.min(p,cls.length);i<cls.length;i++)e=cls[i]*k+e*(1-k);
  return e;
}
function iATR(cd,p=14){
  if(!cd||cd.length<2)return 0;
  const s=cd.slice(-Math.min(p+1,cd.length));
  const trs=s.map((c,i)=>i===0?c.h-c.l:Math.max(c.h-c.l,Math.abs(c.h-s[i-1].c),Math.abs(c.l-s[i-1].c)));
  return trs.reduce((a,b)=>a+b,0)/trs.length;
}
function iBB(cls,p=20){
  const last=cls?.[cls.length-1]||0;
  if(!cls||cls.length<p)return{u:last*1.02,m:last,lo:last*0.98};
  const s=cls.slice(-p),m=s.reduce((a,b)=>a+b,0)/p;
  const sd=Math.sqrt(s.reduce((a,b)=>a+(b-m)**2,0)/p);
  return{u:m+2*sd,m,lo:m-2*sd};
}
function iMACD(cls){return iEMA(cls,12)-iEMA(cls,26);}
function iStoch(cd,p=14){
  const s=cd?.slice(-p);
  if(!s?.length)return 50;
  const hi=Math.max(...s.map(c=>c.h)),lo=Math.min(...s.map(c=>c.l));
  return((cd[cd.length-1].c-lo)/(hi-lo||1))*100;
}
function iVWAP(cd){
  if(!cd||cd.length<2)return 0;
  const s=cd.slice(-24),tv=s.reduce((a,c)=>a+c.v,0);
  return s.reduce((a,c)=>a+(((c.h+c.l+c.c)/3)*c.v),0)/(tv||1);
}

// ── Position sizing ───────────────────────────────────────────────────────────
function calcRisk(usdt,price,atr,side,pair){
  const cs=CS[pair]||0.01;
  const slDist=Math.max(atr*1.5,price*0.005);
  let qty=Math.max((usdt*0.01)/slDist, cs);
  const margin=(qty*price)/LEVERAGE;
  const pos=Math.min(margin,usdt*0.10);
  const sl=side==="BUY"?price-slDist:price+slDist;
  return{
    risk:(usdt*0.01).toFixed(2),qty:qty.toFixed(6),pos:pos.toFixed(2),sl,slDist,
    tp1:side==="BUY"?price+atr*2:price-atr*2,
    tp2:side==="BUY"?price+atr*3.5:price-atr*3.5,
    tp3:side==="BUY"?price+atr*5:price-atr*5,
    rr:(atr*2/slDist).toFixed(1),
  };
}

// ── Candle seed ───────────────────────────────────────────────────────────────
function makeCandles(base,n=120){
  let p=base;
  return Array.from({length:n},(_,i)=>{
    const chg=(Math.random()-0.49)*p*0.006,o=p,c=p+chg;
    const h=Math.max(o,c)+Math.random()*p*0.002,l=Math.min(o,c)-Math.random()*p*0.002;
    p=c;return{o,h,l,c,v:50+Math.random()*200,t:Date.now()-(n-i)*900000};
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fp=(pair,v)=>v||v===0?Number(v).toLocaleString("en-US",{minimumFractionDigits:DP[pair],maximumFractionDigits:DP[pair]}):"--";
const SC=s=>s==="BUY"?"#00ff88":s==="SELL"?"#ff4466":"#ffd700";
const SB=s=>s==="BUY"?"rgba(0,255,136,0.12)":s==="SELL"?"rgba(255,68,102,0.12)":"rgba(255,215,0,0.1)";
const glass=(ex={})=>({background:"rgba(255,255,255,0.05)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:18,padding:"14px 16px",marginBottom:12,...ex});
const mini=(ex={})=>({background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"10px 12px",...ex});
const pill=(bg,c)=>({fontSize:11,padding:"3px 10px",borderRadius:20,background:bg,color:c,fontWeight:600});
const gbtn=(bg,c,bd)=>({padding:"9px 20px",borderRadius:12,cursor:"pointer",fontWeight:600,fontSize:13,background:bg,color:c,border:"1.5px solid "+bd});

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({data,colors,w=130,h=44}){
  const ref=useRef();
  useEffect(()=>{
    const cv=ref.current;if(!cv||!data||data.length<2)return;
    const ctx=cv.getContext("2d");ctx.clearRect(0,0,w,h);
    const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;
    const pts=data.map((v,i)=>({x:(i/(data.length-1))*w,y:h-4-((v-mn)/rng)*(h-8)}));
    const g=ctx.createLinearGradient(0,0,w,0);
    g.addColorStop(0,colors[0]+"99");g.addColorStop(1,colors[1]+"99");
    const bg=ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,colors[0]+"33");bg.addColorStop(1,colors[0]+"00");
    ctx.beginPath();ctx.moveTo(pts[0].x,h);
    pts.forEach(p=>ctx.lineTo(p.x,p.y));
    ctx.lineTo(pts[pts.length-1].x,h);ctx.closePath();
    ctx.fillStyle=bg;ctx.fill();
    ctx.beginPath();ctx.strokeStyle=g;ctx.lineWidth=2;
    ctx.lineJoin="round";ctx.lineCap="round";
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.stroke();
  },[data,colors,w,h]);
  return <canvas ref={ref} width={w} height={h} style={{display:"block"}}/>;
}

// ── TradingView Chart ─────────────────────────────────────────────────────────
function TVChart({pair,sig,rsk}){
  const sym={"BTC/USDT":"BINANCE:BTCUSDT","ETH/USDT":"BINANCE:ETHUSDT","SOL/USDT":"BINANCE:SOLUSDT"}[pair];
  const dp=DP[pair];
  return(
    <div style={{marginBottom:12}}>
      <div style={{borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.1)"}}>
        <iframe key={pair}
          src={"https://s.tradingview.com/widgetembed/?symbol="+encodeURIComponent(sym)+"&interval=15&theme=dark&style=1&locale=en&toolbar_bg=131722&withdateranges=1"}
          style={{width:"100%",height:420,border:"none",display:"block"}} title="Chart"/>
      </div>
      {sig&&sig.signal!=="HOLD"&&rsk&&(
        <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:6}}>
          {[["Entry","$"+Number(sig.entry).toFixed(dp),"rgba(255,255,255,0.15)","#fff"],
            ["SL","$"+Number(sig.sl).toFixed(dp),"rgba(255,68,102,0.15)","#ff4466"],
            ["TP1","$"+Number(sig.tp1).toFixed(dp),"rgba(126,247,99,0.12)","#7ef763"],
            ["TP2","$"+Number(sig.tp2).toFixed(dp),"rgba(0,255,136,0.12)","#00ff88"],
            ["TP3","$"+Number(sig.tp3).toFixed(dp),"rgba(56,189,248,0.12)","#38bdf8"],
          ].map(([l,v,bg,c])=>(
            <span key={l} style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:bg,color:c,border:"1px solid "+c+"44",fontWeight:600}}>{l}: {v}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Emergency Modal ───────────────────────────────────────────────────────────
function EmergencyModal({show,done,loading,positions,prices,onConfirm,onClose}){
  if(!show)return null;
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,backdropFilter:"blur(8px)"}}>
      <div style={{background:"#0f0c29",border:"2px solid rgba(255,0,60,0.5)",borderRadius:24,padding:"28px 24px",maxWidth:360,width:"90%"}}>
        {!done?(
          <>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:42,marginBottom:10}}>X</div>
              <div style={{fontSize:20,fontWeight:800,color:"#ff0044",marginBottom:8}}>EMERGENCY STOP</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.55)",lineHeight:1.7}}>Stops the bot and closes ALL open positions on Weex immediately.</div>
              {Object.keys(positions).length>0&&(
                <div style={{marginTop:12,padding:"10px 14px",background:"rgba(255,0,60,0.1)",borderRadius:12,border:"1px solid rgba(255,0,60,0.3)",fontSize:12,color:"#ff4466"}}>
                  {Object.entries(positions).map(([pair,pos])=>{
                    const price=prices[pair]||0;
                    const unreal=(price-pos.entry)*pos.qty*(pos.side==="BUY"?1:-1);
                    return <div key={pair}>{pair} {pos.side} -- {unreal>=0?"+":""}${unreal.toFixed(2)}</div>;
                  })}
                </div>
              )}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={onClose} style={{padding:"12px",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:14,background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.6)",border:"1px solid rgba(255,255,255,0.15)"}}>Cancel</button>
              <button onClick={onConfirm} disabled={loading} style={{padding:"12px",borderRadius:12,cursor:"pointer",fontWeight:800,fontSize:14,background:"linear-gradient(135deg,#ff0044,#ff4466)",color:"#fff",border:"none",opacity:loading?0.7:1}}>
                {loading?"Closing...":"CONFIRM STOP"}
              </button>
            </div>
          </>
        ):(
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <div style={{fontSize:42,marginBottom:12,color:"#00ff88"}}>OK</div>
            <div style={{fontSize:18,fontWeight:800,color:"#00ff88",marginBottom:8}}>All Stopped</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:20}}>Bot stopped. All positions closed on Weex.</div>
            <button onClick={onClose} style={{padding:"10px 28px",borderRadius:12,cursor:"pointer",fontWeight:700,background:"rgba(0,255,136,0.15)",color:"#00ff88",border:"1px solid rgba(0,255,136,0.35)",fontSize:14}}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Weex Tab ──────────────────────────────────────────────────────────────────
function WeexTab({weexConnected,weexBalance,weexKey,setWeexKey,weexSecret,setWeexSecret,weexPassphrase,setWeexPassphrase,connecting,connectWeex,disconnectWeex}){
  const inp={width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"11px 14px",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box"};
  if(!weexConnected)return(
    <div>
      <div style={{...glass({background:"linear-gradient(135deg,rgba(108,92,231,0.2),rgba(56,189,248,0.1))",marginBottom:16})}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>Connect Weex Account</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",lineHeight:1.7}}>One API key covers both Spot and Futures wallets. Enable Read + Trade (Futures) permissions only.</div>
      </div>
      <div style={glass()}>
        {[["API KEY",weexKey,setWeexKey,"Paste your Weex API key","text"],
          ["API SECRET",weexSecret,setWeexSecret,"Paste your Weex API secret","password"],
          ["PASSPHRASE",weexPassphrase,setWeexPassphrase,"Your API passphrase","password"]
        ].map(([label,val,setter,ph,type])=>(
          <div key={label} style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:600}}>{label}</div>
            <input value={val} onChange={e=>setter(e.target.value)} placeholder={ph} type={type} style={inp}/>
          </div>
        ))}
        <button onClick={connectWeex} disabled={connecting} style={{...gbtn("linear-gradient(135deg,#6c5ce7,#a78bfa)","#fff","transparent"),width:"100%",fontSize:14,padding:"12px",opacity:connecting?0.6:1}}>
          {connecting?"Connecting...":"Connect Weex Account"}
        </button>
        <div style={{marginTop:12,padding:"10px 12px",background:"rgba(255,215,0,0.08)",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)",fontSize:12,color:"rgba(255,215,0,0.8)"}}>
          WARNING: Read + Trade only. Never enable Withdraw permission.
        </div>
      </div>
    </div>
  );
  return(
    <div>
      <div style={{...glass({background:"linear-gradient(135deg,rgba(0,255,136,0.12),rgba(56,189,248,0.08))",borderColor:"rgba(0,255,136,0.3)",marginBottom:16})}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:40,height:40,borderRadius:12,background:"rgba(0,255,136,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>OK</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"#00ff88"}}>Weex Connected</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Live balance loaded -- 1% risk per trade -- 10x leverage</div>
          </div>
        </div>
      </div>
      <div style={glass()}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Account Balance</div>
        {weexBalance?.spot&&Object.keys(weexBalance.spot).length>0&&(
          <>
            <div style={{fontSize:11,color:"#a78bfa",fontWeight:600,marginBottom:8}}>SPOT WALLET</div>
            {Object.entries(weexBalance.spot).map(([asset,bal])=>(
              <div key={asset} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                <span style={{fontWeight:600}}>{asset}</span>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700}}>{Number(bal.available).toFixed(asset==="USDT"?2:6)}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>Locked: {parseFloat(bal.locked||0).toFixed(asset==="USDT"?2:6)}</div>
                </div>
              </div>
            ))}
          </>
        )}
        {weexBalance?.futures&&Object.keys(weexBalance.futures).length>0&&(
          <>
            <div style={{fontSize:11,color:"#38bdf8",fontWeight:600,margin:"12px 0 8px"}}>FUTURES WALLET (USDT-M)</div>
            {Object.entries(weexBalance.futures).map(([asset,bal])=>(
              <div key={asset} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                <span style={{fontWeight:600,color:"#38bdf8"}}>{asset}</span>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,fontSize:16}}>{parseFloat(bal.available).toFixed(2)} <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>available</span></div>
                  <div style={{fontSize:10,color:parseFloat(bal.unrealized)>=0?"#00ff88":"#ff4466"}}>PnL: {parseFloat(bal.unrealized)>=0?"+":""}{parseFloat(bal.unrealized).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </>
        )}
        {(!weexBalance?.futures||Object.keys(weexBalance.futures).length===0)&&(
          <div style={{padding:"12px",background:"rgba(255,215,0,0.08)",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)",fontSize:12,color:"#ffd700",marginTop:8}}>
            Futures wallet empty or not found. Check Logs tab for details.
          </div>
        )}
      </div>
      <div style={glass()}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Risk Management</div>
        {[["Risk/trade","1% of wallet"],["Leverage","10x futures"],["Stop Loss","1.5x ATR"],["TP1 / TP2 / TP3","2x / 3.5x / 5x ATR"],["Min AI Confidence","65%"],["Max per pair","1 position"]].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.06)",fontSize:12}}>
            <span style={{color:"rgba(255,255,255,0.45)"}}>{l}</span><span style={{fontWeight:600}}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <button onClick={connectWeex} disabled={connecting} style={{...gbtn("rgba(0,255,136,0.15)","#00ff88","rgba(0,255,136,0.3)"),padding:"11px",textAlign:"center",opacity:connecting?0.6:1}}>
          {connecting?"Loading...":"Refresh Balance"}
        </button>
        <button onClick={disconnectWeex} style={{...gbtn("rgba(255,68,102,0.15)","#ff4466","rgba(255,68,102,0.3)"),padding:"11px",textAlign:"center"}}>Disconnect</button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]       = useState("markets");
  const [selPair,setSelPair] = useState("BTC/USDT");
  const [running,setRunning] = useState(false);
  const [mode,setMode]     = useState("paper");

  const [weexKey,setWeexKey]               = useState("");
  const [weexSecret,setWeexSecret]         = useState("");
  const [weexPassphrase,setWeexPassphrase] = useState("");
  const [weexConnected,setWeexConnected]   = useState(false);
  const [weexBalance,setWeexBalance]       = useState(null);
  const [connecting,setConnecting]         = useState(false);

  const [prices,setPrices]         = useState({...SEED});
  const [candles,setCandles]       = useState(()=>Object.fromEntries(PAIRS.map(p=>[p,makeCandles(SEED[p])])));
  const [priceSource,setPriceSource] = useState("Simulation");

  const [wallet,setWallet]         = useState({USDT:0,BTC:0,ETH:0,SOL:0});
  const [startBal,setStartBal]     = useState(0);
  const [signals,setSignals]       = useState({});
  const [risks,setRisks]           = useState({});
  const [positions,setPositions]   = useState({});
  const [trades,setTrades]         = useState([]);
  const [pnlHist,setPnlHist]       = useState([]);
  const [aiLoading,setAiLoading]   = useState({});
  const [logs,setLogs]             = useState([{msg:"Shah Jee Bot ready. Connect Weex then press Start Bot.",type:"info",ts:new Date().toLocaleTimeString()}]);

  const [showEmergency,setShowEmergency]       = useState(false);
  const [emergencyLoading,setEmergencyLoading] = useState(false);
  const [emergencyDone,setEmergencyDone]       = useState(false);

  const aiTimer   = useRef(null);
  const modeRef   = useRef(mode);
  const weexRef   = useRef({connected:false,key:"",secret:"",passphrase:""});
  const walletRef = useRef(wallet);
  const pricesRef = useRef(prices);

  useEffect(()=>{modeRef.current=mode;},[mode]);
  useEffect(()=>{weexRef.current={connected:weexConnected,key:weexKey,secret:weexSecret,passphrase:weexPassphrase};},[weexConnected,weexKey,weexSecret,weexPassphrase]);
  useEffect(()=>{walletRef.current=wallet;},[wallet]);
  useEffect(()=>{pricesRef.current=prices;},[prices]);

  const addLog=useCallback((msg,type="info")=>setLogs(l=>[{msg,type,ts:new Date().toLocaleTimeString()},...l].slice(0,100)),[]);

  const totalVal=useCallback(()=>{
    let t=walletRef.current.USDT;
    PAIRS.forEach(p=>{t+=(walletRef.current[p.split("/")[0]]||0)*(pricesRef.current[p]||0);});
    return t;
  },[]);

  useEffect(()=>{
    const tv=totalVal();
    if(tv>0)setPnlHist(h=>[...h.slice(-99),tv]);
  },[prices,wallet]);

  // ── Load prices ─────────────────────────────────────────────────────────────
  const loadPrices=useCallback(async()=>{
    try{
      const r=await fetch(PROXY+"/prices",{signal:AbortSignal.timeout(5000)});
      if(!r.ok)throw new Error("proxy offline");
      const d=await r.json();
      if(d.BTC&&d.ETH&&d.SOL){
        const np={"BTC/USDT":d.BTC,"ETH/USDT":d.ETH,"SOL/USDT":d.SOL};
        setPrices(np);setPriceSource((d.source||"Live")+" .");
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
      if(!weexRef.current.connected){
        setPrices(prev=>{const n={};for(const p of PAIRS){const d=(Math.random()-0.5)*prev[p]*0.001;n[p]=Math.max(prev[p]*0.95,prev[p]+d);}return n;});
        setPriceSource("Simulation");
      }
    }
  },[]);

  useEffect(()=>{loadPrices();const iv=setInterval(loadPrices,8000);return()=>clearInterval(iv);},[loadPrices]);

  // ── Candle tick (paper only) ─────────────────────────────────────────────────
  useEffect(()=>{
    const iv=setInterval(()=>{
      if(weexRef.current.connected)return;
      setCandles(prev=>{
        const next={};
        for(const p of PAIRS){
          const old=prev[p]||[];if(!old.length){next[p]=old;continue;}
          const last=old[old.length-1],drift=(Math.random()-0.5)*last.c*0.0003;
          const nc=Math.max(last.c*0.9,last.c+drift);
          next[p]=[...old.slice(0,-1),{...last,h:Math.max(last.h,nc),l:Math.min(last.l,nc),c:nc}];
        }
        return next;
      });
    },3000);
    return()=>clearInterval(iv);
  },[]);

  // ── SL/TP monitor ────────────────────────────────────────────────────────────
  useEffect(()=>{
    Object.entries(positions).forEach(([pair,pos])=>{
      const price=prices[pair];if(!price)return;
      const asset=pair.split("/")[0];
      const slHit=pos.side==="BUY"?price<=pos.sl:price>=pos.sl;
      const tp2Hit=pos.side==="BUY"?price>=pos.tp2:price<=pos.tp2;
      if(!slHit&&!tp2Hit)return;
      const isTp=tp2Hit&&!slHit;
      const pnl=isTp?(pos.side==="BUY"?pos.qty*(price-pos.entry):pos.qty*(pos.entry-price)):-pos.rAmt;
      addLog((isTp?"TP2 hit":"SL hit")+" "+pair+" @ $"+fp(pair,price)+" | "+(isTp?"+":"")+"$"+Math.abs(pnl).toFixed(2),isTp?"buy":"loss");
      setWallet(w=>{const nw={...w};nw.USDT+=pos.posSz;if(isTp&&pos.side==="BUY")nw[asset]=Math.max(0,(nw[asset]||0)-pos.qty);return nw;});
      setTrades(t=>[{id:Date.now(),pair,action:isTp?"TP2":"SL",price:fp(pair,price),ts:new Date().toLocaleTimeString(),pnl:(isTp?"+":"")+"$"+Math.abs(pnl).toFixed(2)},...t].slice(0,100));
      setPositions(p=>{const np={...p};delete np[pair];return np;});
    });
  },[prices]);

  // ── AI Analyze ───────────────────────────────────────────────────────────────
  const analyze=useCallback(async(pair)=>{
    let cd=candles[pair];
    if(!cd||cd.length<30){cd=makeCandles(prices[pair]||SEED[pair]);setCandles(prev=>({...prev,[pair]:cd}));}
    setAiLoading(l=>({...l,[pair]:true}));

    const cls=cd.map(c=>c.c),price=prices[pair]||cls[cls.length-1],dp=DP[pair];
    const R=iRSI(cls),E9=iEMA(cls,9),E21=iEMA(cls,21),E50=iEMA(cls,50);
    const A=iATR(cd),B=iBB(cls),M=iMACD(cls),SK=iStoch(cd),VP=iVWAP(cd);
    const day=cd.slice(-96);
    const dH=day.length?Math.max(...day.map(c=>c.h)):0;
    const dL=day.length?Math.min(...day.map(c=>c.l)):0;
    const hasPos=!!positions[pair];
    const avail=walletRef.current.USDT;

    const prompt="You are a professional crypto futures trader. Analyze "+pair+" 15-minute chart.\n\n"
      +"PRICE: $"+price.toFixed(dp)+" | Day High: $"+dH.toFixed(dp)+" | Day Low: $"+dL.toFixed(dp)+"\n"
      +"VWAP: $"+VP.toFixed(dp)+" | ATR(14): "+A.toFixed(dp)+"\n"
      +"RSI(14): "+R.toFixed(1)+" | Stoch: "+SK.toFixed(1)+" | MACD: "+M.toFixed(dp>0?4:1)+"\n"
      +"EMA9: $"+E9.toFixed(dp)+" | EMA21: $"+E21.toFixed(dp)+" | EMA50: $"+E50.toFixed(dp)+"\n"
      +"EMA9>EMA21: "+(E9>E21)+" | EMA21>EMA50: "+(E21>E50)+" | Price>VWAP: "+(price>VP)+"\n"
      +"BB Upper: $"+B.u.toFixed(dp)+" | BB Mid: $"+B.m.toFixed(dp)+" | BB Lower: $"+B.lo.toFixed(dp)+"\n"
      +"Price vs BB: "+(price>B.u?"Above Upper (overbought)":price<B.lo?"Below Lower (oversold)":"Inside bands")+"\n"
      +"Available USDT: $"+avail.toFixed(2)+" | Has open position: "+hasPos+" | Leverage: 10x\n\n"
      +"STRATEGIES TO EVALUATE:\n"
      +"1. EMA Crossover: EMA9 cross EMA21 with EMA50 trend confirmation\n"
      +"2. RSI Extremes: oversold below 30 or overbought above 70\n"
      +"3. BB Breakout: price breaking bands with momentum\n"
      +"4. VWAP Bounce: price returning to VWAP from extremes\n"
      +"5. MACD Momentum: MACD cross with trend confirmation\n"
      +"6. Multi-confluence: require 3+ indicators to agree\n\n"
      +"RULES:\n"
      +"- Only BUY or SELL if confidence is 65% or above AND risk:reward is 1.5 or above\n"
      +"- If already in a position, only output HOLD\n"
      +"- If signals conflict or market is choppy, use HOLD\n"
      +"- SL must be below entry for BUY, above entry for SELL\n"
      +"- TP must be above entry for BUY, below entry for SELL\n\n"
      +"Respond with ONLY this JSON, no other text:\n"
      +"{\"signal\":\"BUY\",\"confidence\":75,\"strategy\":\"EMA Cross + VWAP\",\"reason\":\"One sentence under 20 words.\","
      +"\"entry\":"+price.toFixed(dp)+",\"sl\":"+(price-A*1.5).toFixed(dp)+",\"tp1\":"+(price+A*2).toFixed(dp)+","
      +"\"tp2\":"+(price+A*3.5).toFixed(dp)+",\"tp3\":"+(price+A*5).toFixed(dp)+",\"rr\":\"2.0\",\"bias\":\"bullish\"}";

    try{
      let sig;
      try{
        const r=await fetch(PROXY+"/ai/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,pair}),signal:AbortSignal.timeout(30000)});
        if(!r.ok)throw new Error("proxy failed");
        sig=await r.json();
      }catch{
        const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:400,messages:[{role:"user",content:prompt}]}),signal:AbortSignal.timeout(30000)});
        if(!r.ok)throw new Error("Direct API HTTP "+r.status);
        const d=await r.json();
        const txt=(d.content||[]).map(b=>b.text||"").join("").trim();
        const match=txt.match(/\{[\s\S]*?\}/);
        if(!match)throw new Error("No JSON in response");
        sig=JSON.parse(match[0]);
      }

      const rsk=calcRisk(walletRef.current.USDT,price,A,sig.signal,pair);
      setSignals(s=>({...s,[pair]:{...sig,ts:new Date().toLocaleTimeString(),price,atr:A}}));
      setRisks(r=>({...r,[pair]:rsk}));
      addLog("AI "+pair+": "+sig.signal+" "+sig.confidence+"% | "+sig.strategy,sig.signal==="BUY"?"buy":sig.signal==="SELL"?"sell":"info");

      const isLive=modeRef.current==="live";
      const canTrade=!isLive||(weexRef.current.connected&&walletRef.current.USDT>0);

      if(sig.signal!=="HOLD"&&Number(sig.confidence)>=65&&!hasPos&&running&&canTrade){
        const asset=pair.split("/")[0];
        const qty=parseFloat(rsk.qty);
        const posSz=parseFloat(rsk.pos);

        if(walletRef.current.USDT>0&&walletRef.current.USDT>=posSz){
          setWallet(w=>{const nw={...w};nw.USDT-=posSz;if(sig.signal==="BUY")nw[asset]=(nw[asset]||0)+qty;return nw;});
          setPositions(p=>({...p,[pair]:{
            side:sig.signal,entry:price,qty,posSz,
            sl:parseFloat(sig.sl)||rsk.sl,
            tp1:parseFloat(sig.tp1)||rsk.tp1,
            tp2:parseFloat(sig.tp2)||rsk.tp2,
            tp3:parseFloat(sig.tp3)||rsk.tp3,
            rAmt:parseFloat(rsk.risk),strategy:sig.strategy,ts:new Date().toLocaleTimeString()
          }}));
          setTrades(t=>[{id:Date.now(),pair,action:sig.signal,price:fp(pair,price),ts:new Date().toLocaleTimeString(),conf:sig.confidence,strat:sig.strategy},...t].slice(0,100));
          addLog(sig.signal+" "+pair+" @ $"+fp(pair,price)+" | SL $"+fp(pair,sig.sl)+" | TP2 $"+fp(pair,sig.tp2)+" | R:R "+rsk.rr,sig.signal==="BUY"?"buy":"sell");

          if(isLive&&weexRef.current.connected){
            try{
              const resp=await fetch(PROXY+"/weex/order",{
                method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({key:weexRef.current.key,secret:weexRef.current.secret,passphrase:weexRef.current.passphrase,pair,side:sig.signal,qty:qty.toString(),price,availableUSDT:walletRef.current.USDT})
              });
              const od=await resp.json();
              if(od.success)addLog("Weex order placed: "+sig.signal+" "+od.contracts+" contracts "+pair+" | orderId:"+od.orderId,"buy");
              else if(od.needsMoreFunds)addLog("Skipped: need $"+od.marginNeeded+" margin, have $"+walletRef.current.USDT.toFixed(2),"warn");
              else addLog("Order failed: "+od.error,"warn");
            }catch(e){addLog("Weex order error: "+e.message,"warn");}
          }
        }else{
          addLog(pair+" "+sig.signal+" skipped -- insufficient margin ($"+posSz+" needed, have $"+walletRef.current.USDT.toFixed(2)+")","warn");
        }
      }else if(isLive&&!weexRef.current.connected&&sig.signal!=="HOLD"&&running){
        addLog(pair+" "+sig.signal+" blocked -- connect Weex account first","warn");
      }
    }catch(e){
      addLog("AI error "+pair+": "+e.message,"warn");
      setSignals(s=>({...s,[pair]:{signal:"HOLD",confidence:0,strategy:"Error",reason:e.message,ts:new Date().toLocaleTimeString()}}));
    }
    setAiLoading(l=>({...l,[pair]:false}));
  },[candles,prices,positions,running,addLog]);

  // ── Bot loop ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(running){
      const isLive=modeRef.current==="live";
      const avail=walletRef.current.USDT;
      const affordablePairs=isLive
        ?PAIRS.filter(p=>{const cs=CS[p]||0.01;const margin=(cs*(pricesRef.current[p]||SEED[p]))/10;return margin<=avail;})
        :PAIRS;

      if(isLive&&affordablePairs.length===0){
        addLog("Bot stopped -- balance $"+avail.toFixed(2)+" too low for any contract. Add USDT to futures wallet.","warn");
        setRunning(false);return;
      }

      if(isLive&&weexRef.current.connected){
        const skipped=PAIRS.filter(p=>!affordablePairs.includes(p));
        addLog("Bot LIVE -- trading: "+affordablePairs.join(", ")+(skipped.length?" | skipping: "+skipped.join(", "):""),"sell");
      }else if(isLive&&!weexRef.current.connected){
        addLog("Live mode but Weex not connected -- go to Weex tab","warn");
      }else{
        addLog("Bot PAPER -- analyzing all pairs every 90s","info");
      }

      affordablePairs.forEach(p=>analyze(p));
      aiTimer.current=setInterval(()=>affordablePairs.forEach(p=>analyze(p)),90000);
    }else{
      clearInterval(aiTimer.current);
    }
    return()=>clearInterval(aiTimer.current);
  },[running]);

  // ── Weex connect ─────────────────────────────────────────────────────────────
  const connectWeex=useCallback(async()=>{
    if(!weexKey||!weexSecret){addLog("Enter API key and secret first","warn");return;}
    setConnecting(true);
    addLog("Connecting to Weex...","info");
    try{
      const r=await fetch(PROXY+"/weex/balance",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key:weexKey,secret:weexSecret,passphrase:weexPassphrase}),
        signal:AbortSignal.timeout(15000)
      });
      if(!r.ok)throw new Error("Proxy HTTP "+r.status+" -- is Railway deployed?");
      const d=await r.json();
      if(d.debug)d.debug.slice(0,6).forEach(line=>addLog(line.slice(0,130),"info"));
      if(d.error)throw new Error(d.error);
      setWeexBalance(d);setWeexConnected(true);
      const spotUSDT=parseFloat(d.spot?.USDT?.available||0);
      const futureUSDT=parseFloat(d.futures?.USDT?.available||0);
      const spotBTC=parseFloat(d.spot?.BTC?.available||0);
      const spotETH=parseFloat(d.spot?.ETH?.available||0);
      const spotSOL=parseFloat(d.spot?.SOL?.available||0);
      const totalUSDT=spotUSDT>0?spotUSDT:futureUSDT;
      if(totalUSDT>0||spotBTC>0||spotETH>0||spotSOL>0){
        setWallet({USDT:totalUSDT,BTC:spotBTC,ETH:spotETH,SOL:spotSOL});
        setStartBal(totalUSDT);setPnlHist([totalUSDT]);
        addLog("Weex connected! USDT: $"+totalUSDT.toFixed(2)+" ("+(spotUSDT>0?"Spot":"Futures")+") BTC:"+spotBTC+" ETH:"+spotETH+" SOL:"+spotSOL,"buy");
        if(futureUSDT>0)addLog("Futures USDT: $"+futureUSDT+" -- bot will trade with this","buy");
      }else{
        addLog("Weex API connected -- all balances zero. Add USDT to futures wallet.","warn");
      }
    }catch(e){
      addLog("Weex connection failed: "+e.message,"warn");
      setWeexConnected(true);setWeexBalance({spot:{},futures:{},error:e.message});
    }
    setConnecting(false);
  },[weexKey,weexSecret,weexPassphrase,addLog]);

  const disconnectWeex=()=>{
    setWeexConnected(false);setWeexBalance(null);
    setWeexKey("");setWeexSecret("");setWeexPassphrase("");
    setWallet({USDT:0,BTC:0,ETH:0,SOL:0});
    setStartBal(0);setPnlHist([]);
    addLog("Weex disconnected","warn");
  };

  // ── Emergency stop ────────────────────────────────────────────────────────────
  const executeEmergencyStop=useCallback(async()=>{
    setEmergencyLoading(true);setRunning(false);clearInterval(aiTimer.current);
    addLog("EMERGENCY STOP -- closing all positions...","loss");
    if(modeRef.current==="live"&&weexRef.current.connected){
      try{
        const r=await fetch(PROXY+"/weex/close",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:weexRef.current.key,secret:weexRef.current.secret,passphrase:weexRef.current.passphrase})});
        const d=await r.json();
        if(d.success)addLog("All Weex positions closed","buy");
        else addLog("Weex close-all: "+(d.error||JSON.stringify(d)),"warn");
      }catch(e){addLog("Weex close-all failed: "+e.message,"warn");}
    }
    Object.entries(positions).forEach(([pair,pos])=>{
      const price=pricesRef.current[pair]||pos.entry;
      const pnlAmt=(price-pos.entry)*pos.qty*(pos.side==="BUY"?1:-1);
      addLog("Closed "+pair+" @ $"+fp(pair,price)+" | "+(pnlAmt>=0?"+":"")+"$"+pnlAmt.toFixed(2),pnlAmt>=0?"buy":"loss");
      setTrades(t=>[{id:Date.now()+Math.random(),pair,action:"EMERGENCY CLOSE",price:fp(pair,price),ts:new Date().toLocaleTimeString(),pnl:(pnlAmt>=0?"+":"")+"$"+pnlAmt.toFixed(2)},...t].slice(0,100));
    });
    setPositions({});setSignals({});
    addLog("Emergency stop complete.","buy");
    setEmergencyLoading(false);setEmergencyDone(true);
  },[positions,addLog]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const tv=totalVal();
  const pnl=startBal>0?tv-startBal:0;
  const pnlPct=startBal>0?((pnl/startBal)*100).toFixed(2):"0.00";
  const closedTrades=trades.filter(t=>t.pnl);
  const winRate=closedTrades.length?Math.round(trades.filter(t=>t.pnl&&t.pnl.startsWith("+")).length/closedTrades.length*100):0;
  const TABS=["markets","signals","chart","positions","trades","weex","logs","settings"];

  return(
    <div style={{background:"linear-gradient(135deg,#0f0c29,#302b63,#24243e)",minHeight:"100vh",fontFamily:"system-ui,sans-serif",color:"#fff",padding:12,boxSizing:"border-box"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#6c5ce7,#a78bfa)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 4px 15px rgba(108,92,231,0.5)"}}>SJ</div>
          <div>
            <div style={{fontWeight:800,fontSize:16,background:"linear-gradient(90deg,#ffd700,#ff6b00,#a78bfa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Shah Jee Trading Bot</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:priceSource.includes("Sim")?"#ffd700":"#00ff88",display:"inline-block"}}/>
              {priceSource}
              {weexConnected&&<span style={{color:"#00ff88",fontWeight:600}}>Weex Connected</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{...pill(mode==="paper"?"rgba(0,255,136,0.15)":"rgba(255,68,102,0.15)",mode==="paper"?"#00ff88":"#ff4466")}}>{mode==="paper"?"Paper":"LIVE"}</span>
          <button onClick={()=>setRunning(r=>!r)} style={{...gbtn(running?"rgba(255,68,102,0.2)":"rgba(0,255,136,0.2)",running?"#ff4466":"#00ff88",running?"#ff446650":"#00ff8850")}}>
            {running?"Stop Bot":"Start Bot"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:3,marginBottom:14,background:"rgba(255,255,255,0.05)",borderRadius:14,padding:4,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:"0 0 auto",padding:"7px 12px",borderRadius:10,cursor:"pointer",fontSize:11,fontWeight:tab===t?700:400,color:tab===t?"#fff":"rgba(255,255,255,0.4)",background:tab===t?"linear-gradient(135deg,rgba(108,92,231,0.6),rgba(167,139,250,0.4))":"transparent",border:"none",textTransform:"capitalize",whiteSpace:"nowrap"}}>
            {t==="weex"?"Weex":t==="signals"?"Signals":t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {/* MARKETS */}
      {tab==="markets"&&(
        <div>
          <div style={{...glass({background:"linear-gradient(135deg,rgba(108,92,231,0.3),rgba(56,189,248,0.2))",marginBottom:12})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:4}}>{mode==="paper"?"Paper Portfolio":"Live Portfolio"}</div>
                <div style={{fontSize:32,fontWeight:800,letterSpacing:-1}}>{tv>0?"$"+tv.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"--"}</div>
                {startBal>0&&<div style={{fontSize:13,color:pnl>=0?"#00ff88":"#ff4466",fontWeight:600,marginTop:4}}>{pnl>=0?"+ $":"- $"}{Math.abs(pnl).toFixed(2)} ({pnl>=0?"+":""}{pnlPct}%)</div>}
                {!weexConnected&&mode==="live"&&<div style={{fontSize:12,color:"#ffd700",marginTop:4}}>Connect Weex to see live balance</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>Free USDT</div>
                <div style={{fontSize:18,fontWeight:700,margin:"4px 0"}}>${wallet.USDT.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>1% = ${(wallet.USDT*0.01).toFixed(2)}</div>
              </div>
            </div>
            {pnlHist.length>1&&<div style={{marginTop:10}}><Spark data={pnlHist} colors={pnl>=0?["#00ff88","#38bdf8"]:["#ff4466","#f97316"]} w={580} h={36}/></div>}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
            {[[Object.keys(positions).length,"Positions","#38bdf8"],
              [Object.values(signals).filter(s=>s?.signal!=="HOLD").length,"Signals","#ffd700"],
              [trades.length,"Trades","#a78bfa"],
              [winRate+"%","Win Rate","#00ff88"]
            ].map(([v,l,c])=>(
              <div key={l} style={mini()}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginBottom:4}}>{l}</div><div style={{fontSize:20,fontWeight:700,color:c}}>{v}</div></div>
            ))}
          </div>

          {PAIRS.map(pair=>{
            const price=prices[pair]||0,cd=candles[pair]||[],cls=cd.map(c=>c.c);
            const prev=cd[cd.length-2]?.c||price,chg=prev?((price-prev)/prev*100):0;
            const sig=signals[pair],rsk=risks[pair],pos=positions[pair];
            const R=cls.length>15?iRSI(cls):50,A=cd.length>15?iATR(cd):0;
            const [c1,c2]=GRAD[pair];
            return(
              <div key={pair} onClick={()=>{setSelPair(pair);setTab("chart");}} style={{...glass({cursor:"pointer",borderColor:pos?c1+"66":"rgba(255,255,255,0.1)",marginBottom:10})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                      <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,"+c1+","+c2+")",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff"}}>{ICON[pair]}</div>
                      <span style={{fontWeight:700,fontSize:15}}>{pair}</span>
                      {pos&&<span style={{...pill(pos.side==="BUY"?"rgba(0,255,136,0.15)":"rgba(255,68,102,0.15)",pos.side==="BUY"?"#00ff88":"#ff4466")}}>{pos.side}</span>}
                      {aiLoading[pair]&&<span style={{fontSize:10,color:"#a78bfa"}}>Analyzing...</span>}
                      {sig&&!aiLoading[pair]&&<span style={{...pill(SB(sig.signal),SC(sig.signal)),border:"1px solid "+SC(sig.signal)+"44"}}>{sig.signal} {sig.confidence}%</span>}
                    </div>
                    <div style={{fontSize:28,fontWeight:800,letterSpacing:-0.5,background:"linear-gradient(90deg,"+c1+","+c2+")",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:4}}>
                      {price>0?"$"+price.toLocaleString("en-US",{minimumFractionDigits:DP[pair],maximumFractionDigits:DP[pair]}):"Loading..."}
                    </div>
                    <div style={{fontSize:12,color:chg>=0?"#00ff88":"#ff4466",fontWeight:600,marginBottom:6}}>{chg>=0?"+ ":"- "}{Math.abs(chg).toFixed(3)}%</div>
                    {sig&&!aiLoading[pair]&&<p style={{margin:"0 0 6px",fontSize:12,color:"rgba(255,255,255,0.55)",lineHeight:1.5}}>{sig.reason}</p>}
                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>RSI <b style={{color:R>70?"#ff4466":R<30?"#00ff88":"#ffd700"}}>{R.toFixed(0)}</b></span>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>ATR <b>{A.toFixed(DP[pair])}</b></span>
                      {sig?.strategy&&<span style={{fontSize:11,color:"#a78bfa",fontWeight:500}}>{sig.strategy}</span>}
                    </div>
                  </div>
                  <Spark data={cd.slice(-30).map(c=>c.c)} colors={GRAD[pair]}/>
                </div>
                {sig&&sig.signal!=="HOLD"&&rsk&&!aiLoading[pair]&&(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
                    {[["Entry",sig.entry,"#fff"],["SL",sig.sl,"#ff4466"],["TP1",sig.tp1,"#7ef763"],["TP2",sig.tp2,"#00ff88"],["Risk","$"+rsk.risk,"#ffd700"]].map(([l,v,c])=>(
                      <div key={l} style={{background:"rgba(255,255,255,0.06)",borderRadius:8,padding:"5px 7px"}}>
                        <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",marginBottom:2}}>{l}</div>
                        <div style={{fontSize:11,fontWeight:600,color:c}}>{l==="Risk"?v:"$"+Number(v).toFixed(DP[pair])}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!running&&(
            <div style={{textAlign:"center",padding:"1.5rem",color:"rgba(255,255,255,0.3)",fontSize:13,background:"rgba(255,255,255,0.03)",borderRadius:14,border:"1px dashed rgba(255,255,255,0.1)"}}>
              Press <b style={{color:"#00ff88"}}>Start Bot</b> to begin AI trading
            </div>
          )}
        </div>
      )}

      {/* SIGNALS */}
      {tab==="signals"&&(
        <div>
          {PAIRS.map(pair=>{
            const sig=signals[pair],rsk=risks[pair],price=prices[pair]||0,dp=DP[pair];
            const cd=candles[pair]||[],cls=cd.map(c=>c.c);
            const R=iRSI(cls),E9=iEMA(cls,9),E21=iEMA(cls,21),M=iMACD(cls),SK=iStoch(cd);
            const [c1,c2]=GRAD[pair],pos=positions[pair];
            return(
              <div key={pair} style={{...glass({marginBottom:14,borderColor:sig?SC(sig.signal)+"33":"rgba(255,255,255,0.1)"})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:38,height:38,borderRadius:11,background:"linear-gradient(135deg,"+c1+","+c2+")",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#fff"}}>{ICON[pair]}</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{pair}</div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>15m -- ${price>0?price.toLocaleString("en-US",{minimumFractionDigits:dp,maximumFractionDigits:dp}):"--"}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {sig&&<span style={{...pill(SB(sig.signal),SC(sig.signal)),fontSize:13,padding:"5px 14px"}}>{sig.signal} {sig.confidence}%</span>}
                    <button onClick={e=>{e.stopPropagation();analyze(pair);}} disabled={!!aiLoading[pair]} style={{...gbtn("rgba(108,92,231,0.25)","#a78bfa","rgba(108,92,231,0.5)"),padding:"6px 14px",fontSize:12,opacity:aiLoading[pair]?0.5:1}}>
                      {aiLoading[pair]?"...":"Analyze"}
                    </button>
                  </div>
                </div>
                {sig&&(
                  <>
                    <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                      <span style={{...pill("rgba(167,139,250,0.15)","#a78bfa")}}>{sig.strategy}</span>
                      <span style={{...pill("rgba(255,255,255,0.07)","rgba(255,255,255,0.6)")}}>{sig.bias}</span>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:13,color:"rgba(255,255,255,0.65)",lineHeight:1.6}}>{sig.reason}</div>
                    {sig.signal!=="HOLD"&&rsk&&(
                      <>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                          <div style={{background:"rgba(255,255,255,0.07)",borderRadius:12,padding:"10px 12px"}}>
                            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginBottom:4}}>ENTRY</div>
                            <div style={{fontSize:20,fontWeight:800}}>${Number(sig.entry).toFixed(dp)}</div>
                          </div>
                          <div style={{background:"rgba(255,68,102,0.1)",borderRadius:12,padding:"10px 12px",border:"1px solid rgba(255,68,102,0.25)"}}>
                            <div style={{fontSize:10,color:"#ff4466",marginBottom:4,fontWeight:600}}>STOP LOSS</div>
                            <div style={{fontSize:20,fontWeight:800,color:"#ff4466"}}>${Number(sig.sl).toFixed(dp)}</div>
                            <div style={{fontSize:10,color:"rgba(255,68,102,0.6)"}}>Max loss: -${rsk.risk}</div>
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
                          {[["TP1",sig.tp1,"rgba(126,247,99,0.1)","#7ef763","Conservative"],
                            ["TP2",sig.tp2,"rgba(0,255,136,0.1)","#00ff88","Primary"],
                            ["TP3",sig.tp3,"rgba(56,189,248,0.1)","#38bdf8","Extended"]
                          ].map(([l,v,bg,c,label])=>(
                            <div key={l} style={{background:bg,borderRadius:12,padding:"10px 12px",border:"1px solid "+c+"44"}}>
                              <div style={{fontSize:10,color:c,marginBottom:4,fontWeight:600}}>{l}</div>
                              <div style={{fontSize:16,fontWeight:800,color:c}}>${Number(v).toFixed(dp)}</div>
                              <div style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>{label}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{background:"rgba(108,92,231,0.15)",borderRadius:12,padding:"10px 14px",border:"1px solid rgba(108,92,231,0.3)"}}>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                            {[["Risk","$"+rsk.risk,"#ffd700"],["Margin","$"+rsk.pos,"#a78bfa"],["Qty",rsk.qty.slice(0,8),"#38bdf8"],["R:R",rsk.rr+":1","#00ff88"]].map(([l,v,c])=>(
                              <div key={l} style={{textAlign:"center"}}>
                                <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",marginBottom:3}}>{l}</div>
                                <div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {pos&&<div style={{textAlign:"center",padding:"8px",marginTop:8,fontSize:12,color:"#ffd700",background:"rgba(255,215,0,0.1)",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)"}}>Position open -- monitoring SL/TP automatically</div>}
                      </>
                    )}
                    {sig.signal==="HOLD"&&<div style={{textAlign:"center",padding:"14px",background:"rgba(255,215,0,0.08)",borderRadius:12,border:"1px solid rgba(255,215,0,0.2)",color:"#ffd700",fontSize:13}}>Waiting for high-probability setup...</div>}
                  </>
                )}
                {!sig&&<div style={{textAlign:"center",padding:"20px",color:"rgba(255,255,255,0.3)",fontSize:13}}>Press Analyze to generate AI signal</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:12,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                  {[["RSI",R.toFixed(0),R>70?"#ff4466":R<30?"#00ff88":"#ffd700"],
                    ["Stoch",SK.toFixed(0),SK>80?"#ff4466":SK<20?"#00ff88":"#ffd700"],
                    ["MACD",M.toFixed(dp>0?2:1),M>0?"#00ff88":"#ff4466"],
                    ["EMA",E9>E21?"Bull":"Bear",E9>E21?"#00ff88":"#ff4466"]
                  ].map(([l,v,c])=>(
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

      {/* CHART */}
      {tab==="chart"&&(
        <div>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {PAIRS.map(p=>(
              <button key={p} onClick={()=>setSelPair(p)} style={{flex:1,padding:"8px 0",borderRadius:12,cursor:"pointer",fontSize:12,fontWeight:selPair===p?700:400,color:selPair===p?"#fff":"rgba(255,255,255,0.4)",background:selPair===p?"linear-gradient(135deg,"+GRAD[p][0]+"44,"+GRAD[p][1]+"44)":"rgba(255,255,255,0.05)",border:"1.5px solid "+(selPair===p?GRAD[p][0]+"88":"rgba(255,255,255,0.08)")}}>
                {ICON[p]} {p.split("/")[0]}
              </button>
            ))}
          </div>
          <TVChart pair={selPair} sig={signals[selPair]} rsk={risks[selPair]}/>
          <div style={glass()}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Live Indicators -- {selPair}</div>
            {(()=>{
              const cd=candles[selPair]||[],cls=cd.map(c=>c.c),price=prices[selPair]||0,dp=DP[selPair];
              const R=iRSI(cls),E9=iEMA(cls,9),E21=iEMA(cls,21),E50=iEMA(cls,50),A=iATR(cd),B=iBB(cls),M=iMACD(cls),SK=iStoch(cd);
              return(
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
                  {[["RSI(14)",R.toFixed(1),R>70?"#ff4466":R<30?"#00ff88":"#ffd700",R>70?"Overbought":R<30?"Oversold":"Neutral"],
                    ["Stoch(14)",SK.toFixed(1),SK>80?"#ff4466":SK<20?"#00ff88":"#ffd700","Momentum"],
                    ["MACD",M.toFixed(dp>0?3:1),M>0?"#00ff88":"#ff4466",M>0?"Bullish":"Bearish"],
                    ["EMA9 vs 21",E9>E21?"Above":"Below",E9>E21?"#00ff88":"#ff4466",E9>E21?"Uptrend":"Downtrend"],
                    ["EMA50","$"+E50.toFixed(dp),price>E50?"#00ff88":"#ff4466",price>E50?"Price Above":"Price Below"],
                    ["ATR(14)",A.toFixed(dp),"#fff",A/price<0.005?"Low Vol":A/price<0.012?"Med Vol":"High Vol"],
                    ["BB Upper","$"+B.u.toFixed(dp),"#ff4466","Resistance"],
                    ["BB Lower","$"+B.lo.toFixed(dp),"#00ff88","Support"],
                  ].map(([l,v,c,n])=>(
                    <div key={l} style={mini()}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>{l}</div><div style={{fontSize:14,fontWeight:700,color:c,margin:"3px 0"}}>{v}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{n}</div></div>
                  ))}
                </div>
              );
            })()}
          </div>
          <button onClick={()=>analyze(selPair)} disabled={!!aiLoading[selPair]} style={{...gbtn("linear-gradient(135deg,rgba(108,92,231,0.4),rgba(167,139,250,0.3))","#a78bfa","rgba(108,92,231,0.5)"),width:"100%",marginBottom:10,opacity:aiLoading[selPair]?0.5:1}}>
            {aiLoading[selPair]?"Analyzing with Claude AI...":"Re-analyze with Claude AI"}
          </button>
        </div>
      )}

      {/* POSITIONS */}
      {tab==="positions"&&(
        <div>
          {Object.keys(positions).length===0
            ?<div style={{textAlign:"center",padding:"4rem 0",color:"rgba(255,255,255,0.3)"}}>No open positions</div>
            :Object.entries(positions).map(([pair,pos])=>{
              const price=prices[pair]||0,dp=DP[pair];
              const unreal=(price-pos.entry)*pos.qty*(pos.side==="BUY"?1:-1);
              const prog=Math.min(100,Math.max(0,((price-pos.sl)/((pos.tp2-pos.sl)||1))*100));
              const [c1,c2]=GRAD[pair];
              return(
                <div key={pair} style={{...glass({borderColor:c1+"55",marginBottom:10})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(135deg,"+c1+","+c2+")",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff"}}>{ICON[pair]}</div>
                      <span style={{fontWeight:700}}>{pair}</span>
                      <span style={{...pill(pos.side==="BUY"?"rgba(0,255,136,0.15)":"rgba(255,68,102,0.15)",pos.side==="BUY"?"#00ff88":"#ff4466")}}>{pos.side}</span>
                    </div>
                    <span style={{fontSize:18,fontWeight:800,color:unreal>=0?"#00ff88":"#ff4466"}}>{unreal>=0?"+":""}${unreal.toFixed(2)}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:10}}>
                    {[["Entry","$"+pos.entry.toFixed(dp)],["Current","$"+price.toFixed(dp)],["Margin","$"+pos.posSz.toFixed(2)]].map(([l,v])=>(
                      <div key={l} style={mini()}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>{l}</div><div style={{fontSize:13,fontWeight:700}}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{height:6,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden",marginBottom:8}}>
                    <div style={{height:"100%",width:prog+"%",background:"linear-gradient(90deg,"+c1+","+c2+")",borderRadius:3,transition:"width 0.5s"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:8}}>
                    <span style={{color:"#ff4466"}}>SL ${Number(pos.sl).toFixed(dp)}</span>
                    <span style={{color:"#00ff88"}}>TP2 ${Number(pos.tp2).toFixed(dp)}</span>
                  </div>
                  <div style={{fontSize:11,color:"#a78bfa"}}>Strategy: {pos.strategy}</div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* TRADES */}
      {tab==="trades"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {[[pnl>=0?"+$"+Math.abs(pnl).toFixed(2):"-$"+Math.abs(pnl).toFixed(2),"Total P&L",pnl>=0?"#00ff88":"#ff4466"],
              [closedTrades.length,"Closed","#38bdf8"],
              [winRate+"%","Win Rate","#00ff88"]
            ].map(([v,l,c])=>(
              <div key={l} style={glass()}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginBottom:4}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div></div>
            ))}
          </div>
          <div style={glass()}>
            <div style={{fontWeight:700,marginBottom:12}}>Trade History</div>
            {!trades.length
              ?<div style={{textAlign:"center",padding:"2rem",color:"rgba(255,255,255,0.3)"}}>No trades yet -- start the bot</div>
              :trades.map(tr=>(
                <div key={tr.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:30,height:30,borderRadius:8,background:tr.action==="BUY"||tr.action==="TP2"?"rgba(0,255,136,0.15)":"rgba(255,68,102,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:tr.action==="BUY"||tr.action==="TP2"?"#00ff88":"#ff4466"}}>
                      {tr.action.charAt(0)}
                    </div>
                    <div>
                      <div style={{fontWeight:600,fontSize:13}}>{tr.action} {tr.pair}</div>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{tr.ts}{tr.strat?" -- "+tr.strat:""}{tr.conf?" -- "+tr.conf+"%":""}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:600}}>${tr.price}</div>
                    {tr.pnl&&<div style={{fontSize:11,fontWeight:700,color:tr.pnl.startsWith("+")?"#00ff88":"#ff4466"}}>{tr.pnl}</div>}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* WEEX */}
      {tab==="weex"&&<WeexTab weexConnected={weexConnected} weexBalance={weexBalance} weexKey={weexKey} setWeexKey={setWeexKey} weexSecret={weexSecret} setWeexSecret={setWeexSecret} weexPassphrase={weexPassphrase} setWeexPassphrase={setWeexPassphrase} connecting={connecting} connectWeex={connectWeex} disconnectWeex={disconnectWeex}/>}

      {/* LOGS */}
      {tab==="logs"&&(
        <div style={glass()}>
          <div style={{fontWeight:700,marginBottom:12}}>Activity Log</div>
          {logs.map((l,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",alignItems:"flex-start"}}>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.3)",minWidth:55,flexShrink:0}}>{l.ts}</span>
              <span style={{width:6,height:6,borderRadius:"50%",marginTop:4,flexShrink:0,background:l.type==="buy"?"#00ff88":l.type==="sell"||l.type==="loss"?"#ff4466":l.type==="warn"?"#ffd700":"rgba(255,255,255,0.3)"}}/>
              <span style={{fontSize:12,lineHeight:1.5,color:l.type==="buy"?"#00ff88":l.type==="sell"||l.type==="loss"?"#ff4466":l.type==="warn"?"#ffd700":"rgba(255,255,255,0.6)"}}>{l.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* SETTINGS */}
      {tab==="settings"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={glass()}>
            <div style={{fontWeight:700,marginBottom:12}}>Trading Mode</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["paper","Paper Mode","Simulated -- safe to test","#00ff88"],
                ["live","Live Mode","Real Weex orders","#ff4466"]
              ].map(([m,t,s,c])=>(
                <button key={m} onClick={()=>setMode(m)} style={{padding:12,borderRadius:12,cursor:"pointer",background:mode===m?c+"18":"rgba(255,255,255,0.05)",border:"1.5px solid "+(mode===m?c+"60":"rgba(255,255,255,0.1)"),textAlign:"left"}}>
                  <div style={{fontWeight:700,color:mode===m?c:"#fff",marginBottom:3}}>{t}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{s}</div>
                </button>
              ))}
            </div>
            {mode==="live"&&!weexConnected&&<div style={{marginTop:10,padding:"10px",background:"rgba(255,68,102,0.1)",borderRadius:10,border:"1px solid rgba(255,68,102,0.3)",fontSize:12,color:"#ff4466"}}>Connect Weex in the Weex tab first</div>}
          </div>
          <div style={glass()}>
            <div style={{fontWeight:700,marginBottom:10}}>Bot Configuration</div>
            {[["Pairs","BTC/USDT, ETH/USDT, SOL/USDT"],["Timeframe","15 minutes"],["AI Engine","Claude claude-sonnet-4-6"],["Interval","Every 90 seconds"],["Risk/trade","1% of wallet"],["Leverage","10x futures"],["Stop Loss","1.5x ATR"],["Take Profits","TP1=2x TP2=3.5x TP3=5x ATR"],["Min Confidence","65%"],["Max positions","1 per pair"],["Contract sizes","BTC=0.001 ETH=0.01 SOL=0.1"]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:12}}>
                <span style={{color:"rgba(255,255,255,0.45)"}}>{l}</span><span style={{fontWeight:600,color:"#a78bfa"}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={glass()}>
            <div style={{fontWeight:700,marginBottom:10}}>AI Strategies</div>
            {[["EMA Crossover","EMA9 x EMA21 with EMA50 filter"],["RSI Extremes","Oversold below 30, Overbought above 70"],["BB Breakout","Bollinger band squeeze and breakout"],["VWAP Bounce","Price returning to VWAP from extremes"],["MACD Momentum","MACD cross with trend direction"],["Multi-confluence","3+ indicators must agree"]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:12}}>
                <span style={{color:"rgba(255,255,255,0.45)"}}>{l}</span><span style={{fontSize:11,color:"rgba(255,255,255,0.5)",maxWidth:"55%",textAlign:"right"}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergency Stop */}
      <div style={{marginTop:16,marginBottom:4}}>
        <button onClick={()=>setShowEmergency(true)} style={{width:"100%",padding:"14px",borderRadius:16,cursor:"pointer",fontWeight:800,fontSize:15,background:"rgba(255,0,60,0.12)",color:"#ff0044",border:"2px solid rgba(255,0,60,0.4)"}}>
          EMERGENCY STOP -- Close All Positions
        </button>
      </div>
      <div style={{textAlign:"center",fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:8}}>
        Shah Jee Trading Bot v2.0 -- Claude AI -- Weex Futures -- 10x Leverage
      </div>

      <EmergencyModal show={showEmergency} done={emergencyDone} loading={emergencyLoading} positions={positions} prices={prices} onConfirm={executeEmergencyStop} onClose={()=>{setShowEmergency(false);setEmergencyDone(false);}}/>
    </div>
  );
}