"use client";

import { useEffect, useRef, useState } from "react";

type V3 = [number, number, number];
type Face = [number, number, number];
type Part = { name: string; verts: V3[]; faces: Face[]; color: string };

type Camera = { ry: number; rx: number; zoom: number };

const COLORS = {
  skin: "#ebc7b1",
  hair: "#c29c60",
  robe: "#dde5e5",
  robeBlue: "#b1c2c8",
  robeInner: "#efece4",
  metal: "#918464",
  dark: "#3a3733",
  green: "#41764d",
  horn: "#97a9b2",
};

function ellipsoid(name: string, center: V3, r: V3, color: string, rings = 8, seg = 12): Part {
  const verts: V3[] = [];
  const faces: Face[] = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const phi = v * Math.PI;
    for (let j = 0; j < seg; j++) {
      const u = j / seg;
      const th = u * Math.PI * 2;
      verts.push([
        center[0] + r[0] * Math.sin(phi) * Math.cos(th),
        center[1] + r[1] * Math.sin(phi) * Math.sin(th),
        center[2] + r[2] * Math.cos(phi),
      ]);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const n = (j + 1) % seg;
    const a = i * seg + j, b = i * seg + n, c = (i + 1) * seg + n, d = (i + 1) * seg + j;
    faces.push([a, b, c], [a, c, d]);
  }
  return { name, verts, faces, color };
}

function frustum(name: string, z0: number, z1: number, rx0: number, ry0: number, rx1: number, ry1: number, color: string, seg = 18): Part {
  const verts: V3[] = [];
  const faces: Face[] = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * Math.PI * 2;
    verts.push([rx0 * Math.cos(a), ry0 * Math.sin(a), z0]);
  }
  for (let i = 0; i < seg; i++) {
    const a = i / seg * Math.PI * 2;
    verts.push([rx1 * Math.cos(a), ry1 * Math.sin(a), z1]);
  }
  for (let i = 0; i < seg; i++) {
    const n = (i + 1) % seg;
    faces.push([i, n, seg + n], [i, seg + n, seg + i]);
  }
  return { name, verts, faces, color };
}

function tube(name: string, a: V3, b: V3, radius: number, color: string, seg = 10): Part {
  const verts: V3[] = [];
  const faces: Face[] = [];
  const vx = b[0]-a[0], vy=b[1]-a[1], vz=b[2]-a[2];
  const len = Math.hypot(vx,vy,vz) || 1;
  const ux=vx/len, uy=vy/len, uz=vz/len;
  const helper: V3 = Math.abs(uz) < .9 ? [0,0,1] : [0,1,0];
  let ax = uy*helper[2]-uz*helper[1], ay=uz*helper[0]-ux*helper[2], az=ux*helper[1]-uy*helper[0];
  const al=Math.hypot(ax,ay,az)||1; ax/=al; ay/=al; az/=al;
  const bx = uy*az-uz*ay, by=uz*ax-ux*az, bz=ux*ay-uy*ax;
  for(const p of [a,b]) for(let i=0;i<seg;i++){
    const t=i/seg*Math.PI*2, c=Math.cos(t)*radius, s=Math.sin(t)*radius;
    verts.push([p[0]+ax*c+bx*s,p[1]+ay*c+by*s,p[2]+az*c+bz*s]);
  }
  for(let i=0;i<seg;i++){const n=(i+1)%seg;faces.push([i,n,seg+n],[i,seg+n,seg+i]);}
  return {name,verts,faces,color};
}

function cone(name: string, a: V3, b: V3, radius: number, color: string, seg = 8): Part {
  const base=tube(name,a,[a[0]+(b[0]-a[0])*.08,a[1]+(b[1]-a[1])*.08,a[2]+(b[2]-a[2])*.08],radius,color,seg);
  const tipIndex=base.verts.length;base.verts.push(b);
  const start=seg;
  for(let i=0;i<seg;i++){const n=(i+1)%seg;base.faces.push([start+i,start+n,tipIndex]);}
  return base;
}

