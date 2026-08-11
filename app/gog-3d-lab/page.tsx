"use client";

import { Box, CheckCircle2, CircleAlert, Download, ImagePlus, LoaderCircle, Play, RotateCcw, ScanLine, Upload, Wireframe } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type V3 = [number, number, number];
type Face = [number, number, number];
type Part = { name: string; verts: V3[]; faces: Face[]; color: string };
type Camera = { ry: number; rx: number; zoom: number };
type ProviderStatus = { id: string; label: string; available: boolean; endpointConfigured: boolean };
type RunResult = {
  provider: string;
  elapsedMs: number;
  meshObj: string;
  metrics?: Record<string, unknown> | null;
  model?: string | null;
  camera?: Record<string, unknown> | null;
  warnings?: string[];
};

const COLORS = {
  skin: "#ebc7b1", hair: "#c29c60", robe: "#dde5e5", robeBlue: "#b1c2c8",
  robeInner: "#efece4", metal: "#918464", dark: "#3a3733", green: "#41764d", horn: "#97a9b2",
};

function ellipsoid(name: string, center: V3, r: V3, color: string, rings = 8, seg = 12): Part {
  const verts: V3[] = [], faces: Face[] = [];
  for (let i = 0; i <= rings; i++) {
    const phi = i / rings * Math.PI;
    for (let j = 0; j < seg; j++) {
      const th = j / seg * Math.PI * 2;
      verts.push([center[0] + r[0] * Math.sin(phi) * Math.cos(th), center[1] + r[1] * Math.sin(phi) * Math.sin(th), center[2] + r[2] * Math.cos(phi)]);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const n = (j + 1) % seg, a = i * seg + j, b = i * seg + n, c = (i + 1) * seg + n, d = (i + 1) * seg + j;
    faces.push([a,b,c],[a,c,d]);
  }
  return { name, verts, faces, color };
}

function frustum(name: string, z0:number,z1:number,rx0:number,ry0:number,rx1:number,ry1:number,color:string,seg=18):Part {
  const verts:V3[]=[],faces:Face[]=[];
  for(const [z,rx,ry] of [[z0,rx0,ry0],[z1,rx1,ry1]] as const) for(let i=0;i<seg;i++){const a=i/seg*Math.PI*2;verts.push([rx*Math.cos(a),ry*Math.sin(a),z]);}
  for(let i=0;i<seg;i++){const n=(i+1)%seg;faces.push([i,n,seg+n],[i,seg+n,seg+i]);}
  return {name,verts,faces,color};
}

function tube(name:string,a:V3,b:V3,radius:number,color:string,seg=10):Part {
  const verts:V3[]=[],faces:Face[]=[];const [vx,vy,vz]=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],len=Math.hypot(vx,vy,vz)||1;
  const [ux,uy,uz]=[vx/len,vy/len,vz/len],h:V3=Math.abs(uz)<.9?[0,0,1]:[0,1,0];
  let ax=uy*h[2]-uz*h[1],ay=uz*h[0]-ux*h[2],az=ux*h[1]-uy*h[0];const al=Math.hypot(ax,ay,az)||1;ax/=al;ay/=al;az/=al;
  const bx=uy*az-uz*ay,by=uz*ax-ux*az,bz=ux*ay-uy*ax;
  for(const p of [a,b]) for(let i=0;i<seg;i++){const t=i/seg*Math.PI*2,c=Math.cos(t)*radius,s=Math.sin(t)*radius;verts.push([p[0]+ax*c+bx*s,p[1]+ay*c+by*s,p[2]+az*c+bz*s]);}
  for(let i=0;i<seg;i++){const n=(i+1)%seg;faces.push([i,n,seg+n],[i,seg+n,seg+i]);}
  return {name,verts,faces,color};
}

function cone(name:string,a:V3,b:V3,radius:number,color:string,seg=8):Part {
  const p=tube(name,a,[a[0]+(b[0]-a[0])*.08,a[1]+(b[1]-a[1])*.08,a[2]+(b[2]-a[2])*.08],radius,color,seg),tip=p.verts.length;p.verts.push(b);
  for(let i=0;i<seg;i++){const n=(i+1)%seg;p.faces.push([seg+i,seg+n,tip]);}return p;
}

