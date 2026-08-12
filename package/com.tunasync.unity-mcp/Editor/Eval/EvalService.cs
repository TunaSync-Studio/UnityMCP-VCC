// Eval orchestration.
// Contract: submitted source defines `class EditorCommand { static object Execute() }`
// (any namespace, any visibility, method public or nonpublic static, zero args).
// Sequence: await CompileGate idle (bounded by the request deadline) ->
// compile on a background thread (csc is out-of-proc)
// -> invoke Execute() on the MAIN thread -> serialize the return value with a
// 256 KB cap. Stale cached dlls self-heal once: evict + recompile + retry.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using Debug = UnityEngine.Debug;

namespace TunaSync.UnityMCP.Editor
{
    /// <summary>
    /// Defines + assembly reference snapshot. Captured on the main thread
    /// (EditorUserBuildSettings) and handed to background compile work so the
    /// compilers never touch the Unity API.
    /// </summary>
    public sealed class EvalEnv
    {
        public string[] Defines;
        public string[] ReferencePaths;

        /// <summary>MAIN THREAD ONLY.</summary>
        public static EvalEnv CaptureOnMain()
        {
            string[] defines = EditorUserBuildSettings.activeScriptCompilationDefines ?? new string[0];

            List<string> refs = new List<string>(256);
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            Assembly[] assemblies = AppDomain.CurrentDomain.GetAssemblies();
            for (int i = 0; i < assemblies.Length; i++)
            {
                Assembly asm = assemblies[i];
                if (asm.IsDynamic) continue;
                string location;
                try { location = asm.Location; }
                catch { continue; }
                if (string.IsNullOrEmpty(location)) continue; // in-memory (previous evals etc)
                if (seen.Add(location)) refs.Add(location);
            }

            return new EvalEnv { Defines = defines, ReferencePaths = refs.ToArray() };
        }
    }

    internal sealed class LoadedEval
    {
        public Assembly Assembly;
        public bool Cached;
    }

    /// <summary>Compile failure with parsed diagnostics (maps to EVAL_COMPILE_ERROR).</summary>
    internal sealed class EvalCompileException : Exception
    {
        public readonly Diagnostic[] Diagnostics;

        public EvalCompileException(string message, Diagnostic[] diagnostics)
            : base(message)
        {
            Diagnostics = diagnostics ?? new Diagnostic[0];
        }
    }

    /// <summary>A cached dll failed type load (stale against the current domain).</summary>
    internal sealed class EvalStaleAssemblyException : Exception
    {
        public EvalStaleAssemblyException(string message, Exception inner) : base(message, inner) { }
    }

    internal interface IEvalCompiler
    {
        string Name { get; }
        /// <summary>Background thread. Must not touch the Unity API (env is pre-captured).</summary>
        LoadedEval GetOrCompile(string code, string key, EvalEnv env, CancellationToken ct);
        void Evict(string key);
    }

    public static class EvalService
    {
        public const int MaxResultChars = 256 * 1024;

        public static string EngineName { get; private set; } = "none";

        private static IEvalCompiler _compiler;

        private static readonly JsonSerializer ResultSerializer = JsonSerializer.Create(new JsonSerializerSettings
        {
            ContractResolver = Protocol.JsonSettings.ContractResolver,
            NullValueHandling = NullValueHandling.Ignore,
            ReferenceLoopHandling = ReferenceLoopHandling.Ignore,
            Formatting = Formatting.None,
            // Unity objects have throwing/self-referencing properties; skip
            // members that fail instead of failing the whole eval result.
            Error = OnSerializeError,
        });