function buildModel(): Part[] {
  const p: Part[] = [];
  p.push(frustum("body_torso",.93,1.38,.14,.095,.18,.11,COLORS.robeInner));
  p.push(tube("neck",[0,0,1.38],[0,0,1.49],.047,COLORS.skin));
  p.push(ellipsoid("head",[0,-.01,1.595],[.112,.09,.118],COLORS.skin,10,16));
  p.push(frustum("inner_robe",.04,1.16,.25,.15,.14,.095,COLORS.robeInner));
  p.push(frustum("outer_robe",.04,1.17,.325,.20,.17,.11,COLORS.robeBlue));
  p.push(ellipsoid("hair_crown",[0,.02,1.685],[.118,.095,.07],COLORS.hair));
  p.push(ellipsoid("hair_side_L",[-.095,.062,1.602],[.078,.092,.105],COLORS.hair));
  p.push(ellipsoid("hair_side_R",[.095,.062,1.602],[.078,.092,.105],COLORS.hair));
  p.push(ellipsoid("hair_back",[0,.102,1.598],[.098,.073,.092],COLORS.hair));
  p.push(tube("strand_L",[-.058,-.076,1.67],[-.072,-.093,1.40],.008,COLORS.hair));
  p.push(tube("strand_R",[.058,-.076,1.67],[.072,-.093,1.40],.008,COLORS.hair));

  for (const [side,s] of [["L",-1],["R",1]] as const) {
    const shoulder:V3=[s*.18,0,1.33], elbow:V3=[s*.245,-.005,1.10], wrist:V3=[s*.285,-.01,.90];
    p.push(tube(`upper_arm_${side}`,shoulder,elbow,.043,COLORS.skin));
    p.push(tube(`forearm_${side}`,elbow,wrist,.038,COLORS.skin));
    p.push(tube(`sleeve_upper_${side}`,shoulder,elbow,.085,COLORS.robeInner));
    p.push(tube(`sleeve_lower_${side}`,elbow,wrist,.115,COLORS.robeInner));
    p.push(ellipsoid(`hand_${side}`,[s*.293,-.012,.825],[.031,.024,.067],COLORS.skin));
    p.push(ellipsoid(`horn_socket_${side}`,[s*.108,.006,1.625],[.016,.011,.026],COLORS.horn));
    p.push(cone(`horn_long_${side}`,[s*.116,.012,1.65],[s*.185,.03,1.80],.016,COLORS.horn));
    p.push(cone(`horn_mid_${side}`,[s*.123,-.002,1.655],[s*.187,-.008,1.72],.013,COLORS.horn));
    p.push(cone(`horn_low_${side}`,[s*.115,-.002,1.615],[s*.165,-.006,1.585],.010,COLORS.horn));
    p.push(cone(`horn_inner_${side}`,[s*.123,0,1.68],[s*.145,0,1.75],.0085,COLORS.horn));
  }
  for (let i=0;i<4;i++) {
    const z=1.03+i*.065;
    p.push(tube(`laceA_${i}`,[-.048,-.118,z+.027],[.048,-.118,z-.027],.0075,COLORS.dark,7));
    p.push(tube(`laceB_${i}`,[.048,-.119,z+.027],[-.048,-.119,z-.027],.0075,COLORS.dark,7));
  }
  p.push(ellipsoid("green_gem",[0,-.10,1.405],[.022,.008,.021],COLORS.green));
  p.push(ellipsoid("medallion",[0,-.11,1.315],[.052,.008,.052],COLORS.metal));
  return p;
}

