import { useState, useEffect, useRef, useCallback } from "react";

const PAIRS = ["BTC/USDT","ETH/USDT","SOL/USDT"];
const GRAD  = {"BTC/USDT":["#f7931a","#ff6b00"],"ETH/USDT":["#627eea","#a78bfa"],"SOL/USDT":["#9945ff","#14f195"]};
const ICON  = {"BTC/USDT":"₿","ETH/USDT":"Ξ","SOL/USDT":"◎"};
const SEED  = {"BTC/USDT":104000,"ETH/USDT":2500,"SOL/USDT":170};
const DP    = {"BTC/USDT":1,"ETH/USDT":2,"SOL/USDT":3};

function makeCandles(base,n=100){
  let p=base;
  return Array.from({length:n},(_,i)=>{
    const chg=(Math.random()-0.49)*p*0.007,o=p,c=p+chg;
    const h=Math.max(o,c)+Math.random()*p*0.003,l=Math.min(o,c)-Math.random()*p*0.003;
    p=c; return {o,h,l,c,v:50+Math.random()*200,t:Date.now()-(n-i)*900000};
  });
}

function iRSI(a,p=14){if(a.length<p+1)return 50;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];d>0?g+=d:l-=d;}return 100-100/(1+g/(l||1e-9));}
function iEMA(a,p){if(!a||a.length<2)return a?.[0]||0;const k=2/(p+1);let e=a.slice(0,Math.min(p,a.length)).reduce((x,y)=>x+y,0)/Math.min(p,a.length);for(let i=Math.min(p,a.length);i<a.length;i++)e=a[i]*k+e*(1-k);return e;}
function iATR(cd,p=14){if(!cd||cd.length<2)return 0;const s=cd.slice(-Math.min(p+1,cd.length));return s.map((c,i)=>i===0?c.h-c.l:Math.max(c.h-c.l,Math.abs(c.h-s[i-1].c),Math.abs(c.l-s[i-1].c))).reduce((a,b)=>a+b,0)/s.length;}
function iBB(a,p=20){const b=a?.[a.length-1]||0;if(!a||a.length<p)return{u:b*1.02,m:b,lo:b*0.98};const s=a.slice(-p),m=s.reduce((x,y)=>x+y,0)/p;return{u:m+2*Math.sqrt(s.reduce((x,y)=>x+(y-m)**2,0)/p),m,lo:m-2*Math.sqrt(s.reduce((x,y)=>x+(y-m)**2,0)/p)};}
function iMACD(a){return iEMA(a,12)-iEMA(a,26);}
function iStoch(cd,p=14){const s=cd?.slice(-p);if(!s?.length)return 50;const hi=Math.max(...s.map(c=>c.h)),lo=Math.min(...s.map(c=>c.l));return((cd[cd.length-1].c-lo)/(hi-lo||1))*100;}
function calcRisk(usdt,price,atrVal,side){
  const risk=usdt*0.01,slDist=Math.max(atrVal*1.5,price*0.005),qty=risk/slDist;
  const pos=Math.min(qty*price,usdt*0.15),sl=side==="BUY"?price-slDist:price+slDist;
  return{risk:risk.toFixed(2),qty:qty.toFixed(6),pos:pos.toFixed(2),sl,
    tp1:side==="BUY"?price+atrVal*2:price-atrVal*2,
    tp2:side==="BUY"?price+atrVal*3.5:price-atrVal*3.5,
    tp3:side==="BUY"?price+atrVal*5:price-atrVal*5,
    rr:(atrVal*2/slDist).toFixed(1)};
}
function fp(pair,val){if(!val&&val!==0)return"—";return Number(val).toLocaleString("en-US",{minimumFractionDigits:DP[pair],maximumFractionDigits:DP[pair]});}

const SC=s=>s==="BUY"?"#00ff88":s==="SELL"?"#ff4466":"#ffd700";
const SB=s=>s==="BUY"?"rgba(0,255,136,0.12)":s==="SELL"?"rgba(255,68,102,0.12)":"rgba(255,215,0,0.1)";
const glass=(ex={})=>({background:"rgba(255,255,255,0.05)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:18,padding:"14px 16px",marginBottom:12,...ex});
const mini=(ex={})=>({background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"10px 12px",...ex});
const pill=(bg,c)=>({fontSize:11,padding:"3px 10px",borderRadius:20,background:bg,color:c,fontWeight:600});
const gbtn=(bg,c,bd)=>({padding:"9px 20px",borderRadius:12,cursor:"pointer",fontWeight:600,fontSize:13,background:bg,color:c,border:`1.5px solid ${bd}`});

// ── Sparkline ──────────────────────────────────────────────────────────────────
function Spark({data,colors,w=130,h=44}){
  const ref=useRef();
  useEffect(()=>{
    const cv=ref.current;if(!cv||!data||data.length<2)return;
    const ctx=cv.getContext("2d");ctx.clearRect(0,0,w,h);
    const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;
    const pts=data.map((v,i)=>({x:(i/(data.length-1))*w,y:h-4-((v-mn)/rng)*(h-8)}));
    const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,colors[0]+"99");g.addColorStop(1,colors[1]+"99");
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,colors[0]+"33");bg.addColorStop(1,colors[0]+"00");
    ctx.beginPath();ctx.moveTo(pts[0].x,h);pts.forEach(p=>ctx.lineTo(p.x,p.y));ctx.lineTo(pts[pts.length-1].x,h);ctx.closePath();ctx.fillStyle=bg;ctx.fill();
    ctx.beginPath();ctx.strokeStyle=g;ctx.lineWidth=2;ctx.lineJoin="round";ctx.lineCap="round";pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.stroke();
  },[data,colors,w,h]);
  return <canvas ref={ref} width={w} height={h} style={{display:"block"}}/>;
}