        /// <summary>Main thread only (Bootstrap). Probes Unity's Roslyn toolchain.</summary>
        public static void Init()
        {
            if (_compiler != null) return;
            string contents = EditorApplication.applicationContentsPath.Replace('\\', '/');
            string cscDll = contents + "/DotNetSdkRoslyn/csc.dll";
            string dotnetExe = contents + "/NetCoreRuntime/dotnet.exe";
            // M-2 (2026-08-12 audit): macOS/Linux Unity ships the runtime as
            // extensionless "dotnet" - the .exe-only probe left eval
            // permanently EVAL_ENGINE_UNAVAILABLE off Windows.
            if (!File.Exists(dotnetExe)) dotnetExe = contents + "/NetCoreRuntime/dotnet";
            string cacheDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "UnityMCP", "evalcache",
                Protocol.Fnv1a32(Protocol.NormalizeProjectPath(McpEditorInfo.ProjectPath)).ToString("x8"));

            if (File.Exists(cscDll) && File.Exists(dotnetExe))
            {
                _compiler = new CscCompiler(cscDll, dotnetExe, cacheDir);
                EngineName = "csc";
            }
            else
            {
                // No in-proc fallback by design (license-clean distribution).
                // Every eval.run then fails with EVAL_ENGINE_UNAVAILABLE and a
                // pointer at the missing toolchain; everything else still works.
                _compiler = null;
                EngineName = "none";
                Debug.LogError("[UnityMCP] Roslyn toolchain not found under '" + contents +
                               "' (DotNetSdkRoslyn/csc.dll + NetCoreRuntime/dotnet.exe); " +
                               "eval.run is unavailable in this editor install.");
            }
        }

