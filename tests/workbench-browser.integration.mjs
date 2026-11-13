import assert from "node:assert/strict";
import test from "node:test";
import { Miniflare } from "miniflare";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function walk(dir){
  const found=[];
  for(const e of await readdir(dir,{withFileTypes:true})){
    const p=join(dir,e.name);
    if(e.isDirectory())found.push(...await walk(p));
    else if(e.isFile()&&e.name.endsWith(".js"))found.push(p);
  }
  return found;
}
const root=resolve("dist/server"),entry=resolve(root,"index.js");
const modules=[entry,...(await walk(root)).filter(x=>x!==entry)].map(path=>({type:"ESModule",path}));
const mf=new Miniflare({
  modules,modulesRoot:root,compatibilityDate:"2026-05-22",
  compatibilityFlags:["nodejs_compat"],cf:false,host:"127.0.0.1",port:0,
  assets:{directory:resolve("dist/client"),binding:"ASSETS",routerConfig:{has_user_worker:true},assetConfig:{not_found_handling:"none"}},
  d1Databases:{DB:"aios-edge-probe"},
});
test("Edge Workbench A0 diagnostic runs through real browser, HTTP and D1", { timeout: 60000 }, async () => {
let browser,ws,userData;
try {
  const db=await mf.getD1Database("DB");
  const sql=await readFile("drizzle/0000_execution_history.sql","utf8");
  await db.batch(sql.split("--> statement-breakpoint").map(x=>x.trim()).filter(Boolean).map(x=>db.prepare(x)));
  const url=new URL("/workbench",await mf.ready).href;
  const resp=await fetch(url);assert.equal(resp.status,200);console.log("WORKBENCH HTTP 200");
  const debugPort=await freePort();
  userData=await mkdtemp(join(tmpdir(),"aios-edge-e2e-"));
  const edge=process.env.AIOS_BROWSER_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser=spawn(edge,["--headless=new","--no-first-run","--no-default-browser-check","--disable-extensions","--disable-gpu",`--remote-debugging-port=${debugPort}`,`--user-data-dir=${userData}`,"--remote-allow-origins=*","about:blank"],{stdio:"ignore",windowsHide:true});
  const endpoint=`http://127.0.0.1:${debugPort}`;
  let version;
  for(let i=0;i<80;i++){
    try{const r=await fetch(endpoint+"/json/version",{signal:AbortSignal.timeout(800)});if(r.ok){version=await r.json();break;}}catch{}
    await sleep(250);
  }
  assert.ok(version,"Edge CDP port did not initialize");
  console.log("EDGE CDP READY",version.Browser);
  const targetResp=await fetch(endpoint+"/json/new?"+encodeURIComponent(url),{method:"PUT"});
  assert.equal(targetResp.status,200);
  const target=await targetResp.json();
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
  let nextId=0;
  const calls=new Map();
  ws.addEventListener("message",event=>{
    const data=JSON.parse(event.data);
    const pending=calls.get(data.id);
    if(pending){calls.delete(data.id);clearTimeout(pending.timer);data.error?pending.reject(new Error(data.error.message)):pending.resolve(data.result);}
  });
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++nextId;
    const timer=setTimeout(()=>{calls.delete(id);reject(new Error("CDP timeout "+method));},10000);
    calls.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method,params}));
  });
  const evalJS=async expression=>{
    const result=await cdp("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails).slice(0,650));
    return result.result?.value;
  };
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Page.navigate", { url });
  await sleep(1200);
  assert.equal(await evalJS("location.pathname"), "/workbench");
  const wait=async (expression,label)=>{
    for(let i=0;i<20;i++){
      const value=await evalJS(expression);
      if(value)return value;
      await sleep(400);
    }
    throw new Error("Timed out: "+label);
  };
  const visible=await wait('document.body && document.body.innerText.includes("Internal Runtime Diagnostic")', "capability appears");
  console.log("BROWSER HYDRATED",visible);
  const clickCap='(()=>{const button=[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Internal Runtime Diagnostic"));if(!button)return false;button.click();return true;})()';
  assert.equal(await evalJS(clickCap),true);
  const runButton='[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Run A0 diagnostic"))';
  await wait(`(()=>{const b=${runButton};return b && !b.disabled})()`,"A0 run enabled");
  console.log("DIAGNOSTIC BUTTON ENABLED");
  assert.equal(await evalJS(`(()=>{const b=${runButton};b.click();return true})()`),true);
  await wait('document.body && document.body.innerText.includes("Diagnostic COMPLETED")',"completed diagnostic");
  const result=await db.prepare("SELECT execution_id,status FROM workflow_executions ORDER BY created_at DESC LIMIT 1").first();
  assert.equal(result?.status,"COMPLETED");
  console.log("BROWSER CLICK PERSISTED D1",result.execution_id);
  const alternateSelected=await evalJS(`(()=>{const button=[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Dynamic Capability Discovery"));if(!button)return false;button.click();return true;})()`);
  assert.equal(alternateSelected,true);
  await wait(`(()=>{const b=${runButton};return b && b.disabled})()`,"unapproved alternate capability disabled");
  const count=await db.prepare("SELECT COUNT(*) AS n FROM workflow_executions").first();
  assert.equal(count?.n,1);
} finally {
  ws?.close();
  browser?.kill();
  if (userData && process.platform === "win32") {
    // Edge has descendants not necessarily terminated by browser.kill(). Limit cleanup
    // to the unique, freshly-created profile owned by this test.
    const escaped = userData.replaceAll("\u0027", "\u0027\u0027");
    const cmd = `$profile=\u0027${escaped}\u0027;Get-CimInstance Win32_Process -Filter "name=\u0027msedge.exe\u0027"|Where-Object {$_.CommandLine -like ("*"+$profile+"*")}|ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}`;
    await new Promise(resolve => {
      const cleanup = spawn("powershell.exe", ["-NoProfile", "-Command", cmd], { stdio:"ignore", windowsHide:true });
      cleanup.once("close", resolve);
      cleanup.once("error", resolve);
      setTimeout(() => { cleanup.kill(); resolve(); }, 6000).unref();
    });
  }
  await mf.dispose();
  if(userData)await rm(userData,{recursive:true,force:true,maxRetries:4,retryDelay:500}).catch(()=>{});
}
});