function buildBaseline():Part[]{
  const p:Part[]=[frustum("body",.93,1.38,.14,.095,.18,.11,COLORS.robeInner),tube("neck",[0,0,1.38],[0,0,1.49],.047,COLORS.skin),ellipsoid("head",[0,-.01,1.595],[.112,.09,.118],COLORS.skin,10,16),frustum("inner robe",.04,1.16,.25,.15,.14,.095,COLORS.robeInner),frustum("outer robe",.04,1.17,.325,.20,.17,.11,COLORS.robeBlue),ellipsoid("hair crown",[0,.02,1.685],[.118,.095,.07],COLORS.hair),ellipsoid("hair L",[-.095,.062,1.602],[.078,.092,.105],COLORS.hair),ellipsoid("hair R",[.095,.062,1.602],[.078,.092,.105],COLORS.hair),ellipsoid("hair back",[0,.102,1.598],[.098,.073,.092],COLORS.hair)];
  for(const [side,s] of [["L",-1],["R",1]] as const){const sh:V3=[s*.18,0,1.33],el:V3=[s*.245,-.005,1.10],wr:V3=[s*.285,-.01,.90];p.push(tube(`sleeve upper ${side}`,sh,el,.085,COLORS.robeInner),tube(`sleeve lower ${side}`,el,wr,.115,COLORS.robeInner),ellipsoid(`hand ${side}`,[s*.293,-.012,.825],[.031,.024,.067],COLORS.skin),ellipsoid(`horn socket ${side}`,[s*.108,.006,1.625],[.016,.011,.026],COLORS.horn),cone(`horn long ${side}`,[s*.116,.012,1.65],[s*.185,.03,1.80],.016,COLORS.horn),cone(`horn mid ${side}`,[s*.123,-.002,1.655],[s*.187,-.008,1.72],.013,COLORS.horn),cone(`horn low ${side}`,[s*.115,-.002,1.615],[s*.165,-.006,1.585],.010,COLORS.horn));}
  return p;
}

function parseObj(text:string):Part[] {
  const verts:V3[]=[],faces:Face[]=[];
  for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(line.startsWith("v ")){const [,x,y,z]=line.split(/\s+/);verts.push([Number(x),Number(y),Number(z)]);}else if(line.startsWith("f ")){const ids=line.split(/\s+/).slice(1).map(v=>Number(v.split("/")[0])-1);for(let i=1;i<ids.length-1;i++)faces.push([ids[0],ids[i],ids[i+1]]);}}
  if(!verts.length||!faces.length)throw new Error("Returned OBJ contained no renderable mesh");
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const v of verts)for(let i=0;i<3;i++){min[i]=Math.min(min[i],v[i]);max[i]=Math.max(max[i],v[i]);}
  const cx=(min[0]+max[0])/2,cy=(min[1]+max[1])/2,cz=(min[2]+max[2])/2,scale=1.7/Math.max(max[0]-min[0],max[1]-min[1],max[2]-min[2],.001);
  const normalized=verts.map(([x,y,z])=>[(x-cx)*scale,(z-cz)*scale,(y-cy)*scale+.9] as V3);
  return [{name:"SAM3D / MHR body prior",verts:normalized,faces,color:"#aebfc4"}];
}

function shade(hex:string,factor:number){const v=parseInt(hex.slice(1),16),r=(v>>16)&255,g=(v>>8)&255,b=v&255,q=(x:number)=>Math.max(0,Math.min(255,Math.round(x*factor)));return `rgb(${q(r)},${q(g)},${q(b)})`;}