        /// <summary>
        /// MAIN THREAD entry (handler or job executor context). Returns
        /// {result, logs[], executionMs, engine, cached}. Throws
        /// McpHandlerException for EVAL_COMPILE_ERROR / EVAL_RUNTIME_ERROR.
        /// </summary>
        public static async Task<object> RunAsync(string code, bool captureLogs, CancellationToken ct,
            Action<double?, string, string> report)
        {
            if (_compiler == null)
            {
                throw new McpHandlerException(ErrorCodes.EvalEngineUnavailable,
                    EngineName == "none"
                        ? "eval unavailable: this editor install has no DotNetSdkRoslyn/NetCoreRuntime toolchain"
                        : "eval engine not initialized");
            }
            if (string.IsNullOrEmpty(code))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams, "eval: 'code' is required");
            }

            // F-14/F-15: raw statement snippets (recipe bodies, docs-style
            // top-level code) are wrapped into the EditorCommand contract
            // instead of failing with CS8805.
            EvalWrapResult wrap = EvalWrap.Apply(code);
            string source = wrap.Source;

            if (report != null) report(null, "waiting for compile pipeline", "gate");
            await CompileGate.AwaitIdleAsync(ct); // resumes on main; bounded by request deadline via ct

            EvalEnv env = EvalEnv.CaptureOnMain();
            string key = ComputeKey(source);
            bool healed = false;

            while (true)
            {
                ct.ThrowIfCancellationRequested();
                if (report != null) report(null, "compiling", "compile");

                LoadedEval loaded;
                try
                {
                    // Compile off-main; csc runs out-of-proc.
                    loaded = await Task.Run(() => _compiler.GetOrCompile(source, key, env, ct), ct);
                }
                catch (EvalCompileException cex)
                {
                    ErrorObj err = ErrorObj.Make(ErrorCodes.EvalCompileError,
                        wrap.Wrapped
                            ? cex.Message + " (snippet was auto-wrapped into 'class EditorCommand " +
                              "{ static object Execute() }'; diagnostic lines are mapped back to your input)"
                            : cex.Message);
                    err.Diagnostics = MapWrappedDiagnostics(cex.Diagnostics, wrap);
                    throw new McpHandlerException(err);
                }
                // Back on the main thread (Unity SynchronizationContext).

                MethodInfo mi;
                try
                {
                    mi = FindExecute(loaded.Assembly, loaded.Cached);
                }
                catch (EvalStaleAssemblyException)
                {
                    if (loaded.Cached && !healed)
                    {
                        healed = true;
                        _compiler.Evict(key);
                        continue; // recompile once (self-heal)
                    }
                    throw new McpHandlerException(ErrorCodes.EvalRuntimeError,
                        "eval assembly failed to load its types");
                }
                catch (Exception ex) when (IsStaleLoadFailure(ex))
                {
                    // Fresh dll failing its type scan: reference problem, not stale cache.
                    throw new McpHandlerException(ErrorCodes.EvalRuntimeError,
                        "eval assembly type scan failed: " + ex.Message);
                }

                LogCapture.LogScope scope = captureLogs ? LogCapture.BeginScope() : null;
                Stopwatch sw = Stopwatch.StartNew();
                object value;
                try
                {
                    if (report != null) report(null, "executing", "execute");
                    value = mi.Invoke(null, null); // MAIN THREAD invoke
                }
                catch (TargetInvocationException tie)
                {
                    // The user code ran and threw: genuine runtime error, never self-heal.
                    Exception inner = tie.InnerException ?? tie;
                    ErrorObj err = ErrorObj.Make(ErrorCodes.EvalRuntimeError,
                        inner.GetType().Name + ": " + inner.Message);
                    err.UnityStack = FirstLine(inner.StackTrace);
                    if (scope != null)
                    {
                        err.ConsoleErrors = scope.ErrorMessages();
                        // The logs emitted before the throw are exactly what you
                        // debug with - keep them on the error (F-6).
                        err.Detail = new { logs = scope.Drain() };
                    }
                    throw new McpHandlerException(err);
                }
                catch (Exception ex) when (loaded.Cached && !healed && IsStaleLoadFailure(ex))
                {
                    // JIT/binding failure before the body ran, from a stale cached dll.
                    healed = true;
                    _compiler.Evict(key);
                    continue;
                }
                catch (Exception ex)
                {
                    ErrorObj err = ErrorObj.Make(ErrorCodes.EvalRuntimeError,
                        ex.GetType().Name + ": " + ex.Message);
                    err.UnityStack = FirstLine(ex.StackTrace);
                    if (scope != null)
                    {
                        err.ConsoleErrors = scope.ErrorMessages();
                        err.Detail = new { logs = scope.Drain() };
                    }
                    throw new McpHandlerException(err);
                }
                finally
                {
                    sw.Stop();
                    // Dispose only unregisters the scope; Drain() below still works.
                    if (scope != null) scope.Dispose();
                }

                bool truncated;
                string json = SerializeCapped(value, MaxResultChars, out truncated);
                JToken resultToken;
                if (truncated)
                {
                    JObject t = new JObject();
                    t["truncated"] = true;
                    t["preview"] = json;
                    resultToken = t;
                }
                else
                {
                    resultToken = ParseResult(json);
                }

                return new
                {
                    result = resultToken,
                    logs = scope != null ? scope.Drain() : new LogCapture.Entry[0],
                    executionMs = sw.ElapsedMilliseconds,
                    engine = EngineName,
                    cached = loaded.Cached,
                    wrapped = wrap.Wrapped,
                };
            }
        }

        // ---- internals ------------------------------------------------------

        /// <summary>
        /// Maps compiler line numbers on auto-wrapped source back to the
        /// caller's input lines. Header-region diagnostics (line <=
        /// LineOffset: duplicate alias etc.) keep the raw line and gain a
        /// marker in the text.
        /// </summary>
        private static Diagnostic[] MapWrappedDiagnostics(Diagnostic[] diagnostics, EvalWrapResult wrap)
        {
            if (!wrap.Wrapped || diagnostics == null) return diagnostics;
            for (int i = 0; i < diagnostics.Length; i++)
            {
                Diagnostic d = diagnostics[i];
                if (d == null) continue;
                if (d.Line > wrap.LineOffset)
                {
                    d.Line -= wrap.LineOffset;
                }
                else if (d.Line > 0)
                {
                    d.Text = "[in auto-wrap header] " + d.Text;
                }
            }
            return diagnostics;
        }

        private static MethodInfo FindExecute(Assembly asm, bool cached)
        {
            Type[] types;
            try
            {
                types = asm.GetTypes();
            }
            catch (ReflectionTypeLoadException rtle)
            {
                if (cached)
                {
                    throw new EvalStaleAssemblyException("cached eval dll failed type load", rtle);
                }
                // Fresh compile with a partially loadable set: use what loaded.
                List<Type> ok = new List<Type>();
                Type[] partial = rtle.Types ?? new Type[0];
                for (int i = 0; i < partial.Length; i++)
                {
                    if (partial[i] != null) ok.Add(partial[i]);
                }
                types = ok.ToArray();
            }
            catch (Exception ex) when (cached && IsStaleLoadFailure(ex))
            {
                throw new EvalStaleAssemblyException("cached eval dll failed type scan", ex);
            }

            for (int i = 0; i < types.Length; i++)
            {
                Type t = types[i];
                if (t == null || t.Name != "EditorCommand") continue;
                MethodInfo[] methods = t.GetMethods(
                    BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly);
                for (int m = 0; m < methods.Length; m++)
                {
                    if (methods[m].Name == "Execute" && methods[m].GetParameters().Length == 0)
                    {
                        return methods[m];
                    }
                }
            }

            throw new McpHandlerException(ErrorCodes.EvalRuntimeError,
                "contract violation: 'class EditorCommand { static object Execute() }' not found in submitted code");
        }

        private static bool IsStaleLoadFailure(Exception ex)
        {
            return ex is TypeLoadException
                || ex is FileNotFoundException
                || ex is FileLoadException
                || ex is MissingMethodException
                || ex is BadImageFormatException;
        }

        private static string ComputeKey(string code)
        {
            using (SHA256 sha = SHA256.Create())
            {
                string material = code + "\n" + McpEditorInfo.UnityVersion + "\n" + McpEditorInfo.PluginVersion;
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(material));
                StringBuilder sb = new StringBuilder(16);
                for (int i = 0; i < 8; i++) sb.Append(hash[i].ToString("x2"));
                return sb.ToString(); // first 16 hex chars
            }
        }

        private static string SerializeCapped(object value, int capChars, out bool truncated)
        {
            StringBuilder sb = new StringBuilder(1024);
            try
            {
                CappedWriter writer = new CappedWriter(sb, capChars);
                JsonTextWriter jw = new JsonTextWriter(writer);
                ResultSerializer.Serialize(jw, value);
                jw.Flush();
                truncated = false;
                return sb.ToString();
            }
            catch (CapExceededException)
            {
                truncated = true;
                int take = sb.Length < capChars ? sb.Length : capChars;
                return sb.ToString(0, take);
            }
            catch (Exception ex)
            {
                truncated = false;
                JObject note = new JObject();
                note["serializationError"] = ex.Message;
                return note.ToString(Formatting.None);
            }
        }

        private static JToken ParseResult(string json)
        {
            if (string.IsNullOrEmpty(json)) return JValue.CreateNull();
            try { return JToken.Parse(json); }
            catch { return new JValue(json); }
        }

        private static string FirstLine(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            int nl = text.IndexOf('\n');
            string line = nl >= 0 ? text.Substring(0, nl) : text;
            line = line.Trim();
            return line.Length > 0 ? line : null;
        }

        private static void OnSerializeError(object sender, Newtonsoft.Json.Serialization.ErrorEventArgs e)
        {
            e.ErrorContext.Handled = true;
        }

        private sealed class CapExceededException : Exception { }

        /// <summary>StringWriter that throws once the backing builder exceeds the cap.</summary>
        private sealed class CappedWriter : StringWriter
        {
            private readonly int _cap;

            public CappedWriter(StringBuilder sb, int cap) : base(sb)
            {
                _cap = cap;
            }

            private void Check()
            {
                if (GetStringBuilder().Length > _cap) throw new CapExceededException();
            }

            public override void Write(char value)
            {
                base.Write(value);
                Check();
            }

            public override void Write(string value)
            {
                base.Write(value);
                Check();
            }

            public override void Write(char[] buffer, int index, int count)
            {
                base.Write(buffer, index, count);
                Check();
            }
        }
    }
}
