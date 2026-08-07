// Out-of-proc Roslyn compiler using Unity's own toolchain:
//   <EditorContents>/NetCoreRuntime/dotnet.exe <EditorContents>/DotNetSdkRoslyn/csc.dll @args.rsp
// Args go through a response file (the -r: list exceeds command-line limits).
// The process is started with CreateNoWindow (hard no-console-flash rule).
// Disk cache: %LOCALAPPDATA%\UnityMCP\evalcache\<projectHash>\<key>.dll, plus a
// same-domain Assembly dictionary. This file deliberately has NO Unity usings:
// it runs on background threads and must never touch the Unity API.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace TunaSync.UnityMCP.Editor
{
    internal sealed class CscCompiler : IEvalCompiler
    {
        private const int CompileTimeoutMs = 180000;

        // Matches "path(line,col): error CS1234: message" and "error CS1234: message".
        private static readonly Regex DiagRx = new Regex(
            @"^(?:(?<file>.+?)\((?<line>\d+),(?<col>\d+)\):\s*)?(?<sev>error|warning)\s+(?<code>[A-Z]{1,3}\d{3,5})\s*:\s*(?<msg>.*)$",
            RegexOptions.Compiled);

        // Included alongside the user source so C#9+ records / init-only members
        // compile against the .NET Framework profile (IsExternalInit is absent
        // there). Skipped when the user source already provides one.
        private const string ShimSource =
            "// Auto-included by UnityMCP eval (records/init-only support on .NET Framework).\n" +
            "namespace System.Runtime.CompilerServices\n" +
            "{\n" +
            "    internal static class IsExternalInit { }\n" +
            "}\n";

        private readonly string _cscDllPath;
        private readonly string _dotnetExePath;
        private readonly string _cacheDir;
        private readonly object _gate = new object(); // serializes compiles + dict access
        private readonly Dictionary<string, Assembly> _byKey = new Dictionary<string, Assembly>(StringComparer.Ordinal);

        public CscCompiler(string cscDllPath, string dotnetExePath, string cacheDir)
        {
            _cscDllPath = cscDllPath;
            _dotnetExePath = dotnetExePath;
            _cacheDir = cacheDir;
        }

        public string Name => "csc";

        public LoadedEval GetOrCompile(string code, string key, EvalEnv env, CancellationToken ct)
        {
            lock (_gate)
            {
                Assembly hit;
                if (_byKey.TryGetValue(key, out hit))
                {
                    return new LoadedEval { Assembly = hit, Cached = true };
                }

                Directory.CreateDirectory(_cacheDir);
                string dllPath = Path.Combine(_cacheDir, key + ".dll");
                if (File.Exists(dllPath))
                {
                    Assembly cachedAsm = Assembly.Load(File.ReadAllBytes(dllPath));
                    _byKey[key] = cachedAsm;
                    return new LoadedEval { Assembly = cachedAsm, Cached = true };
                }

                ct.ThrowIfCancellationRequested();
                Assembly fresh = CompileLocked(code, key, dllPath, env, ct);
                _byKey[key] = fresh;
                return new LoadedEval { Assembly = fresh, Cached = false };
            }
        }

        public void Evict(string key)
        {
            lock (_gate)
            {
                _byKey.Remove(key);
                TryDelete(Path.Combine(_cacheDir, key + ".dll"));
            }
        }

        // ---- internals ------------------------------------------------------

        private Assembly CompileLocked(string code, string key, string dllPath, EvalEnv env, CancellationToken ct)
        {
            string srcPath = Path.Combine(_cacheDir, key + ".cs");
            File.WriteAllText(srcPath, code, new UTF8Encoding(true)); // BOM so csc reads UTF-8

            bool includeShim = code.IndexOf("IsExternalInit", StringComparison.Ordinal) < 0;
            string shimPath = Path.Combine(_cacheDir, "__eval_shims.cs");
            if (includeShim && !File.Exists(shimPath))
            {
                File.WriteAllText(shimPath, ShimSource, new UTF8Encoding(true));
            }

            string stamp = Guid.NewGuid().ToString("N").Substring(0, 8);
            string tmpDll = Path.Combine(_cacheDir, key + "." + stamp + ".tmp.dll");
            string rspPath = Path.Combine(_cacheDir, key + "." + stamp + ".rsp");

            try
            {
                File.WriteAllText(rspPath, BuildRsp(tmpDll, srcPath, includeShim ? shimPath : null, env),
                    new UTF8Encoding(false));

                int exitCode;
                List<string> lines = RunCsc(rspPath, ct, out exitCode);
                List<Diagnostic> diags = ParseDiagnostics(lines);

                int errorCount = 0;
                for (int i = 0; i < diags.Count; i++)
                {
                    if (diags[i].Severity == "error") errorCount++;
                }

                if (exitCode != 0 && errorCount == 0)
                {
                    // Toolchain-level failure with nothing parseable: surface raw output.
                    diags.Add(new Diagnostic
                    {
                        File = "",
                        Line = 0,
                        Col = 0,
                        Severity = "error",
                        CsCode = null,
                        Text = "csc exited " + exitCode + ": " + JoinHead(lines, 5),
                    });
                    errorCount++;
                }

                if (errorCount > 0 || !File.Exists(tmpDll))
                {
                    // Errors first (stable partition) so diagnostics[0] is the actionable one.
                    List<Diagnostic> ordered = new List<Diagnostic>(diags.Count);
                    for (int i = 0; i < diags.Count; i++) { if (diags[i].Severity == "error") ordered.Add(diags[i]); }
                    for (int i = 0; i < diags.Count; i++) { if (diags[i].Severity != "error") ordered.Add(diags[i]); }
                    throw new EvalCompileException(
                        "eval compile failed (" + errorCount + " error(s))", ordered.ToArray());
                }

                byte[] bytes = File.ReadAllBytes(tmpDll);
                PromoteToCache(tmpDll, dllPath);
                return Assembly.Load(bytes);
            }
            finally
            {
                TryDelete(rspPath);
                TryDelete(tmpDll); // no-op when promoted
            }
        }

        private string BuildRsp(string outDll, string srcPath, string shimPath, EvalEnv env)
        {
            StringBuilder sb = new StringBuilder(64 * 1024);
            // -noconfig must live on the command line, not in the rsp: csc emits
            // warning CS2023 (option ignored) when it appears inside a response file.
            sb.Append("-nologo\n");
            sb.Append("-nostdlib+\n");
            sb.Append("-t:library\n");
            sb.Append("-deterministic\n");
            sb.Append("-langversion:latest\n");
            sb.Append("-utf8output\n");
            if (env.Defines != null && env.Defines.Length > 0)
            {
                sb.Append("-define:").Append(string.Join(";", env.Defines)).Append('\n');
            }
            sb.Append("-out:\"").Append(outDll).Append("\"\n");
            string[] refs = env.ReferencePaths ?? new string[0];
            for (int i = 0; i < refs.Length; i++)
            {
                sb.Append("-r:\"").Append(refs[i]).Append("\"\n");
            }
            sb.Append('"').Append(srcPath).Append("\"\n");
            if (shimPath != null)
            {
                sb.Append('"').Append(shimPath).Append("\"\n");
            }
            return sb.ToString();
        }

        private List<string> RunCsc(string rspPath, CancellationToken ct, out int exitCode)
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = _dotnetExePath,
                Arguments = "\"" + _cscDllPath + "\" -noconfig @\"" + rspPath + "\"",
                UseShellExecute = false,
                CreateNoWindow = true, // hard rule: no console flash, ever
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
                WorkingDirectory = _cacheDir,
            };

            List<string> lines = new List<string>(64);
            object lineGate = new object();

            using (Process p = new Process())
            {
                p.StartInfo = psi;
                p.OutputDataReceived += (s, e) => { if (e.Data != null) { lock (lineGate) lines.Add(e.Data); } };
                p.ErrorDataReceived += (s, e) => { if (e.Data != null) { lock (lineGate) lines.Add(e.Data); } };
                p.Start();
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();

                using (ct.Register(() => TryKill(p)))
                {
                    if (!p.WaitForExit(CompileTimeoutMs)) TryKill(p);
                    p.WaitForExit(); // parameterless: also drains the async output handlers
                }
                ct.ThrowIfCancellationRequested();
                exitCode = p.ExitCode;
            }

            lock (lineGate)
            {
                return new List<string>(lines);
            }
        }

        private static void TryKill(Process p)
        {
            try
            {
                if (!p.HasExited) p.Kill();
            }
            catch { }
        }

        private static List<Diagnostic> ParseDiagnostics(List<string> lines)
        {
            List<Diagnostic> diags = new List<Diagnostic>();
            for (int i = 0; i < lines.Count; i++)
            {
                Match m = DiagRx.Match(lines[i]);
                if (!m.Success) continue;
                int line = 0;
                int col = 0;
                string file = "";
                if (m.Groups["file"].Success)
                {
                    file = SafeFileName(m.Groups["file"].Value);
                    int.TryParse(m.Groups["line"].Value, out line);
                    int.TryParse(m.Groups["col"].Value, out col);
                }
                diags.Add(new Diagnostic
                {
                    File = file,
                    Line = line,
                    Col = col,
                    Severity = m.Groups["sev"].Value,
                    CsCode = m.Groups["code"].Value,
                    Text = m.Groups["msg"].Value,
                });
            }
            return diags;
        }

        private static string SafeFileName(string path)
        {
            try { return Path.GetFileName(path.Trim()); }
            catch { return path; }
        }

        private static string JoinHead(List<string> lines, int max)
        {
            int n = lines.Count < max ? lines.Count : max;
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < n; i++)
            {
                if (i > 0) sb.Append(" | ");
                sb.Append(lines[i]);
            }
            return sb.ToString();
        }

        private static void PromoteToCache(string tmpDll, string dllPath)
        {
            try
            {
                if (File.Exists(dllPath)) File.Replace(tmpDll, dllPath, null);
                else File.Move(tmpDll, dllPath);
            }
            catch
            {
                try { File.Copy(tmpDll, dllPath, true); } catch { }
            }
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch { }
        }
    }
}
