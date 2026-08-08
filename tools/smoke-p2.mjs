// P2 live smoke: eval engine + jobs + reload survival.
// Usage: node smoke-p2.mjs <projectPathSubstring>
// Reuses the raw-protocol client style from smoke-p1.mjs (standalone on purpose).
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ARG = process.argv[2];
if (!ARG) { console.error("usage: node smoke-p2.mjs <projectPathSubstring>"); process.exit(2); }
const SUBSTR = ARG.toLowerCase();
const REG_DIR = path.join(process.env.LOCALAPPDATA, "UnityMCP", "registry");

function findEntry() {
  if (!fs.existsSync(REG_DIR)) return null;
  for (const f of fs.readdirSync(REG_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const e = JSON.parse(fs.readFileSync(path.join(REG_DIR, f), "utf8"));
      if ((e.projectPath || "").toLowerCase().includes(SUBSTR)) return e;
    } catch { /* partial write */ }
  }
  return null;
}

function frame(obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

class Client {
  constructor(name, token) {
    this.name = name;
    this.token = token;
    this.pending = new Map();
    this.events = [];
    this.progress = new Map(); // reqId -> frames[]
    this.closed = false;
    this.buf = Buffer.alloc(0);
  }
  connect(port) {
    return new Promise((resolve, reject) => {
      this.sock = net.connect({ host: "127.0.0.1", port }, () => resolve());
      this.sock.on("error", (e) => { this.lastErr = e; reject(e); });
      this.sock.on("close", () => { this.closed = true; });
      this.sock.on("data", (c) => this.onData(c));
    });
  }
  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0);
      if (this.buf.length < 4 + len) break;
      const body = this.buf.subarray(4, 4 + len);
      this.buf = this.buf.subarray(4 + len);
      let env;
      try { env = JSON.parse(body.toString("utf8")); } catch { continue; }
      if (env.type === "progress") {
        if (!this.progress.has(env.id)) this.progress.set(env.id, []);
        this.progress.get(env.id).push(env.payload);
        continue;
      }
      if (env.type === "res" || env.type === "pong" || env.type === "welcome") {
        const p = this.pending.get(env.id);
        if (p) { this.pending.delete(env.id); p.resolve(env); continue; }
        if (env.type === "welcome" && this.pending.has("__welcome__")) {
          const w = this.pending.get("__welcome__");
          this.pending.delete("__welcome__");
          w.resolve(env);
          continue;
        }
      }
      this.events.push(env);
    }
  }
  send(env) { this.sock.write(frame(env)); }
  waitFor(id, ms = 20000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error("timeout waiting " + id)); }, ms);
      this.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); } });
    });
  }
  async hello() {
    const id = randomUUID();
    const p = this.waitFor("__welcome__");
    this.send({ v: 1, id, type: "hello", payload: {
      v: { min: 1, max: 1 },
      client: { name: this.name, version: "0.0.0", pid: process.pid,
                sessionId: this.name, token: this.token },
      features: [],
    }});
    return (await p).payload;
  }
  async req(method, params = {}, ms = 30000) {
    const id = randomUUID();
    const p = this.waitFor(id, ms);
    this.send({ id, type: "req", payload: { method, params, timeoutMs: ms - 2000 } });
    const res = await p;
    return { id, res };
  }
  close() { try { this.sock.destroy(); } catch { /* noop */ } }
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  :: " + String(detail).slice(0, 220) : ""));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRegistry(oldPid, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const e = findEntry();
    if (e && (oldPid === undefined || e.pid === oldPid)) return e;
    await sleep(1000);
  }
  return null;
}

let entry = findEntry();
if (!entry) { console.log("NO-REGISTRY-ENTRY"); process.exit(2); }
console.log("registry:", JSON.stringify({ ...entry, token: entry.token ? "<redacted>" : undefined }));
const projectRoot = entry.projectPath;

let a = new Client("smoke2-a", entry.token);
await a.connect(entry.port);
const w = await a.hello();
check("welcome.evalEngine", w.eval && (w.eval.engine === "csc" || w.eval.engine === "codedom"), JSON.stringify(w.eval));