function shade(hex:string, factor:number){
  const v=parseInt(hex.slice(1),16);const r=(v>>16)&255,g=(v>>8)&255,b=v&255;
  const f=(x:number)=>Math.max(0,Math.min(255,Math.round(x*factor)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function Viewer(){
  const ref=useRef<HTMLCanvasElement>(null);
  const cam=useRef<Camera>({ry:0,rx:-.06,zoom:430});
  const drag=useRef<[number,number]|null>(null);
  const [wire,setWire]=useState(false);
  const [sil,setSil]=useState(false);

  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    const parts=buildModel();let raf=0;
    const draw=()=>{
      const rect=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,2);
      if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){
        canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
      }
      ctx.clearRect(0,0,rect.width,rect.height);
      const {ry,rx,zoom}=cam.current, cy=Math.cos(ry),sy=Math.sin(ry),cx=Math.cos(rx),sx=Math.sin(rx);
      const faces:{pts:[number,number][],depth:number,color:string}[]=[];
      for(const part of parts){
        const pv=part.verts.map(([x,y,z])=>{
          const x1=x*cy-y*sy, y1=x*sy+y*cy;
          const y2=y1*cx-(z-.92)*sx, z2=y1*sx+(z-.92)*cx;
          return {x:rect.width/2+x1*zoom,y:rect.height/2-y2*zoom,depth:z2};
        });
        for(const f of part.faces){
          const a=pv[f[0]],b=pv[f[1]],c=pv[f[2]];
          const area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(area>0)continue;
          const depth=(a.depth+b.depth+c.depth)/3;
          const lit=.82+Math.max(-.18,Math.min(.18,depth*.22));
          faces.push({pts:[[a.x,a.y],[b.x,b.y],[c.x,c.y]],depth,color:sil?"#0b1517":shade(part.color,lit)});
        }
      }
      faces.sort((a,b)=>a.depth-b.depth);
      for(const f of faces){ctx.beginPath();ctx.moveTo(...f.pts[0]);ctx.lineTo(...f.pts[1]);ctx.lineTo(...f.pts[2]);ctx.closePath();ctx.fillStyle=f.color;ctx.fill();if(wire){ctx.strokeStyle="rgba(139,219,205,.17)";ctx.lineWidth=.55;ctx.stroke();}}
      raf=requestAnimationFrame(draw);
    };
    draw();return()=>cancelAnimationFrame(raf);
  },[wire,sil]);

  const view=(ry:number,rx=-.06)=>{cam.current.ry=ry;cam.current.rx=rx;};
  return <div className="viewer">
    <canvas ref={ref}
      onPointerDown={e=>{drag.current=[e.clientX,e.clientY];e.currentTarget.setPointerCapture(e.pointerId)}}
      onPointerMove={e=>{if(!drag.current)return;cam.current.ry+=(e.clientX-drag.current[0])*.008;cam.current.rx=Math.max(-1,Math.min(1,cam.current.rx+(e.clientY-drag.current[1])*.006));drag.current=[e.clientX,e.clientY]}}
      onPointerUp={()=>drag.current=null}
      onWheel={e=>{e.preventDefault();cam.current.zoom=Math.max(280,Math.min(650,cam.current.zoom-e.deltaY*.45))}}
      aria-label="Interactive Kan-E-Senna v0.4 3D proxy viewer" />
    <div className="tools">
      <button onClick={()=>view(0)}>Front</button><button onClick={()=>view(-.72)}>3/4</button><button onClick={()=>view(-Math.PI/2,0)}>Side</button><button onClick={()=>view(Math.PI)}>Back</button>
      <button className={wire?"on":""} onClick={()=>setWire(v=>!v)}>Wire</button><button className={sil?"on":""} onClick={()=>setSil(v=>!v)}>Silhouette</button>
    </div>
    <div className="hud">DRAG · ORBIT &nbsp;&nbsp; WHEEL · ZOOM</div>
  </div>
}

