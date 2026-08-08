// P1 live smoke: raw-protocol exercise against a running plugin instance.
// Usage: node smoke-p1.mjs <projectPathSubstring>
// Standalone on purpose (no server/ imports) so it tests the wire, not our client code.
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { randomUUID } from "node:crypto";

const ARG = process.argv[2];
if (!ARG) { console.error("usage: node smoke-p1.mjs <projectPathSubstring>"); process.exit(2); }
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
    this.token = token; // registry token (v2.1+ auth): echoed as hello.client.token
    this.pending = new Map();
    this.events = [];
    this.buf = Buffer.alloc(0);
  }
  connect(port) {
    return new Promise((resolve, reject) => {
      this.sock = net.connect({ host: "127.0.0.1", port }, () => resolve());
      this.sock.on("error", reject);
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
      const env = JSON.parse(body.toString("utf8"));
      if (env.type === "res" || env.type === "pong" || env.type === "welcome") {
        const p = this.pending.get(env.id);
        if (p) { this.pending.delete(env.id); p.resolve(env); }
        else if (env.type === "welcome" && this.pending.has("__welcome__")) {
          const w = this.pending.get("__welcome__");
          this.pending.delete("__welcome__");
          w.resolve(env);
        }
        else if (env.type === "res" && this.pending.has("__welcome__") &&
                 env.payload && env.payload.ok === false) {
          // Pre-welcome refusal (AUTH_REQUIRED etc): surface the real cause
          // instead of dying later as "timeout waiting __welcome__" (F-19).
          const w = this.pending.get("__welcome__");
          this.pending.delete("__welcome__");
          const e = env.payload.error || {};
          w.reject(new Error("pre-welcome refusal " + e.code + ": " + e.message));
        }
      } else {
        this.events.push(env);
      }
    }
  }
  send(env) { this.sock.write(frame(env)); }
  waitFor(id, ms = 10000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error("timeout waiting " + id)); }, ms);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(t); resolve(v); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
    });
  }
  async hello() {
    const id = randomUUID();
    const p = this.waitFor("__welcome__");
    this.send({ v: 1, id, type: "hello", payload: {
      v: { min: 1, max: 1 },
      client: { name: this.name, version: "0.0.0", pid: process.pid, sessionId: this.name,
                token: this.token },
      features: [],
    }});
    return (await p).payload;
  }
  async req(method, params = {}, ms = 15000) {
    const id = randomUUID();
    const p = this.waitFor(id, ms);
    this.send({ id, type: "req", payload: { method, params } });
    const res = await p;
    return { id, res };
  }
  close() { try { this.sock.destroy(); } catch { /* noop */ } }
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  :: " + detail : ""));
}

const entry = findEntry();
if (!entry) { console.log("NO-REGISTRY-ENTRY for " + SUBSTR); process.exit(2); }
console.log("registry:", JSON.stringify({ ...entry, token: entry.token ? "<redacted>" : undefined }));

const a = new Client("smoke-a", entry.token);
await a.connect(entry.port);
const welcome = await a.hello();
check("handshake.welcome", welcome.v === 1 && !!welcome.unity, JSON.stringify(welcome.unity));

// 10 parallel echo with unique payloads: correlation check
const echoes = await Promise.all(
  Array.from({ length: 10 }, (_, i) => a.req("sys.echo", { n: i, tag: "e" + i }))
);
const allMatch = echoes.every(({ res }, i) => res.payload.ok && res.payload.result && res.payload.result.n === i);
check("correlation.10-parallel-echo", allMatch, allMatch ? "all ids+payloads matched" : JSON.stringify(echoes.map(e => e.res.payload)));

// sys.info / sys.status
const info = await a.req("sys.info");
check("sys.info", info.res.payload.ok && info.res.payload.result.unity.projectPath.length > 0,
  "engine=" + JSON.stringify(info.res.payload.result.eval));
const status = await a.req("sys.status");
check("sys.status", status.res.payload.ok, JSON.stringify(status.res.payload.result).slice(0, 140));

// method not found
const nf = await a.req("no.such.method");
check("method-not-found", nf.res.payload.ok === false && nf.res.payload.error.code === "METHOD_NOT_FOUND",
  nf.res.payload.error && nf.res.payload.error.code);

// ping
{
  const id = randomUUID();
  const p = a.waitFor(id, 5000);
  a.send({ id, type: "ping", payload: {} });
  const pong = await p;
  check("ping-pong", pong.type === "pong" || pong.type === "res", pong.type);
}

// lease: a acquires, b sees LEASE_HELD, b takeover, a sees lease.lost event
const acq = await a.req("lease.acquire");
check("lease.acquire", acq.res.payload.ok === true, JSON.stringify(acq.res.payload.result));
const b = new Client("smoke-b", entry.token);
await b.connect(entry.port);
await b.hello();
const acqB = await b.req("lease.acquire");
check("lease.held-for-b", acqB.res.payload.ok === false && acqB.res.payload.error.code === "LEASE_HELD",
  acqB.res.payload.error && acqB.res.payload.error.code);
const tk = await b.req("lease.takeover");
check("lease.takeover", tk.res.payload.ok === true, JSON.stringify(tk.res.payload.result));
await new Promise(r => setTimeout(r, 700));
const lost = a.events.some(e => e.type === "event" && e.payload.kind === "lease.lost");
check("lease.lost-event-to-a", lost, JSON.stringify(a.events.map(e => e.payload && e.payload.kind)));

// HTTP health peek on same port
const health = await new Promise((resolve) => {
  http.get({ host: "127.0.0.1", port: entry.port, path: "/" }, (r) => {
    let d = "";
    r.on("data", (c) => (d += c));
    r.on("end", () => resolve({ code: r.statusCode, body: d }));
  }).on("error", (e) => resolve({ code: 0, body: String(e) }));
});
let healthOk = false, healthDetail = health.body.slice(0, 140);
try { healthOk = health.code === 200 && JSON.parse(health.body).status === "ok"; } catch { /* not json */ }
check("http.health", healthOk, "code=" + health.code + " " + healthDetail);

a.close(); b.close();
const failed = results.filter(r => !r.ok).length;
console.log("SUMMARY " + (results.length - failed) + "/" + results.length + " passed");
process.exit(failed === 0 ? 0 : 1);