// 1. C#10 eval + Debug.Log capture
const code10 = [
  "using UnityEngine;",
  "record R(int A);",
  "class EditorCommand {",
  "  static object Execute() {",
  "    Debug.Log(\"p2-log-capture\");",
  "    var msg = new R(7).A switch { 7 => \"ok\", _ => \"ng\" };",
  "    return new { v = msg, list = new[]{1,2,3} };",
  "  }",
  "}",
].join("\n");
const e1 = await a.req("eval.run", { code: code10, captureLogs: true }, 90000);
const r1 = e1.res.payload;
check("eval.csharp10", r1.ok && r1.result.result && r1.result.result.v === "ok", JSON.stringify(r1.ok ? r1.result.result : r1.error));
check("eval.log-capture", r1.ok && JSON.stringify(r1.result.logs || []).includes("p2-log-capture"), JSON.stringify((r1.result && r1.result.logs || []).slice(0, 3)));
check("eval.engine-reported", r1.ok && (r1.result.engine === "csc" || r1.result.engine === "codedom"), r1.ok && r1.result.engine);

// 2. cache hit on identical source
const e1b = await a.req("eval.run", { code: code10 }, 60000);
check("eval.cache-hit", e1b.res.payload.ok && e1b.res.payload.result.cached === true, "cached=" + (e1b.res.payload.result && e1b.res.payload.result.cached));

// 3. syntax error -> diagnostics with line/col
const bad = "class EditorCommand { static object Execute() { int x = ; return x; } }";
const e2 = await a.req("eval.run", { code: bad }, 60000);
const err2 = e2.res.payload.error;
check("eval.diagnostics", !e2.res.payload.ok && err2.code === "EVAL_COMPILE_ERROR" && Array.isArray(err2.diagnostics) && err2.diagnostics.length > 0 && err2.diagnostics[0].line > 0,
  err2 && JSON.stringify((err2.diagnostics || [])[0]));

// 4. runtime error -> EVAL_RUNTIME_ERROR + stack first line
const boom = "class EditorCommand { static object Execute() { throw new System.InvalidOperationException(\"p2-boom\"); } }";
const e3 = await a.req("eval.run", { code: boom }, 60000);
check("eval.runtime-error", !e3.res.payload.ok && e3.res.payload.error.code === "EVAL_RUNTIME_ERROR" && (e3.res.payload.error.message || "").includes("p2-boom"),
  e3.res.payload.error && (e3.res.payload.error.message || "").slice(0, 80));

// 5. job: demo sleep with progress via job.wait
const js = await a.req("job.submit", { method: "sys.demo.sleep", params: { ms: 6000, ticks: 6 } });
check("job.submit", js.res.payload.ok && js.res.payload.result.jobId, JSON.stringify(js.res.payload.result || js.res.payload.error));
const jobId = js.res.payload.ok ? js.res.payload.result.jobId : null;
if (jobId) {
  const jw = await a.req("job.wait", { jobId, timeoutMs: 20000 }, 25000);
  const prog = a.progress.get(jw.id) || [];
  check("job.wait-completes", jw.res.payload.ok && jw.res.payload.result.state === "completed", JSON.stringify(jw.res.payload.result || jw.res.payload.error));
  check("job.progress-streamed", prog.length >= 2, "progress frames=" + prog.length);
}

// 6. job cancel
const js2 = await a.req("job.submit", { method: "sys.demo.sleep", params: { ms: 30000, ticks: 30 } });
const jobId2 = js2.res.payload.ok ? js2.res.payload.result.jobId : null;
if (jobId2) {
  await sleep(1500);
  const jc = await a.req("job.cancel", { jobId: jobId2 });
  await sleep(1500);
  const st = await a.req("job.status", { jobId: jobId2 });
  const rec = st.res.payload.ok ? st.res.payload.result : null;
  check("job.cancel", jc.res.payload.ok && rec && rec.state === "cancelled", rec && rec.state);
}

