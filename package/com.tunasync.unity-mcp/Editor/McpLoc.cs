// Tiny editor-UI localization (v2.4.0): English / Japanese for the status
// window and menus. Scope is deliberately UI-only - protocol errors, tool
// payloads and logs stay English (they are machine/AI-facing; csCode is the
// stable key for compiler output, per the F-9 ruling).
//
// Language preference: EditorPrefs (per user, all projects). "auto" follows
// the editor's OS language.
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace TunaSync.UnityMCP.Editor
{
    public enum McpLang
    {
        Auto = 0,
        English = 1,
        Japanese = 2,
    }

    public static class McpLoc
    {
        private const string PrefKey = "TunaSync.UnityMCP.Lang.v1";

        public static McpLang Preference
        {
            get => (McpLang)EditorPrefs.GetInt(PrefKey, (int)McpLang.Auto);
            set => EditorPrefs.SetInt(PrefKey, (int)value);
        }

        public static bool IsJapanese
        {
            get
            {
                McpLang p = Preference;
                if (p == McpLang.Japanese) return true;
                if (p == McpLang.English) return false;
                return Application.systemLanguage == SystemLanguage.Japanese;
            }
        }

        /// <summary>Cycle Auto -> EN -> JA -> Auto (single status-window button).</summary>
        public static void CyclePreference()
        {
            Preference = (McpLang)(((int)Preference + 1) % 3);
        }

        public static string PreferenceLabel
        {
            get
            {
                switch (Preference)
                {
                    case McpLang.English: return "EN";
                    case McpLang.Japanese: return "日本語";
                    default: return "Auto";
                }
            }
        }

        private static readonly Dictionary<string, string[]> Table = new Dictionary<string, string[]>
        {
            // key                     [ english, japanese ]
            ["status.connected"] = new[] { "Connected", "接続中" },
            ["status.listening"] = new[] { "Listening (no client yet)", "待機中 (クライアント未接続)" },
            ["status.notRunning"] = new[] { "Not running", "停止中" },
            ["status.disabled"] = new[] { "Disabled (UnityMCP.disabled)", "無効化中 (UnityMCP.disabled)" },
            ["status.consent"] = new[] { "Not enabled (consent)", "未有効化 (同意待ち)" },
            ["label.project"] = new[] { "Project", "プロジェクト" },
            ["label.port"] = new[] { "Port", "ポート" },
            ["label.clients"] = new[] { "Clients", "クライアント" },
            ["label.engine"] = new[] { "Eval engine", "Evalエンジン" },
            ["label.lease"] = new[] { "Write lease", "書き込みリース" },
            ["label.leaseFree"] = new[] { "(free)", "(空き)" },
            ["label.lastCommand"] = new[] { "Last command", "最終コマンド" },
            ["label.none"] = new[] { "(none yet)", "(まだ無し)" },
            ["btn.enableProject"] = new[] { "Enable MCP for this project", "このプロジェクトでMCPを有効化" },
            ["btn.enableMarker"] = new[] { "Enable (remove marker)", "有効化 (マーカー削除)" },
            ["btn.disableMarker"] = new[] { "Disable (add marker)", "無効化 (マーカー設置)" },
            ["btn.copyHealth"] = new[] { "Copy health URL", "ヘルスURLをコピー" },
            ["btn.copyMcpConfig"] = new[] { "Copy MCP config", "MCP設定をコピー" },
            ["hint.consent"] = new[]
            {
                "Enable once; afterwards the listener starts with the editor (per user x per project).",
                "一度有効化すれば、以後はエディタ起動と同時にリスナーが立ちます (ユーザー×プロジェクト単位)。",
            },
            ["hint.zeroTouch"] = new[]
            {
                "Zero-touch: this panel is informational only - the listener starts with the editor.",
                "操作は不要です — このパネルは表示専用で、リスナーはエディタと一緒に起動します。",
            },
            ["toast.mcpConfigCopied"] = new[]
            {
                "MCP client config copied to clipboard.",
                "MCPクライアント設定をクリップボードにコピーしました。",
            },
        };

        public static string Tr(string key)
        {
            string[] pair;
            if (!Table.TryGetValue(key, out pair)) return key;
            return pair[IsJapanese ? 1 : 0];
        }
    }
}