function Viewer({parts}:{parts:Part[]}){
  const ref=useRef<HTMLCanvasElement>(null),cam=useRef<Camera>({ry:0,rx:-.06,zoom:430}),drag=useRef<[number,number]|null>(null);const [wire,setWire]=useState(false),[sil,setSil]=useState(false);
  useEffect(()=>{const canvas=ref.current,ctx=canvas?.getContext("2d");if(!canvas||!ctx)return;let raf=0;const draw=()=>{const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}ctx.clearRect(0,0,rect.width,rect.height);const {ry,rx,zoom}=cam.current,cy=Math.cos(ry),sy=Math.sin(ry),cx=Math.cos(rx),sx=Math.sin(rx);const out:{pts:[number,number][],depth:number,color:string}[]=[];for(const part of parts){const pv=part.verts.map(([x,y,z])=>{const x1=x*cy-y*sy,y1=x*sy+y*cy,y2=y1*cx-(z-.92)*sx,z2=y1*sx+(z-.92)*cx;return{x:rect.width/2+x1*zoom,y:rect.height/2-y2*zoom,depth:z2};});for(const f of part.faces){const a=pv[f[0]],b=pv[f[1]],c=pv[f[2]],area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(area>0)continue;const depth=(a.depth+b.depth+c.depth)/3;out.push({pts:[[a.x,a.y],[b.x,b.y],[c.x,c.y]],depth,color:sil?"#091113":shade(part.color,.82+Math.max(-.18,Math.min(.18,depth*.22)))});}}out.sort((a,b)=>a.depth-b.depth);for(const f of out){ctx.beginPath();ctx.moveTo(...f.pts[0]);ctx.lineTo(...f.pts[1]);ctx.lineTo(...f.pts[2]);ctx.closePath();ctx.fillStyle=f.color;ctx.fill();if(wire){ctx.strokeStyle="rgba(116,225,205,.18)";ctx.lineWidth=.55;ctx.stroke();}}raf=requestAnimationFrame(draw);};draw();return()=>cancelAnimationFrame(raf);},[parts,wire,sil]);
  const view=(ry:number,rx=-.06)=>{cam.current.ry=ry;cam.current.rx=rx;};
  return <div className="viewer"><canvas ref={ref} onPointerDown={e=>{drag.current=[e.clientX,e.clientY];e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!drag.current)return;cam.current.ry+=(e.clientX-drag.current[0])*.008;cam.current.rx=Math.max(-1,Math.min(1,cam.current.rx+(e.clientY-drag.current[1])*.006));drag.current=[e.clientX,e.clientY]}} onPointerUp={()=>drag.current=null} onWheel={e=>{e.preventDefault();cam.current.zoom=Math.max(260,Math.min(700,cam.current.zoom-e.deltaY*.45))}} aria-label="Interactive reconstructed mesh viewer"/><div className="viewbar"><button onClick={()=>view(0)}>Front</button><button onClick={()=>view(-.72)}>3/4</button><button onClick={()=>view(-Math.PI/2,0)}>Side</button><button onClick={()=>view(Math.PI)}>Back</button><button className={wire?"on":""} onClick={()=>setWire(v=>!v)}><Wireframe size={13}/>Wire</button><button className={sil?"on":""} onClick={()=>setSil(v=>!v)}><ScanLine size={13}/>Silhouette</button></div><span className="orbit">DRAG · ORBIT &nbsp;&nbsp; WHEEL · ZOOM</span></div>;
}