// 7. reload survival: eval writes a probe script + Refresh -> domain reload
// Unique content per run: identical content would make Refresh a no-op (no
// compile, no reload) when a previous run's probe file survived cleanup.
const stamp = Date.now().toString(36);
const probeWriter = [
  "using UnityEngine; using UnityEditor; using System.IO;",
  "class EditorCommand { static object Execute() {",
  "  File.WriteAllText(Path.Combine(Application.dataPath, \"P2ReloadProbe.cs\"),",
  `    "// run ${stamp}\\npublic static class P2ReloadProbe { public static string Ping() => \\"probe-alive\\"; }");`,
  "  AssetDatabase.Refresh();",
  "  return new { wrote = true };",
  "} }",
].join("\n");
const jr = await a.req("job.submit", { method: "sys.demo.sleep", params: { ms: 60000, ticks: 60 } });
const reloadJobId = jr.res.payload.ok ? jr.res.payload.result.jobId : null;
const e4 = await a.req("eval.run", { code: probeWriter }, 60000);
check("reload.trigger-write", e4.res.payload.ok === true, JSON.stringify(e4.res.payload.result || e4.res.payload.error));

// expect bye/close within 60s
const t0 = Date.now();
while (!a.closed && Date.now() - t0 < 60000) await sleep(500);
const sawBye = a.events.some((e) => e.type === "bye");
check("reload.bye-or-close", a.closed, "closed=" + a.closed + " bye=" + sawBye + " events=" + a.events.filter(e => e.type === "bye").length);

// reconnect (same pid, listener rebinds)
entry = await waitRegistry(entry.pid, 90000);
check("reload.registry-back", !!entry, entry && ("pid=" + entry.pid + " port=" + entry.port));
if (entry) {
  // A single script import in batchmode can trigger TWO domain reloads
  // (import reload + completion refresh reload); a connection landing between
  // them dies mid-handshake. Real server clients handle this via their state
  // machine; here we just retry the whole connect+hello.
  let connected = false;
  let w2 = null;
  for (let i = 0; i < 12 && !connected; i++) {
    a = new Client("smoke2-a2", entry.token);
    try {
      await a.connect(entry.port);
      w2 = await Promise.race([
        a.hello(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("hello-timeout")), 8000)),
      ]);
      connected = true;
    } catch {
      a.close();
      await sleep(2000);
    }
  }
  check("reload.reconnect", connected, "connect+hello attempts<=12");
  if (connected) {
    check("reload.count-incremented", w2.editor.domainReloadCount >= 1, "reloads=" + w2.editor.domainReloadCount);
    const cs = await a.req("sys.compile.status");
    check("reload.compile-status", cs.res.payload.ok && cs.res.payload.result.compiling === false,
      JSON.stringify(cs.res.payload.result).slice(0, 120));
    // the probe class must exist now
    const probeCall = "class EditorCommand { static object Execute() { return new { pong = P2ReloadProbe.Ping() }; } }";
    const e5 = await a.req("eval.run", { code: probeCall }, 90000);
    check("reload.new-class-usable", e5.res.payload.ok && e5.res.payload.result.result.pong === "probe-alive",
      JSON.stringify(e5.res.payload.ok ? e5.res.payload.result.result : e5.res.payload.error));
    // job that spanned the reload must be terminal JOB_NOT_RESUMABLE (CanResume=false)
    if (reloadJobId) {
      const st2 = await a.req("job.status", { jobId: reloadJobId });
      const rec2 = st2.res.payload.ok ? st2.res.payload.result : null;
      check("reload.job-not-resumable", rec2 && rec2.state === "failed" && rec2.error && rec2.error.code === "JOB_NOT_RESUMABLE",
        rec2 && (rec2.state + "/" + (rec2.error && rec2.error.code)));
    }
    // cleanup probe file for idempotent reruns
    const cleanup = [
      "using UnityEngine; using UnityEditor; using System.IO;",
      "class EditorCommand { static object Execute() {",
      "  var p = Path.Combine(Application.dataPath, \"P2ReloadProbe.cs\");",
      "  if (File.Exists(p)) { File.Delete(p); File.Delete(p + \".meta\"); AssetDatabase.Refresh(); }",
      "  return new { cleaned = true };",
      "} }",
    ].join("\n");
    await a.req("eval.run", { code: cleanup }, 60000).catch(() => {});
    a.close();
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log("SUMMARY " + (results.length - failed) + "/" + results.length + " passed");
process.exit(failed === 0 ? 0 : 1);