export default function GoG3DLabPage(){
  return <main className="lab">
    <header><div><strong>GoG 2D→3D Lab</strong><span>Kan-E-Senna · pipeline v0.4</span></div><p><i/>REAL GEOMETRY · NEURAL PRIOR PENDING</p></header>
    <section className="grid">
      <aside className="brief"><small>CURRENT TARGET</small><h1>Kan-E-Senna</h1><div className="refbox"><div className="silhouette">2D reference managed in governed Drive / Notion evidence packet</div></div><p>Latest fidelity corrections: muted gray-blue horn structures and simplified robe surfaces with unsupported ornament removed.</p></aside>
      <Viewer/>
      <aside className="inspect"><small>PIPELINE INSPECTION</small><h2>Evidence → geometry</h2><b>PROVISIONAL · NOT CANON GEOMETRY</b>
        <ol><li className="done">Reference authority</li><li className="done">Region decomposition</li><li className="done">Executable fallback geometry</li><li>SAM 3D Body → MHR adapter</li><li>PyTorch3D camera / silhouette QA</li><li>Production retopo / skin</li></ol>
        <h3>Provider contract</h3><p>SAM3D/MHR may replace the body generator later. The evidence, QA, viewer, provenance, and acceptance layers stay provider-independent.</p>
      </aside>
    </section>
    <style>{`
      :root{color-scheme:dark}.lab{min-height:100vh;background:#071012;color:#dbe7e5;font-family:Inter,ui-sans-serif,system-ui}.lab header{height:58px;border-bottom:1px solid #203438;display:flex;align-items:center;justify-content:space-between;padding:0 18px;background:#081315}.lab header div{display:flex;gap:12px;align-items:baseline}.lab header strong{text-transform:uppercase;letter-spacing:.08em;font-size:14px}.lab header span,.lab small{color:#829a9a;font:10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.11em}.lab header p{font-size:11px;color:#829a9a;display:flex;gap:8px;align-items:center}.lab header i{width:7px;height:7px;border-radius:50%;background:#67d8c3;box-shadow:0 0 14px #67d8c388}.grid{height:calc(100vh - 58px);display:grid;grid-template-columns:minmax(250px,28%) 1fr 280px}.brief,.inspect{padding:18px;background:#091416}.brief{border-right:1px solid #203438}.inspect{border-left:1px solid #203438}.brief h1,.inspect h2{margin:6px 0 15px;font-weight:560}.brief h1{font-size:22px}.inspect h2{font-size:18px}.brief p,.inspect p{color:#91a5a4;font-size:12px;line-height:1.6}.refbox{aspect-ratio:3/4;border:1px solid #203438;background:radial-gradient(circle at 50% 30%,#1e3537,#0b1719 60%);display:grid;place-items:center;margin:14px 0}.silhouette{width:70%;text-align:center;color:#6d8587;font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}.viewer{position:relative;min-width:0;background:radial-gradient(circle at 50% 38%,rgba(35,68,69,.42),transparent 38%),linear-gradient(#0a1517,#071012)}.viewer canvas{width:100%;height:100%;display:block;cursor:grab}.viewer canvas:active{cursor:grabbing}.tools{position:absolute;top:14px;left:14px;display:flex;gap:6px;flex-wrap:wrap}.tools button{border:1px solid #294246;background:#071012d9;color:#bcd0ce;border-radius:7px;padding:7px 9px;font-size:11px}.tools button.on{background:#67d8c3;color:#071012;border-color:#67d8c3}.hud{position:absolute;bottom:13px;left:14px;color:#688083;font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.inspect b{display:inline-block;color:#dfbb79;border:1px solid #6d5a37;background:#17150f;padding:6px 8px;border-radius:6px;font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.inspect ol{list-style:none;padding:12px 0;margin:0}.inspect li{position:relative;padding:8px 0 8px 20px;color:#8da2a3;font-size:12px}.inspect li:before{content:'';position:absolute;left:2px;top:13px;width:7px;height:7px;border-radius:50%;background:#d7ab62}.inspect li.done:before{background:#67d8c3}.inspect h3{font-size:12px;margin:14px 0 6px}@media(max-width:980px){.grid{grid-template-columns:35% 1fr}.inspect{display:none}}@media(max-width:700px){.lab header{height:auto;min-height:58px;gap:10px}.lab header p{display:none}.grid{height:auto;grid-template-columns:1fr;grid-template-rows:auto 70vh auto}.brief{border-right:0;border-bottom:1px solid #203438}.inspect{display:block;border-left:0;border-top:1px solid #203438}.refbox{max-height:340px}.viewer{min-height:600px}}
    `}</style>
  </main>;
}