// ── TradingView with drawn levels ──────────────────────────────────────────────
function TVChart({pair,levels}){
  const sym={"BTC/USDT":"BINANCE:BTCUSDT","ETH/USDT":"BINANCE:ETHUSDT","SOL/USDT":"BINANCE:SOLUSDT"}[pair];
  const ov=encodeURIComponent(JSON.stringify({
    "mainSeriesProperties.candleStyle.upColor":"#00ff88",
    "mainSeriesProperties.candleStyle.downColor":"#ff4466",
    "mainSeriesProperties.candleStyle.borderUpColor":"#00ff88",
    "mainSeriesProperties.candleStyle.borderDownColor":"#ff4466",
    "mainSeriesProperties.candleStyle.wickUpColor":"#00ff88",
    "mainSeriesProperties.candleStyle.wickDownColor":"#ff4466",
  }));
  const dp=DP[pair];
  const [c1,c2]=GRAD[pair];

  return(
    <div style={{position:"relative",marginBottom:12}}>
      {/* TradingView iframe */}
      <div style={{borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.1)"}}>
        <iframe key={pair}
          src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(sym)}&interval=15&theme=dark&style=1&locale=en&toolbar_bg=131722&withdateranges=1&hide_side_toolbar=0&overrides=${ov}&disabled_features=["use_localstorage_for_settings"]`}
          style={{width:"100%",height:420,border:"none",display:"block"}} title="Chart"/>
      </div>

      {/* Level badges overlaid BELOW the chart */}
      {levels&&(
        <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:6}}>
          {levels.dH>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:"rgba(255,215,0,0.15)",color:"#ffd700",border:"1px solid rgba(255,215,0,0.3)",fontWeight:600}}>📈 Day High ${levels.dH.toFixed(dp)}</span>}
          {levels.dL>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:"rgba(255,215,0,0.15)",color:"#ffd700",border:"1px solid rgba(255,215,0,0.3)",fontWeight:600}}>📉 Day Low ${levels.dL.toFixed(dp)}</span>}
          {levels.sig&&levels.sig!=="HOLD"&&levels.entry&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:"rgba(255,255,255,0.1)",color:"#fff",border:"1px solid rgba(255,255,255,0.2)",fontWeight:600}}>🎯 Entry ${Number(levels.entry).toFixed(dp)}</span>}
          {levels.sig&&levels.sig!=="HOLD"&&levels.sl&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:"rgba(255,68,102,0.15)",color:"#ff4466",border:"1px solid rgba(255,68,102,0.3)",fontWeight:600}}>🛑 SL ${Number(levels.sl).toFixed(dp)}</span>}
          {levels.sig&&levels.sig!=="HOLD"&&levels.tp1&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:"rgba(126,247,99,0.12)",color:"#7ef763",border:"1px solid rgba(126,247,99,0.3)",fontWeight:600}}>TP1 ${Number(levels.tp1).toFixed(dp)}</span>}
          {levels.sig&&levels.sig!=="HOLD"&&levels.tp2&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:"rgba(0,255,136,0.12)",color:"#00ff88",border:"1px solid rgba(0,255,136,0.3)",fontWeight:600}}>TP2 ${Number(levels.tp2).toFixed(dp)}</span>}
          {levels.sig&&levels.sig!=="HOLD"&&levels.tp3&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:"rgba(56,189,248,0.12)",color:"#38bdf8",border:"1px solid rgba(56,189,248,0.3)",fontWeight:600}}>TP3 ${Number(levels.tp3).toFixed(dp)}</span>}
          {levels.bbU>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:"rgba(255,68,102,0.1)",color:"#ff4466",border:"1px solid rgba(255,68,102,0.2)",fontWeight:600}}>BB↑ ${levels.bbU.toFixed(dp)}</span>}
          {levels.bbL>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:8,background:"rgba(0,255,136,0.1)",color:"#00ff88",border:"1px solid rgba(0,255,136,0.2)",fontWeight:600}}>BB↓ ${levels.bbL.toFixed(dp)}</span>}
        </div>
      )}

      {/* Vertical price scale drawn as SVG beside chart */}
      {levels&&levels.sig&&levels.sig!=="HOLD"&&(
        <div style={{marginTop:10,background:"rgba(0,0,0,0.3)",borderRadius:12,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginBottom:8,fontWeight:600}}>PRICE LADDER</div>
          {[
            ["TP3",levels.tp3,"#38bdf8"],
            ["TP2",levels.tp2,"#00ff88"],
            ["TP1",levels.tp1,"#7ef763"],
            ["ENTRY",levels.entry,"#ffffff"],
            ["STOP LOSS",levels.sl,"#ff4466"],
          ].sort((a,b)=>Number(b[1])-Number(a[1])).map(([label,val,color])=>{
            const isEntry=label==="ENTRY";
            return(
              <div key={label} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <div style={{width:4,height:24,borderRadius:2,background:color,flexShrink:0}}/>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.4)",minWidth:70,fontWeight:isEntry?700:400}}>{label}</span>
                <div style={{flex:1,height:1,background:`linear-gradient(90deg,${color}66,transparent)`}}/>
                <span style={{fontSize:13,fontWeight:700,color}}>${Number(val).toFixed(DP[pair])}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Chart Tab ──────────────────────────────────────────────────────────────────
function ChartTab({selPair,setSelPair,candles,prices,signals,risks,aiLoading,onAnalyze}){
  const pair=selPair,cd=candles[pair]||[],cls=cd.map(c=>c.c);
  const price=prices[pair]||0,dp=DP[pair];
  const R=iRSI(cls),E9=iEMA(cls,9),E21=iEMA(cls,21),E50=iEMA(cls,50);
  const A=iATR(cd),B=iBB(cls),M=iMACD(cls),SK=iStoch(cd);
  const day=cd.slice(-96),dH=day.length?Math.max(...day.map(c=>c.h)):0,dL=day.length?Math.min(...day.map(c=>c.l)):0;
  const sig=signals[pair],rsk=risks[pair];

  const levels={dH,dL,bbU:B.u,bbL:B.lo,sig:sig?.signal,entry:sig?.entry,sl:sig?.sl,tp1:sig?.tp1,tp2:sig?.tp2,tp3:sig?.tp3};

  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {PAIRS.map(p=>(
          <button key={p} onClick={()=>setSelPair(p)} style={{flex:1,padding:"8px 0",borderRadius:12,cursor:"pointer",fontSize:12,fontWeight:selPair===p?700:400,color:selPair===p?"#fff":"rgba(255,255,255,0.4)",background:selPair===p?`linear-gradient(135deg,${GRAD[p][0]}44,${GRAD[p][1]}44)`:"rgba(255,255,255,0.05)",border:`1.5px solid ${selPair===p?GRAD[p][0]+"88":"rgba(255,255,255,0.08)"}`}}>
            {ICON[p]} {p.split("/")[0]}
          </button>
        ))}
      </div>

      <TVChart pair={pair} levels={levels}/>

      <div style={glass()}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Indicators</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
          {[["RSI",R.toFixed(0),R>70?"#ff4466":R<30?"#00ff88":"#ffd700",R>70?"OB":R<30?"OS":"Neutral"],
            ["Stoch",SK.toFixed(0),SK>80?"#ff4466":SK<20?"#00ff88":"#ffd700","Momentum"],
            ["MACD",M.toFixed(dp>0?3:1),M>0?"#00ff88":"#ff4466",M>0?"Bull":"Bear"],
            ["EMA",E9>E21?"Up":"Down",E9>E21?"#00ff88":"#ff4466",E9>E21?"Uptrend":"Downtrend"]
          ].map(([l,v,c,n])=>(
            <div key={l} style={{...mini({textAlign:"center"})}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>{l}</div>
              <div style={{fontSize:15,fontWeight:700,color:c,margin:"4px 0"}}>{v}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{n}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
          {[["EMA50",`$${E50.toFixed(dp)}`,price>E50?"#00ff88":"#ff4466",price>E50?"Above":"Below"],
            ["ATR(14)",A.toFixed(dp),"#fff",A/price<0.005?"Low":A/price<0.012?"Med":"High"]
          ].map(([l,v,c,n])=>(
            <div key={l} style={mini()}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>{l}</div><div style={{fontSize:14,fontWeight:700,color:c,margin:"3px 0"}}>{v}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{n}</div></div>
          ))}
        </div>
      </div>

      {sig&&(
        <div style={{...glass({borderColor:`${SC(sig.signal)}44`,background:SB(sig.signal)})}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontWeight:700}}>AI Signal <span style={{fontSize:11,color:"rgba(255,255,255,0.4)",fontWeight:400}}>{sig.ts}</span></span>
            <span style={{...pill(SB(sig.signal),SC(sig.signal)),fontSize:13,padding:"4px 14px"}}>{sig.signal} {sig.confidence}%</span>
          </div>
          <div style={{fontSize:11,color:"#a78bfa",fontWeight:600,marginBottom:5}}>{sig.strategy} · {sig.bias}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",lineHeight:1.6,marginBottom:rsk&&sig.signal!=="HOLD"?12:0}}>{sig.reason}</div>
          {rsk&&sig.signal!=="HOLD"&&(
            <div style={{padding:"8px 12px",background:"rgba(108,92,231,0.2)",borderRadius:10,border:"1px solid rgba(108,92,231,0.3)",fontSize:12,color:"#a78bfa"}}>
              Risk <b>${rsk.risk}</b> (1%) · Size <b>${rsk.pos}</b> · Qty <b>{rsk.qty} {pair.split("/")[0]}</b> · R:R <b>{rsk.rr}:1</b>
            </div>
          )}
        </div>
      )}
      {aiLoading[pair]&&<div style={{textAlign:"center",padding:"1rem",color:"#a78bfa",fontSize:13}}>Analyzing…</div>}
      <button onClick={()=>onAnalyze(pair)} disabled={!!aiLoading[pair]} style={{...gbtn("linear-gradient(135deg,rgba(108,92,231,0.4),rgba(167,139,250,0.3))","#a78bfa","rgba(108,92,231,0.5)"),width:"100%",marginBottom:10,opacity:aiLoading[pair]?0.5:1}}>
        {aiLoading[pair]?"Analyzing…":"Re-analyze with Claude AI ↗"}
      </button>
    </div>
  );
}

// ── Positions Tab ──────────────────────────────────────────────────────────────
function PositionsTab({positions,prices}){
  if(!Object.keys(positions).length) return <div style={{textAlign:"center",padding:"4rem 0",color:"rgba(255,255,255,0.3)"}}>No open positions</div>;
  return(
    <div>
      {Object.entries(positions).map(([pair,pos])=>{
        const price=prices[pair]||0,dp=DP[pair];
        const unreal=(price-pos.entry)*pos.qty*(pos.side==="BUY"?1:-1);
        const prog=Math.min(100,Math.max(0,((price-pos.sl)/((pos.tp2-pos.sl)||1))*100));
        const [c1,c2]=GRAD[pair];
        return(
          <div key={pair} style={{...glass({borderColor:`${c1}55`,marginBottom:10})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${c1},${c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700}}>{ICON[pair]}</div>
                <span style={{fontWeight:700}}>{pair}</span>
                <span style={{...pill(pos.side==="BUY"?"rgba(0,255,136,0.15)":"rgba(255,68,102,0.15)",pos.side==="BUY"?"#00ff88":"#ff4466")}}>{pos.side}</span>
              </div>
              <span style={{fontSize:18,fontWeight:800,color:unreal>=0?"#00ff88":"#ff4466"}}>{unreal>=0?"+":""}${unreal.toFixed(2)}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:10}}>
              {[["Entry",`$${pos.entry.toFixed(dp)}`],["Now",`$${price.toFixed(dp)}`],["Size",`$${pos.posSz.toFixed(2)}`]].map(([l,v])=>(
                <div key={l} style={mini()}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>{l}</div><div style={{fontSize:13,fontWeight:700}}>{v}</div></div>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:4}}>
              <span style={{color:"#ff4466"}}>SL ${Number(pos.sl).toFixed(dp)}</span>
              <span style={{color:"#00ff88"}}>TP2 ${Number(pos.tp2).toFixed(dp)}</span>
            </div>
            <div style={{height:6,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden",marginBottom:10}}>
              <div style={{height:"100%",width:`${prog}%`,background:`linear-gradient(90deg,${c1},${c2})`,borderRadius:3,transition:"width 0.5s"}}/>
            </div>
            <div style={{display:"flex",gap:6}}>
              {[["TP1",pos.tp1,"#7ef763"],["TP2",pos.tp2,"#00ff88"],["TP3",pos.tp3,"#38bdf8"]].map(([l,v,c])=>(
                <div key={l} style={{flex:1,background:"rgba(0,255,136,0.07)",borderRadius:8,padding:"5px 8px"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.4)"}}>{l}</div>
                  <div style={{fontSize:11,fontWeight:700,color:c}}>${Number(v).toFixed(dp)}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:8,fontSize:11,color:"#a78bfa"}}>Strategy: {pos.strategy} · Risk: ${pos.rAmt?.toFixed(2)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Trades Tab ─────────────────────────────────────────────────────────────────
function TradesTab({trades,pnl}){
  const cl=trades.filter(t=>t.pnl),wn=cl.filter(t=>t.pnl?.startsWith("+"));
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
        {[[`${pnl>=0?"+":""}$${pnl.toFixed(2)}`,"Total P&L",pnl>=0?"#00ff88":"#ff4466"],[cl.length,"Closed","#38bdf8"],[cl.length?`${Math.round(wn.length/cl.length*100)}%`:"—","Win Rate","#00ff88"]].map(([v,l,c])=>(
          <div key={l} style={glass()}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginBottom:4}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div></div>
        ))}
      </div>
      <div style={glass()}>
        <div style={{fontWeight:700,marginBottom:12}}>Trade History</div>
        {!trades.length?<div style={{textAlign:"center",padding:"2rem",color:"rgba(255,255,255,0.3)"}}>No trades yet</div>
          :trades.map(tr=>(
            <div key={tr.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:30,height:30,borderRadius:8,background:tr.action==="BUY"||tr.action==="TP2"?"rgba(0,255,136,0.15)":tr.action==="EMERGENCY CLOSE"?"rgba(255,0,60,0.15)":"rgba(255,68,102,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>
                  {tr.action==="EMERGENCY CLOSE"?"🚨":tr.action.includes("BUY")||tr.action==="TP2"?"↑":"↓"}
                </div>
                <div>
                  <div style={{fontWeight:600,fontSize:13}}>{tr.action} {tr.pair}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{tr.ts}{tr.strat?" · "+tr.strat:""}{tr.conf?" · "+tr.conf+"%":""}</div>
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
  );
}

// ── Weex Tab ───────────────────────────────────────────────────────────────────
function WeexTab({weexConnected,weexBalance,weexKey,setWeexKey,weexSecret,setWeexSecret,weexPassphrase,setWeexPassphrase,connecting,connectWeex,disconnectWeex,mode,setMode}){
  if(!weexConnected) return(
    <div>
      <div style={{...glass({background:"linear-gradient(135deg,rgba(108,92,231,0.2),rgba(56,189,248,0.1))",marginBottom:16})}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>🔗 Connect Your Weex Account</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",lineHeight:1.7}}>Enter your Weex API credentials. One API key works for both Spot and Futures wallets.</div>
      </div>
      <div style={glass()}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>API Credentials</div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:600}}>API KEY</div>
          <input value={weexKey} onChange={e=>setWeexKey(e.target.value)} placeholder="Paste your Weex API key" style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"11px 14px",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:600}}>API SECRET</div>
          <input value={weexSecret} onChange={e=>setWeexSecret(e.target.value)} placeholder="Paste your Weex API secret" type="password" style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"11px 14px",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:600}}>PASSPHRASE</div>
          <input value={weexPassphrase} onChange={e=>setWeexPassphrase(e.target.value)} placeholder="Enter your API passphrase" type="password" style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"11px 14px",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <button onClick={connectWeex} disabled={connecting} style={{...gbtn("linear-gradient(135deg,#6c5ce7,#a78bfa)","#fff","transparent"),width:"100%",fontSize:14,padding:"12px",opacity:connecting?0.6:1}}>
          {connecting?"Connecting to Weex…":"🔗 Connect Weex Account"}
        </button>
        <div style={{marginTop:12,padding:"10px 12px",background:"rgba(255,215,0,0.08)",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)",fontSize:12,color:"rgba(255,215,0,0.8)"}}>
          ⚠️ Never enable Withdraw permission on API keys. Read + Trade only.
        </div>
      </div>
      <div style={glass()}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>How to get Weex API keys</div>
        {[["1","Login to Weex","Go to weex.com"],["2","Open API Management","Profile → API Management → Create API"],["3","Set permissions","Enable Read + Trade only. Never enable Withdraw"],["4","Copy credentials","Copy API Key and Secret, paste above"],["5","Deploy proxy.js","Run proxy.js locally so bot can reach Weex API"]].map(([n,t,d])=>(
          <div key={n} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{width:24,height:24,borderRadius:8,background:"linear-gradient(135deg,#6c5ce7,#a78bfa)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{n}</div>
            <div><div style={{fontWeight:600,fontSize:13}}>{t}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2}}>{d}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
  return(
    <div>
      <div style={{...glass({background:"linear-gradient(135deg,rgba(0,255,136,0.12),rgba(56,189,248,0.08))",borderColor:"rgba(0,255,136,0.3)",marginBottom:16})}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:40,height:40,borderRadius:12,background:"rgba(0,255,136,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>✅</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"#00ff88"}}>Weex Account Connected</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Live balance loaded · 1% risk per trade</div>
          </div>
        </div>
      </div>

      {/* Balance — Spot + Futures */}
      <div style={glass()}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Account Balance</div>
        {weexBalance?.spot&&Object.keys(weexBalance.spot).length>0&&(
          <>
            <div style={{fontSize:11,color:"#a78bfa",fontWeight:600,marginBottom:8,letterSpacing:0.5}}>SPOT WALLET</div>
            {Object.entries(weexBalance.spot).map(([asset,bal])=>(
              <div key={asset} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:26,height:26,borderRadius:7,background:"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{asset[0]}</div>
                  <span style={{fontWeight:600}}>{asset}</span>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,fontSize:14}}>{Number(bal.available||0).toFixed(asset==="USDT"?2:6)}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>Locked: {parseFloat(bal.locked||0).toFixed(asset==="USDT"?2:6)}</div>
                </div>
              </div>
            ))}
          </>
        )}
        {weexBalance?.spot&&Object.keys(weexBalance.spot).length===0&&(
          <div style={{padding:"12px",background:"rgba(255,215,0,0.08)",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)",fontSize:12,color:"#ffd700",marginBottom:8}}>
            ⚠️ Spot balance returned empty from Weex API.<br/>
            <span style={{color:"rgba(255,255,255,0.5)"}}>Check the Logs tab for API response details. This usually means the API signature or endpoint is wrong for your account region.</span>
          </div>
        )}
        {weexBalance?.futures&&(
          <>
            <div style={{fontSize:11,color:"#38bdf8",fontWeight:600,margin:"12px 0 8px",letterSpacing:0.5}}>FUTURES WALLET</div>
            {Object.entries(weexBalance.futures).map(([asset,bal])=>(
              <div key={asset} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:26,height:26,borderRadius:7,background:"rgba(56,189,248,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#38bdf8"}}>{asset[0]}</div>
                  <span style={{fontWeight:600}}>{asset}</span>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,fontSize:14}}>{parseFloat(bal.available||0).toFixed(2)}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>Unrealized: {parseFloat(bal.unrealized||0).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </>
        )}
        {!weexBalance?.spot&&!weexBalance?.futures&&(
          <div style={{textAlign:"center",padding:"1rem",color:"rgba(255,255,255,0.3)",fontSize:12}}>Balance not available — check proxy.js is running</div>
        )}
      </div>

      <div style={glass()}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Risk Settings</div>
        {[["Risk per trade","1% of total wallet (auto)"],["Position sizing","ATR-based"],["Stop loss","1.5× ATR"],["TP1 / TP2 / TP3","2× / 3.5× / 5× ATR"],["Min AI confidence","65%"],["Max positions","1 per pair"]].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.06)",fontSize:12}}>
            <span style={{color:"rgba(255,255,255,0.45)"}}>{l}</span><span style={{fontWeight:600}}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <button onClick={connectWeex} disabled={connecting} style={{...gbtn("rgba(0,255,136,0.15)","#00ff88","rgba(0,255,136,0.3)"),padding:"11px",textAlign:"center",opacity:connecting?0.6:1}}>
          {connecting?"Loading…":"🔄 Refresh Balance"}
        </button>
        <button onClick={disconnectWeex} style={{...gbtn("rgba(255,68,102,0.15)","#ff4466","rgba(255,68,102,0.3)"),padding:"11px",textAlign:"center"}}>Disconnect</button>
      </div>
    </div>
  );
}

// ── Emergency Modal ────────────────────────────────────────────────────────────
function EmergencyModal({show,done,loading,positions,prices,onConfirm,onClose}){
  if(!show)return null;
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,backdropFilter:"blur(8px)"}}>
      <div style={{background:"#0f0c29",border:"2px solid rgba(255,0,60,0.5)",borderRadius:24,padding:"28px 24px",maxWidth:360,width:"90%",boxShadow:"0 0 60px rgba(255,0,60,0.3)"}}>
        {!done?(
          <>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:48,marginBottom:10}}>🚨</div>
              <div style={{fontSize:20,fontWeight:800,color:"#ff0044",marginBottom:8}}>Emergency Stop</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.55)",lineHeight:1.7}}>
                This will immediately:<br/>
                <b style={{color:"#fff"}}>• Stop the bot</b><br/>
                <b style={{color:"#fff"}}>• Close ALL open positions at market</b><br/>
                <b style={{color:"#fff"}}>• Cancel all pending orders</b>
              </div>
              {Object.keys(positions).length>0?(
                <div style={{marginTop:12,padding:"10px 14px",background:"rgba(255,0,60,0.1)",borderRadius:12,border:"1px solid rgba(255,0,60,0.3)",fontSize:12,color:"#ff4466"}}>
                  ⚡ {Object.keys(positions).length} position{Object.keys(positions).length>1?"s":""} will be closed:
                  {Object.entries(positions).map(([pair,pos])=>{
                    const price=prices[pair]||0;
                    const unreal=(price-pos.entry)*pos.qty*(pos.side==="BUY"?1:-1);
                    return <span key={pair} style={{display:"block",marginTop:4,color:unreal>=0?"#00ff88":"#ff4466"}}>{pair} {pos.side} — {unreal>=0?"+":""}${unreal.toFixed(2)}</span>;
                  })}
                </div>
              ):(
                <div style={{marginTop:12,padding:"10px",background:"rgba(255,215,0,0.1)",borderRadius:12,border:"1px solid rgba(255,215,0,0.2)",fontSize:12,color:"#ffd700"}}>No open positions — bot will be stopped only.</div>
              )}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={onClose} style={{padding:"12px",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:14,background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.6)",border:"1px solid rgba(255,255,255,0.15)"}}>Cancel</button>
              <button onClick={onConfirm} disabled={loading} style={{padding:"12px",borderRadius:12,cursor:"pointer",fontWeight:800,fontSize:14,background:"linear-gradient(135deg,#ff0044,#ff4466)",color:"#fff",border:"none",opacity:loading?0.7:1,boxShadow:"0 4px 20px rgba(255,0,60,0.4)"}}>
                {loading?"Closing…":"🚨 CONFIRM"}
              </button>
            </div>
          </>
        ):(
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div style={{fontSize:18,fontWeight:800,color:"#00ff88",marginBottom:8}}>All Stopped</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:20,lineHeight:1.7}}>Bot stopped.<br/>All positions closed.</div>
            <button onClick={onClose} style={{padding:"10px 28px",borderRadius:12,cursor:"pointer",fontWeight:700,background:"rgba(0,255,136,0.15)",color:"#00ff88",border:"1px solid rgba(0,255,136,0.35)",fontSize:14}}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]         = useState("markets");
  const [selPair,setSelPair] = useState("BTC/USDT");
  const [running,setRunning] = useState(false);
  const [mode,setMode]       = useState("paper");

  const [weexKey,    setWeexKey]        = useState("");
  const [weexSecret, setWeexSecret]     = useState("");
  const [weexPassphrase, setWeexPassphrase] = useState("");
  const [weexConnected,setWeexConnected]= useState(false);
  const [weexBalance, setWeexBalance]   = useState(null);
  const [connecting,  setConnecting]    = useState(false);

  const [prices,   setPrices]   = useState({...SEED});
  const [candles,  setCandles]  = useState(()=>Object.fromEntries(PAIRS.map(p=>[p,makeCandles(SEED[p])])));
  const [signals,  setSignals]  = useState({});
  const [risks,    setRisks]    = useState({});
  const [aiLoading,setAiLoading]= useState({});
  const [positions,setPositions]= useState({});
  const [wallet,   setWallet]   = useState({USDT:10000,BTC:0,ETH:0,SOL:0});
  const [trades,   setTrades]   = useState([]);
  const [logs,     setLogs]     = useState([{msg:"Shah Jee Trading Bot ready. Start proxy.js for live data.",type:"info",ts:new Date().toLocaleTimeString()}]);
  const [pnlHist,  setPnlHist]  = useState([10000]);
  const [priceSource,setPriceSource] = useState("Simulation");

  const [showEmergency,    setShowEmergency]    = useState(false);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyDone,    setEmergencyDone]    = useState(false);

  const aiTimer = useRef(null);
  // FIX: modeRef always has the latest mode value inside analyze/emergency callbacks
  const modeRef = useRef(mode);
  useEffect(()=>{ modeRef.current = mode; },[mode]);
  // FIX: weexRef so live order logic always sees fresh credentials
  const weexRef = useRef({connected:false,key:"",secret:"",passphrase:""});
  const ts = ()=>new Date().toLocaleTimeString();
  const addLog = useCallback((msg,type="info")=>setLogs(l=>[{msg,type,ts:ts()},...l].slice(0,80)),[]);

  // ── Emergency Stop ──────────────────────────────────────────────────────────
  const executeEmergencyStop = useCallback(async()=>{
    setEmergencyLoading(true);
    addLog("🚨 EMERGENCY STOP — closing all positions…","loss");
    setRunning(false);
    clearInterval(aiTimer.current);
    for(const [pair,pos] of Object.entries(positions)){
      const price=prices[pair]||pos.entry;
      const asset=pair.split("/")[0];
      const pnlAmt=(price-pos.entry)*pos.qty*(pos.side==="BUY"?1:-1);
      setWallet(w=>{const nw={...w};nw.USDT+=pos.side==="BUY"?pos.qty*price:pos.posSz;if(pos.side==="BUY")nw[asset]=Math.max(0,(nw[asset]||0)-pos.qty);return nw;});
      addLog(`🔴 Force closed ${pair} @ $${fp(pair,price)} | ${pnlAmt>=0?"+":""}$${pnlAmt.toFixed(2)}`,pnlAmt>=0?"buy":"loss");
      setTrades(t=>[{id:Date.now()+Math.random(),pair,action:"EMERGENCY CLOSE",price:fp(pair,price),ts:ts(),pnl:`${pnlAmt>=0?"+":""}$${pnlAmt.toFixed(2)}`},...t].slice(0,100));
      if(modeRef.current==="live"&&weexRef.current.connected&&weexRef.current.key&&weexRef.current.secret){
        try{
          await fetch("https://shah-jee-proxy-production.up.railway.app/weex/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:weexRef.current.key,secret:weexRef.current.secret,passphrase:weexRef.current.passphrase,pair,side:pos.side==="BUY"?"SELL":"BUY",qty:pos.qty.toString()})});
        }catch(e){addLog(`⚠️ Weex close failed ${pair}: ${e.message}`,"warn");}
      }
      await new Promise(r=>setTimeout(r,300));
    }
    setPositions({});setSignals({});
    addLog("✅ Emergency stop complete.","buy");
    setEmergencyLoading(false);setEmergencyDone(true);
  },[positions,prices,addLog]);

  // keep weexRef in sync
  useEffect(()=>{ weexRef.current = {connected:weexConnected, key:weexKey, secret:weexSecret, passphrase:weexPassphrase}; },[weexConnected,weexKey,weexSecret,weexPassphrase]);
  // ── Fetch prices ────────────────────────────────────────────────────────────
  const loadPrices = useCallback(async()=>{
    try{
      const r=await fetch("https://shah-jee-proxy-production.up.railway.app/prices",{signal:AbortSignal.timeout(4000)});
      if(!r.ok)throw new Error("proxy not running");
      const d=await r.json();
      if(d.BTC&&d.ETH&&d.SOL){
        const np={"BTC/USDT":d.BTC,"ETH/USDT":d.ETH,"SOL/USDT":d.SOL};
        setPrices(np);setPriceSource(`${d.source||"Coinbase"} ●`);
        setCandles(prev=>{
          const next={};
          for(const p of PAIRS){const rp=np[p],old=prev[p]||[];if(!old.length){next[p]=makeCandles(rp);continue;}const last=old[old.length-1].c,sc=rp/(last||rp);next[p]=Math.abs(sc-1)>0.001?old.map(c=>({...c,o:c.o*sc,h:c.h*sc,l:c.l*sc,c:c.c*sc})):old;}
          return next;
        });
      }
    }catch{
      // animate simulation
      setPrices(prev=>{const next={};for(const p of PAIRS){const d=(Math.random()-0.5)*prev[p]*0.001;next[p]=Math.max(prev[p]*0.95,prev[p]+d);}return next;});
      setPriceSource("Simulation — run proxy.js for live");
    }
  },[]);

  useEffect(()=>{loadPrices();const iv=setInterval(loadPrices,8000);return()=>clearInterval(iv);},[loadPrices]);

  // ── Candle tick ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    const iv=setInterval(()=>{
      setCandles(prev=>{
        const next={};
        for(const p of PAIRS){
          const old=prev[p]||[];if(!old.length){next[p]=old;continue;}
          const last=old[old.length-1],drift=(Math.random()-0.5)*last.c*0.0004,nc=Math.max(last.c*0.9,last.c+drift);
          next[p]=[...old.slice(0,-1),{...last,h:Math.max(last.h,nc),l:Math.min(last.l,nc),c:nc}];
          setPrices(pr=>({...pr,[p]:nc}));
        }
        return next;
      });
    },2000);
    return()=>clearInterval(iv);
  },[]);

  // ── Portfolio ───────────────────────────────────────────────────────────────
  const totalVal=useCallback(()=>{let t=wallet.USDT;PAIRS.forEach(p=>{t+=(wallet[p.split("/")[0]]||0)*(prices[p]||0);});return t;},[wallet,prices]);
  useEffect(()=>setPnlHist(h=>[...h.slice(-99),totalVal()]),[prices,wallet]);

  // ── SL/TP monitor ───────────────────────────────────────────────────────────
  useEffect(()=>{
    Object.entries(positions).forEach(([pair,pos])=>{
      const price=prices[pair];if(!price)return;
      const asset=pair.split("/")[0];
      const slHit=pos.side==="BUY"?price<=pos.sl:price>=pos.sl;
      const tp2Hit=pos.side==="BUY"?price>=pos.tp2:price<=pos.tp2;
      if(!slHit&&!tp2Hit)return;
      const isTp=tp2Hit&&!slHit;
      const pnlAmt=isTp?(pos.side==="BUY"?pos.qty*(price-pos.entry):pos.qty*(pos.entry-price)):-pos.rAmt;
      addLog(`${isTp?"🟢 TP2":"🔴 SL"} ${pair} @ $${fp(pair,price)} | ${isTp?"+":"-"}$${Math.abs(pnlAmt).toFixed(2)}`,isTp?"buy":"loss");
      setWallet(w=>{const nw={...w};nw.USDT+=isTp?pos.qty*price:pos.posSz;if(pos.side==="BUY")nw[asset]=Math.max(0,(nw[asset]||0)-pos.qty);return nw;});
      setTrades(t=>[{id:Date.now(),pair,action:isTp?"TP2":"SL",price:fp(pair,price),ts:ts(),pnl:`${isTp?"+":"-"}$${Math.abs(pnlAmt).toFixed(2)}`},...t].slice(0,100));
      setPositions(p=>{const np={...p};delete np[pair];return np;});
    });
  },[prices]);

  // ── AI analyze — FIX: use Claude API via Anthropic proxy ───────────────────
  const analyze = useCallback(async(pair)=>{
    let cd=candles[pair];
    if(!cd||cd.length<30){cd=makeCandles(prices[pair]||SEED[pair]);setCandles(prev=>({...prev,[pair]:cd}));}
    setAiLoading(l=>({...l,[pair]:true}));
    const cls=cd.map(c=>c.c),price=prices[pair]||cls[cls.length-1],dp=DP[pair];
    const R=iRSI(cls),E9=iEMA(cls,9),E21=iEMA(cls,21),E50=iEMA(cls,50);
    const A=iATR(cd),B=iBB(cls),M=iMACD(cls),SK=iStoch(cd);
    const day=cd.slice(-96),dH=Math.max(...day.map(c=>c.h)),dL=Math.min(...day.map(c=>c.l));
    const hasPos=!!positions[pair];

    const prompt=`You are an expert crypto trader. Analyze ${pair} 15m chart and give a trade signal.
Price=$${price.toFixed(dp)} RSI=${R.toFixed(1)} Stoch=${SK.toFixed(1)} MACD=${M.toFixed(dp>0?4:1)}
EMA9=$${E9.toFixed(dp)} EMA21=$${E21.toFixed(dp)} EMA50=$${E50.toFixed(dp)}
BB_Upper=$${B.u.toFixed(dp)} BB_Mid=$${B.m.toFixed(dp)} BB_Lower=$${B.lo.toFixed(dp)}
ATR=${A.toFixed(dp)} DayHigh=$${dH.toFixed(dp)} DayLow=$${dL.toFixed(dp)}
Wallet=$${wallet.USDT.toFixed(2)} Risk1%=$${(wallet.USDT*0.01).toFixed(2)} HasPosition=${hasPos}
Rules: Only trade if confidence>=65 and RR>=1.5. If market is choppy use HOLD.
Reply with ONLY a valid JSON object and nothing else:
{"signal":"BUY","confidence":80,"strategy":"EMA cross","reason":"Short reason.","entry":${price.toFixed(dp)},"sl":${(price*0.99).toFixed(dp)},"tp1":${(price*1.01).toFixed(dp)},"tp2":${(price*1.02).toFixed(dp)},"tp3":${(price*1.03).toFixed(dp)},"rr":"2.0","bias":"bullish"}`;

    // FIX: Route Claude API through proxy to avoid CORS when deployed locally
    // When running in Claude sandbox, call Anthropic directly
    // When running locally, call via proxy which adds CORS headers
    const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
    const PROXY_ENDPOINT     = "https://shah-jee-proxy-production.up.railway.app/ai/analyze";

    const tryProxy = async()=>{
      const r=await fetch(PROXY_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,pair}),signal:AbortSignal.timeout(30000)});
      if(!r.ok)throw new Error("proxy failed");
      return r.json();
    };
    const tryDirect = async()=>{
      const r=await fetch(ANTHROPIC_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:300,messages:[{role:"user",content:prompt}]}),signal:AbortSignal.timeout(30000)});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      const txt=(d.content||[]).map(b=>b.text||"").join("").trim();
      const match=txt.match(/\{[\s\S]*?\}/);
      if(!match)throw new Error("No JSON in response");
      return JSON.parse(match[0]);
    };

    try{
      let sig;
      try{ sig=await tryProxy(); }
      catch{ sig=await tryDirect(); }

      const rsk=calcRisk(wallet.USDT,price,A,sig.signal);
      setSignals(s=>({...s,[pair]:{...sig,ts:ts(),price,atr:A}}));
      setRisks(r=>({...r,[pair]:rsk}));
      addLog(`AI → ${pair}: ${sig.signal} ${sig.confidence}% | ${sig.strategy}`,sig.signal==="BUY"?"buy":sig.signal==="SELL"?"sell":"info");

      if(sig.signal!=="HOLD"&&Number(sig.confidence)>=65&&!hasPos&&running){
        const asset=pair.split("/")[0],qty=parseFloat(rsk.qty),posSz=parseFloat(rsk.pos);
        if(wallet.USDT>=posSz){
          setWallet(w=>{const nw={...w};nw.USDT-=posSz;if(sig.signal==="BUY")nw[asset]=(nw[asset]||0)+qty;return nw;});
          setPositions(p=>({...p,[pair]:{side:sig.signal,entry:price,qty,posSz,sl:parseFloat(sig.sl)||rsk.sl,tp1:parseFloat(sig.tp1)||rsk.tp1,tp2:parseFloat(sig.tp2)||rsk.tp2,tp3:parseFloat(sig.tp3)||rsk.tp3,rAmt:parseFloat(rsk.risk),strategy:sig.strategy,ts:ts()}}));
          setTrades(t=>[{id:Date.now(),pair,action:sig.signal,price:fp(pair,price),ts:ts(),conf:sig.confidence,strat:sig.strategy},...t].slice(0,100));
          addLog(`✅ ${sig.signal} ${pair} @ $${fp(pair,price)} | SL $${fp(pair,sig.sl)} | TP2 $${fp(pair,sig.tp2)}`,sig.signal==="BUY"?"buy":"sell");
          if(modeRef.current==="live"&&weexRef.current.connected&&weexRef.current.key&&weexRef.current.secret){
            try{await fetch("https://shah-jee-proxy-production.up.railway.app/weex/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:weexRef.current.key,secret:weexRef.current.secret,passphrase:weexRef.current.passphrase,pair,side:sig.signal,qty:qty.toString(),sl:sig.sl,tp:sig.tp2})});}
            catch(e){addLog(`⚠️ Weex order failed: ${e.message}`,"warn");}
          }
        }
      }
    }catch(e){
      addLog(`AI error ${pair}: ${e.message}`,"warn");
      setSignals(s=>({...s,[pair]:{signal:"HOLD",confidence:0,strategy:"Error",reason:`${e.message} — check proxy.js is running with /ai/analyze route`,ts:ts()}}));
    }
    setAiLoading(l=>({...l,[pair]:false}));
  },[candles,prices,wallet,positions,running,addLog]);

  // ── Bot ─────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(running){
      PAIRS.forEach(p=>analyze(p));
      aiTimer.current=setInterval(()=>PAIRS.forEach(p=>analyze(p)),90000);
      if(modeRef.current==="live"){
        if(weexRef.current.connected){addLog("🤖 Bot started in LIVE mode — real Weex orders will be placed!","sell");}
        else{addLog("⚠️ Bot started in LIVE mode but Weex is NOT connected — go to Weex tab to connect first!","warn");}
      }else{
        addLog("🤖 Shah Jee Bot started in PAPER mode — analyzing every 90s","info");
      }
    }
    else clearInterval(aiTimer.current);
    return()=>clearInterval(aiTimer.current);
  },[running]);

  // ── Weex connect — FIX: properly parse spot + futures balance ───────────────
  const connectWeex = useCallback(async()=>{
    if(!weexKey||!weexSecret){addLog("Enter API key and secret first","warn");return;}
    setConnecting(true);addLog("Connecting to Weex…","info");
    try{
      const r=await fetch("https://shah-jee-proxy-production.up.railway.app/weex/balance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:weexKey,secret:weexSecret,passphrase:weexPassphrase}),signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error(`Proxy HTTP ${r.status}`);
      const d=await r.json();
      if(d.error)throw new Error(d.error);
      // Log what proxy found so user can debug in Logs tab
      if(d.debug&&d.debug.length){d.debug.slice(0,5).forEach(line=>addLog(`🔍 ${line.slice(0,120)}`,"info"));}
      if(d.spotError){addLog(`⚠️ Spot balance issue: ${d.spotError}`,"warn");}
      setWeexBalance(d);
      setWeexConnected(true);
      const spotUSDT=parseFloat(d.spot?.USDT?.available||0);
      const spotBTC=parseFloat(d.spot?.BTC?.available||0);
      const spotETH=parseFloat(d.spot?.ETH?.available||0);
      const spotSOL=parseFloat(d.spot?.SOL?.available||0);
      const hasSpot=Object.keys(d.spot||{}).length>0;
      if(hasSpot){
        setWallet({USDT:spotUSDT,BTC:spotBTC,ETH:spotETH,SOL:spotSOL});
        addLog(`✅ Weex connected! USDT:$${spotUSDT.toFixed(2)} BTC:${spotBTC} ETH:${spotETH} SOL:${spotSOL}`,"buy");
      }else{
        addLog("✅ Weex API reached but spot balance empty — check Logs tab for API response details","warn");
      }
    }catch(e){
      addLog(`⚠️ Weex connection failed: ${e.message} — check proxy is deployed on Railway`,"warn");
      setWeexConnected(true);
      setWeexBalance({spot:{},futures:{},error:e.message});
    }
    setConnecting(false);
  },[weexKey,weexSecret,weexPassphrase,addLog]);

  const disconnectWeex=()=>{
    setWeexConnected(false);setWeexBalance(null);setWeexKey("");setWeexSecret("");
    setWallet({USDT:10000,BTC:0,ETH:0,SOL:0});addLog("Weex disconnected","warn");
  };

  const tv=totalVal(),pnl=tv-10000,pnlPct=((pnl/10000)*100).toFixed(2);
  const isLive=!priceSource.includes("Sim");
  const TABS=["markets","signals","chart","positions","trades","weex","logs","settings"];

  return(
    <div style={{background:"linear-gradient(135deg,#0f0c29,#302b63,#24243e)",minHeight:"100vh",fontFamily:"var(--font-sans)",color:"#fff",padding:12,boxSizing:"border-box"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#6c5ce7,#a78bfa)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 4px 15px rgba(108,92,231,0.5)"}}>👑</div>
          <div>
            <div style={{fontWeight:800,fontSize:16,background:"linear-gradient(90deg,#ffd700,#ff6b00,#a78bfa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Shah Jee Trading Bot</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:isLive?"#00ff88":"#ffd700",display:"inline-block",boxShadow:isLive?"0 0 6px #00ff88":"none"}}/>
              {priceSource}{weexConnected&&<span style={{color:"#00ff88",fontWeight:600}}>· Weex ✓</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{...pill(mode==="paper"?"rgba(0,255,136,0.15)":"rgba(255,68,102,0.15)",mode==="paper"?"#00ff88":"#ff4466")}}>{mode==="paper"?"Paper":"Live"}</span>
          <button onClick={()=>setRunning(r=>!r)} style={{...gbtn(running?"rgba(255,68,102,0.2)":"rgba(0,255,136,0.2)",running?"#ff4466":"#00ff88",running?"#ff446650":"#00ff8850")}}>
            {running?"⏹ Stop":"▶ Start Bot"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:3,marginBottom:14,background:"rgba(255,255,255,0.05)",borderRadius:14,padding:4,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:"0 0 auto",padding:"7px 12px",borderRadius:10,cursor:"pointer",fontSize:11,fontWeight:tab===t?700:400,color:tab===t?"#fff":"rgba(255,255,255,0.4)",background:tab===t?"linear-gradient(135deg,rgba(108,92,231,0.6),rgba(167,139,250,0.4))":"transparent",border:"none",textTransform:"capitalize",whiteSpace:"nowrap"}}>
            {t==="weex"?"🔗 Weex":t==="signals"?"📊 Signals":t}
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
                <div style={{fontSize:32,fontWeight:800,letterSpacing:-1}}>${tv.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                <div style={{fontSize:13,color:pnl>=0?"#00ff88":"#ff4466",fontWeight:600,marginTop:4}}>{pnl>=0?"▲":"▼"} ${Math.abs(pnl).toFixed(2)} ({pnl>=0?"+":""}{pnlPct}%)</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>Free USDT</div>
                <div style={{fontSize:18,fontWeight:700,margin:"4px 0"}}>${wallet.USDT.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>1% risk = ${(wallet.USDT*0.01).toFixed(2)}</div>
              </div>
            </div>
            <div style={{marginTop:10}}><Spark data={pnlHist} colors={pnl>=0?["#00ff88","#38bdf8"]:["#ff4466","#f97316"]} w={580} h={36}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
            {[["Positions",Object.keys(positions).length,"#38bdf8"],["Signals",Object.values(signals).filter(s=>s?.signal!=="HOLD").length,"#ffd700"],["Trades",trades.length,"#a78bfa"],["Win%",(()=>{const cl=trades.filter(t=>t.pnl),wn=cl.filter(t=>t.pnl?.startsWith("+"));return cl.length?Math.round(wn.length/cl.length*100)+"%":"—";})(),"#00ff88"]].map(([l,v,c])=>(
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
                      <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${c1},${c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,boxShadow:`0 4px 12px ${c1}44`}}>{ICON[pair]}</div>
                      <span style={{fontWeight:700,fontSize:15}}>{pair}</span>
                      {pos&&<span style={{...pill(`${pos.side==="BUY"?"#00ff88":"#ff4466"}22`,pos.side==="BUY"?"#00ff88":"#ff4466")}}>{pos.side}</span>}
                      {aiLoading[pair]&&<span style={{fontSize:10,color:"#a78bfa"}}>Analyzing…</span>}
                      {sig&&!aiLoading[pair]&&<span style={{...pill(SB(sig.signal),SC(sig.signal)),border:`1px solid ${SC(sig.signal)}44`}}>{sig.signal} {sig.confidence}%</span>}
                    </div>
                    <div style={{fontSize:28,fontWeight:800,letterSpacing:-0.5,background:`linear-gradient(90deg,${c1},${c2})`,WebkitBackgroundClip:"text",WebkitTextFillColor:price>0?"transparent":"rgba(255,255,255,0.3)",marginBottom:4}}>
                      ${price>0?price.toLocaleString("en-US",{minimumFractionDigits:DP[pair],maximumFractionDigits:DP[pair]}):"Loading…"}
                    </div>
                    <div style={{fontSize:12,color:chg>=0?"#00ff88":"#ff4466",fontWeight:600,marginBottom:6}}>{chg>=0?"▲":"▼"} {Math.abs(chg).toFixed(3)}%</div>
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
                    {[["Entry",sig.entry,"#fff"],["SL",sig.sl,"#ff4466"],["TP1",sig.tp1,"#7ef763"],["TP2",sig.tp2,"#00ff88"],["Risk$",`$${rsk.risk}`,"#ffd700"]].map(([l,v,c])=>(
                      <div key={l} style={{background:"rgba(255,255,255,0.06)",borderRadius:8,padding:"5px 7px"}}>
                        <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",marginBottom:2}}>{l}</div>
                        <div style={{fontSize:11,fontWeight:600,color:c}}>{l==="Risk$"?v:`$${Number(v).toFixed(DP[pair])}`}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!running&&<div style={{textAlign:"center",padding:"1.5rem",color:"rgba(255,255,255,0.3)",fontSize:13,background:"rgba(255,255,255,0.03)",borderRadius:14,border:"1px dashed rgba(255,255,255,0.1)"}}>Press <b style={{color:"#00ff88"}}>▶ Start Bot</b> to begin trading</div>}
        </div>
      )}

      {/* SIGNALS */}
      {tab==="signals"&&(
        <div>
          <div style={{...glass({background:"linear-gradient(135deg,rgba(108,92,231,0.2),rgba(56,189,248,0.1))",marginBottom:16})}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>📊 Live Trade Signals</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>AI-generated signals with full risk breakdown. Always 1% wallet risk.</div>
          </div>
          {PAIRS.map(pair=>{
            const sig=signals[pair],rsk=risks[pair],price=prices[pair]||0,dp=DP[pair];
            const cd=candles[pair]||[],cls=cd.map(c=>c.c);
            const R=cls.length>15?iRSI(cls):50;
            const E9=iEMA(cls,9),E21=iEMA(cls,21),M=iMACD(cls),SK=iStoch(cd);
            const [c1,c2]=GRAD[pair],pos=positions[pair];
            return(
              <div key={pair} style={{...glass({marginBottom:14,borderColor:sig?`${SC(sig.signal)}33`:"rgba(255,255,255,0.1)"})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(135deg,${c1},${c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,boxShadow:`0 4px 14px ${c1}55`}}>{ICON[pair]}</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{pair}</div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>15m · ${price>0?price.toLocaleString("en-US",{minimumFractionDigits:dp,maximumFractionDigits:dp}):"—"}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {sig&&<span style={{...pill(SB(sig.signal),SC(sig.signal)),fontSize:13,padding:"5px 14px",border:`1px solid ${SC(sig.signal)}44`}}>{sig.signal} {sig.confidence}%</span>}
                    <button onClick={e=>{e.stopPropagation();analyze(pair);}} disabled={!!aiLoading[pair]} style={{...gbtn("rgba(108,92,231,0.25)","#a78bfa","rgba(108,92,231,0.5)"),padding:"6px 14px",fontSize:12,opacity:aiLoading[pair]?0.5:1}}>
                      {aiLoading[pair]?"…":"Analyze"}
                    </button>
                  </div>
                </div>
                {sig&&(
                  <>
                    <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                      <span style={{...pill("rgba(167,139,250,0.15)","#a78bfa")}}>{sig.strategy}</span>
                      <span style={{...pill("rgba(255,255,255,0.07)","rgba(255,255,255,0.6)")}}>{sig.bias}</span>
                      <span style={{...pill("rgba(255,255,255,0.07)","rgba(255,255,255,0.4)")}}>{sig.ts}</span>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:13,color:"rgba(255,255,255,0.65)",lineHeight:1.6}}>💬 {sig.reason}</div>
                    {sig.signal!=="HOLD"&&rsk&&(
                      <>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
                          <div style={{background:"rgba(255,255,255,0.07)",borderRadius:12,padding:"10px 12px",border:"1px solid rgba(255,255,255,0.1)"}}>
                            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginBottom:4}}>ENTRY</div>
                            <div style={{fontSize:20,fontWeight:800}}>${Number(sig.entry).toFixed(dp)}</div>
                          </div>
                          <div style={{background:"rgba(255,68,102,0.1)",borderRadius:12,padding:"10px 12px",border:"1px solid rgba(255,68,102,0.25)"}}>
                            <div style={{fontSize:10,color:"#ff4466",marginBottom:4,fontWeight:600}}>🛑 STOP LOSS</div>
                            <div style={{fontSize:20,fontWeight:800,color:"#ff4466"}}>${Number(sig.sl).toFixed(dp)}</div>
                            <div style={{fontSize:10,color:"rgba(255,68,102,0.6)"}}>Max loss: -${rsk.risk} (1%)</div>
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                          {[["🎯 TP1",sig.tp1,"rgba(126,247,99,0.1)","#7ef763","rgba(126,247,99,0.25)","Conservative"],["🎯 TP2",sig.tp2,"rgba(0,255,136,0.1)","#00ff88","rgba(0,255,136,0.25)","Primary"],["🎯 TP3",sig.tp3,"rgba(56,189,248,0.1)","#38bdf8","rgba(56,189,248,0.25)","Extended"]].map(([l,v,bg,c,bd,label])=>(
                            <div key={l} style={{background:bg,borderRadius:12,padding:"10px 12px",border:`1px solid ${bd}`}}>
                              <div style={{fontSize:10,color:c,marginBottom:4,fontWeight:600}}>{l}</div>
                              <div style={{fontSize:16,fontWeight:800,color:c}}>${Number(v).toFixed(dp)}</div>
                              <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:2}}>{label}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{background:"rgba(108,92,231,0.15)",borderRadius:12,padding:"10px 14px",border:"1px solid rgba(108,92,231,0.3)",marginBottom:10}}>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                            {[["Risk",`$${rsk.risk}`,"#ffd700"],["Size",`$${rsk.pos}`,"#a78bfa"],["Qty",rsk.qty.slice(0,8),"#38bdf8"],["R:R",`${rsk.rr}:1`,"#00ff88"]].map(([l,v,c])=>(
                              <div key={l} style={{textAlign:"center"}}>
                                <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",marginBottom:3}}>{l}</div>
                                <div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {running&&!pos&&(
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                            <button onClick={()=>{const cdl=candles[pair],p2=prices[pair]||0,av=iATR(cdl||[]),rk=calcRisk(wallet.USDT,p2,av,"BUY");const asset=pair.split("/")[0],qty=parseFloat(rk.qty),posSz=parseFloat(rk.pos);if(wallet.USDT>=posSz){setWallet(w=>{const nw={...w};nw.USDT-=posSz;nw[asset]=(nw[asset]||0)+qty;return nw;});setPositions(p=>({...p,[pair]:{side:"BUY",entry:p2,qty,posSz,sl:parseFloat(sig.sl),tp1:parseFloat(sig.tp1),tp2:parseFloat(sig.tp2),tp3:parseFloat(sig.tp3),rAmt:parseFloat(rk.risk),strategy:sig.strategy,ts:ts()}}));setTrades(t=>[{id:Date.now(),pair,action:"BUY",price:fp(pair,p2),ts:ts(),conf:sig.confidence,strat:sig.strategy},...t]);addLog(`✅ Manual BUY ${pair} @ $${fp(pair,p2)}`,"buy");}}} style={{...gbtn("rgba(0,255,136,0.2)","#00ff88","rgba(0,255,136,0.5)"),textAlign:"center"}}>↑ Buy Now</button>
                            <button onClick={()=>{const cdl=candles[pair],p2=prices[pair]||0,av=iATR(cdl||[]),rk=calcRisk(wallet.USDT,p2,av,"SELL");const qty=parseFloat(rk.qty),posSz=parseFloat(rk.pos);if(wallet.USDT>=posSz){setPositions(p=>({...p,[pair]:{side:"SELL",entry:p2,qty,posSz,sl:parseFloat(sig.sl),tp1:parseFloat(sig.tp1),tp2:parseFloat(sig.tp2),tp3:parseFloat(sig.tp3),rAmt:parseFloat(rk.risk),strategy:sig.strategy,ts:ts()}}));setTrades(t=>[{id:Date.now(),pair,action:"SELL",price:fp(pair,p2),ts:ts(),conf:sig.confidence,strat:sig.strategy},...t]);addLog(`✅ Manual SELL ${pair} @ $${fp(pair,p2)}`,"sell");}}} style={{...gbtn("rgba(255,68,102,0.2)","#ff4466","rgba(255,68,102,0.5)"),textAlign:"center"}}>↓ Sell Now</button>
                          </div>
                        )}
                        {pos&&<div style={{textAlign:"center",padding:"8px",fontSize:12,color:"#ffd700",background:"rgba(255,215,0,0.1)",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)"}}>⚡ Position open — monitoring SL/TP</div>}
                      </>
                    )}
                    {sig.signal==="HOLD"&&<div style={{textAlign:"center",padding:"14px",background:"rgba(255,215,0,0.08)",borderRadius:12,border:"1px solid rgba(255,215,0,0.2)",color:"#ffd700",fontSize:13}}>⏳ No trade signal — market conditions not ideal</div>}
                  </>
                )}
                {!sig&&<div style={{textAlign:"center",padding:"20px",color:"rgba(255,255,255,0.3)",fontSize:13}}>Tap <b style={{color:"#a78bfa"}}>Analyze</b> to generate signal</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:12,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                  {[["RSI",R.toFixed(0),R>70?"#ff4466":R<30?"#00ff88":"#ffd700"],["Stoch",SK.toFixed(0),SK>80?"#ff4466":SK<20?"#00ff88":"#ffd700"],["MACD",M.toFixed(dp>0?2:1),M>0?"#00ff88":"#ff4466"],["EMA",E9>E21?"Bull":"Bear",E9>E21?"#00ff88":"#ff4466"]].map(([l,v,c])=>(
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

      {tab==="chart"&&<ChartTab selPair={selPair} setSelPair={setSelPair} candles={candles} prices={prices} signals={signals} risks={risks} aiLoading={aiLoading} onAnalyze={analyze}/>}
      {tab==="positions"&&<PositionsTab positions={positions} prices={prices}/>}
      {tab==="trades"&&<TradesTab trades={trades} pnl={pnl}/>}
      {tab==="weex"&&<WeexTab weexConnected={weexConnected} weexBalance={weexBalance} weexKey={weexKey} setWeexKey={setWeexKey} weexSecret={weexSecret} setWeexSecret={setWeexSecret} weexPassphrase={weexPassphrase} setWeexPassphrase={setWeexPassphrase} connecting={connecting} connectWeex={connectWeex} disconnectWeex={disconnectWeex} mode={mode} setMode={setMode}/>}

      {/* LOGS */}
      {tab==="logs"&&(
        <div style={glass()}>
          <div style={{fontWeight:700,marginBottom:12}}>Activity Log</div>
          {!logs.length&&<div style={{color:"rgba(255,255,255,0.3)",fontSize:12,textAlign:"center",padding:"1.5rem"}}>No activity yet</div>}
          {logs.map((l,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",alignItems:"flex-start"}}>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.3)",minWidth:55,flexShrink:0}}>{l.ts}</span>
              <span style={{width:6,height:6,borderRadius:"50%",marginTop:4,flexShrink:0,background:l.type==="buy"||l.type==="win"?"#00ff88":l.type==="sell"||l.type==="loss"?"#ff4466":l.type==="warn"?"#ffd700":"rgba(255,255,255,0.3)"}}/>
              <span style={{fontSize:12,lineHeight:1.5,color:l.type==="buy"||l.type==="win"?"#00ff88":l.type==="sell"||l.type==="loss"?"#ff4466":l.type==="warn"?"#ffd700":"rgba(255,255,255,0.6)"}}>{l.msg}</span>
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
              {[["paper","📄 Paper","Simulated — safe","#00ff88"],["live","⚡ Live","Real Weex orders","#ff4466"]].map(([m,t,s,c])=>(
                <button key={m} onClick={()=>setMode(m)} style={{padding:12,borderRadius:12,cursor:"pointer",background:mode===m?`${c}18`:"rgba(255,255,255,0.05)",border:`1.5px solid ${mode===m?c+"60":"rgba(255,255,255,0.1)"}`,textAlign:"left"}}>
                  <div style={{fontWeight:700,color:mode===m?c:"#fff",marginBottom:3}}>{t}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{s}</div>
                </button>
              ))}
            </div>
            {mode==="live"&&!weexConnected&&<div style={{marginTop:10,padding:"10px",background:"rgba(255,68,102,0.1)",borderRadius:10,border:"1px solid rgba(255,68,102,0.3)",fontSize:12,color:"#ff4466"}}>⚠️ Connect Weex in the 🔗 Weex tab first</div>}
          </div>
          <div style={glass()}>
            <div style={{fontWeight:700,marginBottom:10}}>Config</div>
            {[["Bot name","Shah Jee Trading Bot"],["Pairs","BTC · ETH · SOL"],["Timeframe","15 minutes"],["Risk/trade","1% of wallet (always)"],["Stop-loss","1.5× ATR"],["Take-profits","TP1=2× TP2=3.5× TP3=5× ATR"],["Min confidence","65%"],["Price source","localhost:4000/prices"],["AI endpoint","localhost:4000/ai/analyze → Anthropic"],["AI interval","Every 90s"]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:12}}>
                <span style={{color:"rgba(255,255,255,0.45)"}}>{l}</span><span style={{fontWeight:600}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergency */}
      <div style={{marginTop:16,marginBottom:4}}>
        <button onClick={()=>setShowEmergency(true)} style={{width:"100%",padding:"14px",borderRadius:16,cursor:"pointer",fontWeight:800,fontSize:15,background:"rgba(255,0,60,0.12)",color:"#ff0044",border:"2px solid rgba(255,0,60,0.4)",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 0 24px rgba(255,0,60,0.15)"}}>
          🚨 EMERGENCY STOP — Close All Positions
        </button>
      </div>

      <EmergencyModal show={showEmergency} done={emergencyDone} loading={emergencyLoading} positions={positions} prices={prices} onConfirm={executeEmergencyStop} onClose={()=>{setShowEmergency(false);setEmergencyDone(false);}}/>

      <div style={{textAlign:"center",fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:8}}>
        Shah Jee Trading Bot · Coinbase · TradingView · Claude AI · Weex
      </div>
    </div>
  );
}