export default function GoG3DLabPage(){
  const [file,setFile]=useState<File|null>(null),[imageUrl,setImageUrl]=useState<string|null>(null),[providers,setProviders]=useState<ProviderStatus[]>([]),[provider,setProvider]=useState("sam3d-mhr"),[parts,setParts]=useState<Part[]>(()=>buildBaseline()),[result,setResult]=useState<RunResult|null>(null),[running,setRunning]=useState(false),[error,setError]=useState<string|null>(null),[useMask,setUseMask]=useState(true),[bbox,setBbox]=useState(.8);
  useEffect(()=>{fetch("/api/gog-3d-lab/run").then(r=>r.json()).then(v=>setProviders(v.providers??[])).catch(()=>setProviders([]));},[]);
  useEffect(()=>()=>{if(imageUrl)URL.revokeObjectURL(imageUrl)},[imageUrl]);
  const active=providers.find(p=>p.id===provider),vertexCount=useMemo(()=>parts.reduce((n,p)=>n+p.verts.length,0),[parts]),faceCount=useMemo(()=>parts.reduce((n,p)=>n+p.faces.length,0),[parts]);
  const choose=(next:File|null)=>{if(imageUrl)URL.revokeObjectURL(imageUrl);setFile(next);setImageUrl(next?URL.createObjectURL(next):null);setError(null);};
  const run=async()=>{if(!file)return;setRunning(true);setError(null);try{const form=new FormData();form.set("provider",provider);form.set("image",file,file.name);form.set("useMask",String(useMask));form.set("bboxThreshold",String(bbox));const response=await fetch("/api/gog-3d-lab/run",{method:"POST",body:form});const payload=await response.json();if(!response.ok)throw new Error(`${payload.error??"RUN_FAILED"}${payload.detail?`: ${payload.detail}`:""}`);const parsed=parseObj(payload.meshObj);setParts(parsed);setResult(payload);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setRunning(false);}};
  const reset=()=>{setParts(buildBaseline());setResult(null);setError(null);};
  const download=()=>{if(!result?.meshObj)return;const blob=new Blob([result.meshObj],{type:"text/plain"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="gog-sam3d-mhr.obj";a.click();URL.revokeObjectURL(url);};

  return <main className="lab"><header><div className="brand"><strong>GoG 2D→3D Lab</strong><span>provider workbench · v0.2</span></div><div className="runtime"><i className={active?.available?"ready":""}/>{active?.available?"SAM3D WORKER CONNECTED":"WORKER NOT CONFIGURED"}</div></header>
    <section className="workspace">
      <aside className="input"><h1>Reference</h1><label className="drop"><input type="file" accept="image/*" onChange={e=>choose(e.target.files?.[0]??null)}/>{imageUrl?<img src={imageUrl} alt="Uploaded 2D reference"/>:<div><ImagePlus size={28}/><strong>Drop or choose a character image</strong><span>PNG · JPG · WEBP · max 20 MB</span></div>}</label><div className="control"><label>Provider</label><select value={provider} onChange={e=>setProvider(e.target.value)}><option value="sam3d-mhr">SAM 3D Body + MHR</option></select></div><div className="twocol"><label><span>Mask-conditioned</span><input type="checkbox" checked={useMask} onChange={e=>setUseMask(e.target.checked)}/></label><label><span>BBox threshold</span><input type="number" min="0.1" max="0.99" step="0.05" value={bbox} onChange={e=>setBbox(Number(e.target.value))}/></label></div><button className="run" disabled={!file||running||!active?.available} onClick={run}>{running?<LoaderCircle className="spin" size={16}/>:<Play size={16}/>} {running?"Reconstructing…":"Run reconstruction"}</button>{!active?.available&&<p className="hint"><CircleAlert size={13}/>Configure the GPU worker endpoint to enable SAM3D/MHR inference. The viewer remains usable with the procedural baseline.</p>}{error&&<p className="error"><CircleAlert size={13}/>{error}</p>}</aside>
      <Viewer parts={parts}/>
      <aside className="inspect"><div className="inspectTop"><h2>Output</h2><button onClick={reset} title="Reset to procedural baseline"><RotateCcw size={14}/></button></div><div className="state"><Box size={16}/><div><strong>{result?"SAM3D / MHR BODY PRIOR":"PROCEDURAL BASELINE"}</strong><span>{result?"repo-backed inference result":"comparison fixture"}</span></div></div><dl><div><dt>Vertices</dt><dd>{vertexCount.toLocaleString()}</dd></div><div><dt>Faces</dt><dd>{faceCount.toLocaleString()}</dd></div><div><dt>Provider</dt><dd>{result?.model??"GoG procedural v0.4"}</dd></div><div><dt>Run time</dt><dd>{result?`${(result.elapsedMs/1000).toFixed(1)} s`:"—"}</dd></div></dl>{result&&<button className="download" onClick={download}><Download size={14}/>Download OBJ</button>}<h3>Product-line stages</h3><ol><li className="done"><CheckCircle2 size={13}/>Evidence intake</li><li className="done"><CheckCircle2 size={13}/>2D source preview</li><li className={result?"done":"pending"}>{result?<CheckCircle2 size={13}/>:<CircleAlert size={13}/>}SAM3D → MHR prior</li><li className="pending"><CircleAlert size={13}/>Camera / silhouette QA</li><li className="pending"><CircleAlert size={13}/>Clothing / accessories</li><li className="pending"><CircleAlert size={13}/>Retopo / skin / export</li></ol><p className="boundary">This app uses the external repo as a replaceable worker. It does not promote generated geometry into GoG canon automatically.</p></aside>
    </section>
    <style>{`
      :root{color-scheme:dark}.lab{min-height:100vh;background:#071012;color:#dbe7e5;font-family:Inter,ui-sans-serif,system-ui}.lab *{box-sizing:border-box}.lab header{height:58px;border-bottom:1px solid #203438;display:flex;align-items:center;justify-content:space-between;padding:0 18px;background:#081315}.brand{display:flex;gap:12px;align-items:baseline}.brand strong{text-transform:uppercase;letter-spacing:.08em;font-size:14px}.brand span,.runtime{color:#829a9a;font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.runtime{display:flex;gap:8px;align-items:center}.runtime i{width:7px;height:7px;border-radius:50%;background:#735548}.runtime i.ready{background:#67d8c3;box-shadow:0 0 12px #67d8c377}.workspace{height:calc(100vh - 58px);display:grid;grid-template-columns:300px minmax(0,1fr) 300px}.input,.inspect{padding:18px;background:#091416;overflow:auto}.input{border-right:1px solid #203438}.inspect{border-left:1px solid #203438}.lab h1,.lab h2{font-size:18px;font-weight:580;margin:0 0 14px}.lab h3{font-size:11px;text-transform:uppercase;letter-spacing:.11em;color:#829a9a;margin:22px 0 8px}.drop{height:43vh;min-height:260px;border:1px dashed #335054;background:#0a1517;display:grid;place-items:center;overflow:hidden;cursor:pointer}.drop input{display:none}.drop img{width:100%;height:100%;object-fit:contain}.drop div{display:grid;justify-items:center;text-align:center;gap:9px;color:#789093;padding:20px}.drop strong{color:#c7d8d6;font-size:13px}.drop span{font-size:10px}.control{margin-top:16px}.control label,.twocol span{display:block;color:#829a9a;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.control select,.twocol input[type=number]{width:100%;border:1px solid #294246;background:#071012;color:#dbe7e5;border-radius:7px;padding:9px;font-size:12px}.twocol{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.twocol label{border:1px solid #203438;padding:9px;border-radius:7px}.twocol input[type=checkbox]{accent-color:#67d8c3}.run,.download{width:100%;margin-top:12px;border:1px solid #4ea997;background:#67d8c3;color:#071012;border-radius:7px;padding:10px;font-weight:650;font-size:12px;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.run:disabled{opacity:.32;cursor:not-allowed}.hint,.error,.boundary{font-size:11px;line-height:1.5;color:#829a9a;display:flex;gap:7px;align-items:flex-start}.error{color:#e58a91}.viewer{position:relative;background:radial-gradient(circle at 50% 38%,rgba(35,68,69,.42),transparent 38%),linear-gradient(#0a1517,#071012);min-width:0}.viewer canvas{width:100%;height:100%;display:block;cursor:grab}.viewer canvas:active{cursor:grabbing}.viewbar{position:absolute;top:14px;left:14px;display:flex;gap:6px;flex-wrap:wrap}.viewbar button,.inspectTop button{border:1px solid #294246;background:#071012dd;color:#bcd0ce;border-radius:7px;padding:7px 9px;font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer}.viewbar button.on{background:#67d8c3;color:#071012}.orbit{position:absolute;left:14px;bottom:13px;color:#688083;font:10px ui-monospace,monospace}.inspectTop{display:flex;justify-content:space-between}.state{display:flex;gap:10px;border:1px solid #274044;background:#0b1719;padding:12px}.state strong,.state span{display:block}.state strong{font-size:11px}.state span{color:#71898a;font-size:10px;margin-top:2px}.inspect dl{margin:10px 0 0}.inspect dl div{display:flex;justify-content:space-between;border-bottom:1px solid #17292c;padding:8px 0;gap:10px}.inspect dt{color:#71898a;font-size:11px}.inspect dd{margin:0;font-size:11px;text-align:right;max-width:165px}.download{background:#0c191b;color:#c8d9d7;border-color:#355155}.inspect ol{list-style:none;padding:0;margin:0}.inspect li{display:flex;align-items:center;gap:7px;padding:7px 0;color:#889d9d;font-size:11px}.inspect li.done{color:#bcd5d1}.inspect li.done svg{color:#67d8c3}.inspect li.pending svg{color:#b08c57}.boundary{border-top:1px solid #203438;padding-top:12px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:980px){.workspace{grid-template-columns:280px 1fr}.inspect{display:none}}@media(max-width:720px){.lab header{height:auto;min-height:58px;align-items:flex-start;padding:14px}.brand{display:grid;gap:3px}.workspace{height:auto;grid-template-columns:1fr;grid-template-rows:auto 70vh auto}.input{border-right:0;border-bottom:1px solid #203438}.inspect{display:block;border-left:0;border-top:1px solid #203438}.drop{height:42vh}}
    `}</style></main>;
}
