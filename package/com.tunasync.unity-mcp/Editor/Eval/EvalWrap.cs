// Auto-wrap for eval snippets (F-14 / F-15).
// The compile contract is `class EditorCommand { static object Execute() }`,
// but the natural inputs are raw statement snippets: recipe bodies (379/384
// carry a bare method-body fragment + a `// requires-using:` header) and
// ad-hoc `Debug.Log(...)`-style one-liners. When the submitted source has no
// EditorCommand type, wrap it instead of rejecting it:
//   1. hoist the caller's own top-level `using X;` / `using A = B;` lines,
//   2. collect `// requires-using: N1, N2` hints (recipe convention),
//   3. prepend a standard editor using set (skipping duplicate aliases),
//   4. enclose the rest in EditorCommand.Execute() with a trailing
//      `return null;` so return-less snippets still compile.
// The wrapper records LineOffset so compile diagnostics can be mapped back to
// the caller's 1-based line numbers.
using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace TunaSync.UnityMCP.Editor
{
    internal sealed class EvalWrapResult
    {
        public string Source;
        public bool Wrapped;
        /// <summary>Lines prepended before the caller's first line (0 when not wrapped).</summary>
        public int LineOffset;
    }

    internal static class EvalWrap
    {
        // Matches a top-level using directive line: `using X.Y;`,
        // `using Alias = X.Y;`, `using static X.Y;`. Deliberately anchored to
        // the whole line so `using (var x = ...)` statements never match.
        private static readonly Regex UsingLine = new Regex(
            @"^\s*using\s+(?:static\s+)?[A-Za-z_][A-Za-z0-9_.]*(?:\s*=\s*[A-Za-z_][A-Za-z0-9_.]*)?\s*;\s*$",
            RegexOptions.Compiled);

        private static readonly Regex UsingAliasName = new Regex(
            @"^\s*using\s+([A-Za-z_][A-Za-z0-9_]*)\s*=",
            RegexOptions.Compiled);

        // Recipe convention: `// requires-using: System.IO, System.Reflection`
        private static readonly Regex RequiresUsing = new Regex(
            @"^\s*//\s*requires-using\s*:\s*(.+?)\s*$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        // Recipe bodies read parameters from an `args` JObject. Many recipe
        // files under-declare `params:` in their front matter, so the wrapper
        // supplies an empty stub whenever the body *uses* args but never
        // declares or binds it - the recipe then reports its own
        // "<field> required" error, which tells the caller what to pass.
        private static readonly Regex ArgsUse = new Regex(
            @"\bargs\s*[.\[]", RegexOptions.Compiled);

        // Any of these means `args` already has a meaning in the snippet:
        // a typed/var declaration, or an `args` lambda/method parameter
        // (where an outer local of the same name would be a CS0136 error).
        private static readonly Regex ArgsBound = new Regex(
            @"\b(?:var|[A-Za-z_][A-Za-z0-9_.<>\[\]]*)\s+args\s*[=;,)]|[(,]\s*args\s*[,)]|\bargs\s*=>",
            RegexOptions.Compiled);

        // Namespaces every wrapped snippet gets for free. `Debug` is aliased to
        // UnityEngine.Debug so a `requires-using: System.Diagnostics` recipe
        // does not make bare `Debug.Log` ambiguous.
        private static readonly string[] DefaultUsings =
        {
            "using System;",
            "using System.Collections;",
            "using System.Collections.Generic;",
            "using System.IO;",
            "using System.Linq;",
            "using System.Reflection;",
            "using System.Text;",
            "using Newtonsoft.Json;",
            "using Newtonsoft.Json.Linq;",
            "using UnityEditor;",
            "using UnityEditor.SceneManagement;",
            "using UnityEngine;",
            "using UnityEngine.SceneManagement;",
            "using Debug = UnityEngine.Debug;",
        };

        /// <summary>
        /// Returns the source to compile. Pass-through (Wrapped=false) when the
        /// caller already defines an EditorCommand type; otherwise the wrapped
        /// form. Never throws: on any parse hiccup the raw line stays in the
        /// body and the compiler reports it with mapped line numbers.
        /// </summary>
        public static EvalWrapResult Apply(string code)
        {
            if (code == null) code = "";
            if (code.Contains("class EditorCommand") || code.Contains("struct EditorCommand"))
            {
                return new EvalWrapResult { Source = code, Wrapped = false, LineOffset = 0 };
            }

            string[] lines = code.Replace("\r\n", "\n").Split('\n');
            List<string> header = new List<string>(DefaultUsings.Length + 8);
            List<string> hoistedUsings = new List<string>();
            HashSet<string> seenUsings = new HashSet<string>(StringComparer.Ordinal);
            HashSet<string> seenAliases = new HashSet<string>(StringComparer.Ordinal);
            List<string> body = new List<string>(lines.Length);

            for (int i = 0; i < lines.Length; i++)
            {
                string line = lines[i];
                if (UsingLine.IsMatch(line))
                {
                    string normalized = line.Trim();
                    if (seenUsings.Add(normalized))
                    {
                        hoistedUsings.Add(normalized);
                        Match alias = UsingAliasName.Match(normalized);
                        if (alias.Success) seenAliases.Add(alias.Groups[1].Value);
                    }
                    // Keep the body line count stable so diagnostics map 1:1.
                    body.Add(string.Empty);
                    continue;
                }
                Match req = RequiresUsing.Match(line);
                if (req.Success)
                {
                    string[] names = req.Groups[1].Value.Split(',');
                    for (int n = 0; n < names.Length; n++)
                    {
                        string ns = names[n].Trim().TrimEnd(';');
                        if (ns.Length == 0) continue;
                        string directive = "using " + ns + ";";
                        if (seenUsings.Add(directive)) hoistedUsings.Add(directive);
                    }
                    body.Add(line); // comment is inert; keep it for line mapping
                    continue;
                }
                body.Add(line);
            }

            for (int i = 0; i < DefaultUsings.Length; i++)
            {
                string directive = DefaultUsings[i];
                if (seenUsings.Contains(directive)) continue;
                Match alias = UsingAliasName.Match(directive);
                if (alias.Success && seenAliases.Contains(alias.Groups[1].Value)) continue;
                header.Add(directive);
            }
            header.AddRange(hoistedUsings);
            header.Add("public class EditorCommand");
            header.Add("{");
            header.Add("    public static object Execute()");
            header.Add("    {");

            string bodyText = string.Join("\n", body);
            if (ArgsUse.IsMatch(bodyText) && !ArgsBound.IsMatch(bodyText))
            {
                header.Add("        var args = Newtonsoft.Json.Linq.JObject.Parse(\"{}\"); " +
                    "// auto-stub: replace {} with the recipe's params");
            }

            StringBuilder sb = new StringBuilder(code.Length + 512);
            for (int i = 0; i < header.Count; i++) sb.Append(header[i]).Append('\n');
            for (int i = 0; i < body.Count; i++) sb.Append(body[i]).Append('\n');
            // Unreachable when the snippet already returns: CS0162 is a
            // warning, not an error, and keeps return-less snippets legal.
            sb.Append("        return null;\n");
            sb.Append("    }\n");
            sb.Append("}\n");

            return new EvalWrapResult
            {
                Source = sb.ToString(),
                Wrapped = true,
                LineOffset = header.Count,
            };
        }
    }
}
