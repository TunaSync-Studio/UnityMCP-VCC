// P3 full-chain smoke: real MCP stdio server -> TCP -> live Unity plugin.
// Drives the production path with a minimal MCP JSON-RPC client over stdio.
// Usage: node smoke-p3-mcp.mjs [projectPathSubstring]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUBSTR = process.argv[2];
if (!SUBSTR) { console.error("usage: node smoke-p3-mcp.mjs <projectPathSubstring>"); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.join(here, "..", "server", "build", "index.js");

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  :: " + String(detail).slice(0, 200) : ""));
}

const child = spawn(process.execPath, [serverJs], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, UNITY_MCP_PROJECT: SUBSTR },
});
child.stderr.on("data", () => { /* server logs; keep quiet */ });

let buf = "";
const pending = new Map();
let nextId = 1;
child.stdout.on("data", (c) => {
  buf += c.toString("utf8");
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      p.resolve(msg);
    }
    // notifications (progress) ignored here; tools.test covers them
  }
});

function rpc(method, params, timeoutMs = 120000) {
  const id = nextId++;
  const p = new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error("rpc timeout " + method)); }, timeoutMs);
    pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); } });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return p;
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}
async function callTool(name, args, timeoutMs = 120000) {
  const r = await rpc("tools/call", { name, arguments: args }, timeoutMs);
  const content = r.result?.content?.map((c) => c.text || "").join("\n") || "";
  return { isError: !!r.result?.isError, content, raw: r };
}

// init
const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke-p3", version: "0" },
});
check("mcp.initialize", !!init.result?.serverInfo, init.result?.serverInfo?.name);
notify("notifications/initialized", {});

const tools = await rpc("tools/list", {});
const names = (tools.result?.tools || []).map((t) => t.name).sort();
check("mcp.tools-18", names.length === 18, names.length + ": " + names.join(","));

// health (composes discovery + sys.status)
const h = await callTool("unity_health_check", { verbose: false });
check("tool.health", !h.isError && h.content.includes("ok"), h.content.slice(0, 120));

// eval C#10 through the full chain
const ev = await callTool("execute_editor_command", {
  code: 'record Q(int N); class EditorCommand { static object Execute() { return new { chain = "full", n = new Q(42).N }; } }',
});
check("tool.execute", !ev.isError && ev.content.includes("42"), ev.content.slice(0, 140));

// Real object lifecycle in the isolated smoke project: create -> mutate ->
// query through the public MCP surface -> cleanup. A unique fixed name makes
// interrupted runs self-healing on the next run.
const objectName = "UnityMCP_v250_E2E_Object";
const created = await callTool("execute_editor_command", {
  code: `var old=UnityEngine.GameObject.Find("${objectName}"); if(old!=null) UnityEngine.Object.DestroyImmediate(old); var go=new UnityEngine.GameObject("${objectName}"); go.transform.position=new UnityEngine.Vector3(1,2,3); return new { created=go.name, position=go.transform.position.ToString() };`,
});
check("object.create", !created.isError && created.content.includes(objectName), created.content.slice(0, 120));

const modified = await callTool("execute_editor_command", {
  code: `var go=UnityEngine.GameObject.Find("${objectName}"); if(go==null) throw new System.Exception("test object missing"); go.transform.position=new UnityEngine.Vector3(4,5,6); go.AddComponent<UnityEngine.BoxCollider>(); return new { modified=go.name, x=go.transform.position.x, collider=go.GetComponent<UnityEngine.BoxCollider>()!=null };`,
});
check("object.modify", !modified.isError && modified.content.includes('"x": 4') && modified.content.includes('"collider": true'), modified.content.slice(0, 160));

const objectQuery = await callTool("scene_query", { query: objectName, limit: 10 });
check("object.query", !objectQuery.isError && objectQuery.content.includes(objectName), objectQuery.content.slice(0, 140));

// state sections + size guard
const st = await callTool("get_editor_state", { sections: ["summary", "packages"], max_bytes: 20000 });
check("tool.state", !st.isError && st.content.includes("summary") === false ? st.content.length > 0 : !st.isError, st.content.slice(0, 120));

// scene query
const sq = await callTool("scene_query", { query: "Main", limit: 10 });
check("tool.scene-query", !sq.isError, sq.content.slice(0, 120));

// logs
const lg = await callTool("get_logs", { count: 5 });
check("tool.logs", !lg.isError, lg.content.slice(0, 100));

// find_recipe: exact old-name hit + keyword search + redirect name
const fr1 = await callTool("find_recipe", { query: "vrc_physbone_audit" });
check("recipe.exact", !fr1.isError && fr1.content.includes("vrc_physbone_audit") && fr1.content.includes("csharp"), fr1.content.slice(0, 80));
const fr2 = await callTool("find_recipe", { query: "physbone", names_only: true });
check("recipe.search", !fr2.isError && fr2.content.toLowerCase().includes("physbone"), fr2.content.slice(0, 120));
const fr3 = await callTool("find_recipe", { query: "vrc_avatar_upload" });
check("recipe.redirect", !fr3.isError && fr3.content.includes("vrc_upload"), fr3.content.slice(0, 120));

// job flow through MCP: demo sleep via execute run_as_job is eval; use job_status after submit via execute? Use ndmf path absent — use direct job tools with demo executor through execute_editor_command? Simplest: session_lease status then job_status empty.
const jsb = await callTool("job_status", {});
check("tool.job-status", !jsb.isError, jsb.content.slice(0, 80));

// camera capture: batchmode -nographics expected to fail CLEANLY (structured error, not hang)
const cam = await callTool("camera_capture", { view: "scene" }, 60000);
check("tool.camera-clean-fail-or-png", cam.content.includes(".png") || cam.isError, (cam.isError ? "clean error: " : "png: ") + cam.content.slice(0, 100));
if (!cam.isError) {
  try {
    const capture = JSON.parse(cam.content);
    const captureRoot = path.resolve(process.env.LOCALAPPDATA ?? "", "UnityMCP", "captures");
    const capturePath = path.resolve(String(capture.path ?? ""));
    if (capturePath.startsWith(captureRoot + path.sep) && fs.existsSync(capturePath)) {
      fs.unlinkSync(capturePath); // this smoke's own unique output
    }
  } catch { /* a non-JSON success stays as evidence rather than guessing a path */ }
}

const cleanup = await callTool("execute_editor_command", {
  code: `var go=UnityEngine.GameObject.Find("${objectName}"); if(go!=null) UnityEngine.Object.DestroyImmediate(go); return new { cleaned=UnityEngine.GameObject.Find("${objectName}")==null };`,
});
check("object.cleanup", !cleanup.isError && cleanup.content.includes('"cleaned": true'), cleanup.content.slice(0, 100));

child.kill();
const failed = results.filter((r) => !r.ok).length;
console.log("SUMMARY " + (results.length - failed) + "/" + results.length + " passed");
process.exit(failed === 0 ? 0 : 1);
