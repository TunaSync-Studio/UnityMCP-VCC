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
            ["header.subtitle"] = new[]
            {
                "Local operator console · loopback only · no cloud relay",
                "ローカル操作コンソール · loopback限定 · クラウド中継なし",
            },
            ["section.runtime"] = new[] { "Runtime", "動作状態" },
            ["section.clients"] = new[] { "Connected MCP sessions", "接続中のMCPセッション" },
            ["section.jobs"] = new[] { "Recent jobs", "最近のジョブ" },
            ["section.compile"] = new[] { "Compile & diagnostics", "コンパイル・診断" },
            ["section.controls"] = new[] { "Operator controls", "オペレーター操作" },
            ["section.setup"] = new[] { "Client setup", "クライアント設定" },
            ["section.upload"] = new[] { "VRC upload safety gate", "VRCアップロード安全ゲート" },
            ["label.project"] = new[] { "Project", "プロジェクト" },
            ["label.port"] = new[] { "Port", "ポート" },
            ["label.clients"] = new[] { "Clients", "クライアント" },
            ["label.engine"] = new[] { "Eval engine", "Evalエンジン" },
            ["label.transport"] = new[] { "Transport", "通信" },
            ["label.editor"] = new[] { "Editor", "エディタ" },
            ["label.lease"] = new[] { "Write lease", "書き込みリース" },
            ["label.leaseFree"] = new[] { "(free)", "(空き)" },
            ["label.lastCommand"] = new[] { "Last command", "最終コマンド" },
            ["label.compileState"] = new[] { "Pipeline", "パイプライン" },
            ["label.diagnostics"] = new[] { "Last result", "前回結果" },
            ["label.none"] = new[] { "(none yet)", "(まだ無し)" },
            ["clients.none"] = new[]
            {
                "No MCP client is connected. Unity is ready; start Codex, Claude or Cursor.",
                "MCPクライアント未接続です。Unityは待機中 — Codex / Claude / Cursorを起動してください。",
            },
            ["jobs.none"] = new[] { "No jobs in this editor session.", "このEditorセッションにはジョブがありません。" },
            ["btn.enableProject"] = new[] { "Enable MCP for this project", "このプロジェクトでMCPを有効化" },
            ["btn.enableMarker"] = new[] { "Enable (remove marker)", "有効化 (マーカー削除)" },
            ["btn.disableMarker"] = new[] { "Disable (add marker)", "無効化 (マーカー設置)" },
            ["btn.enableNow"] = new[] { "Enable now", "今すぐ有効化" },
            ["btn.disableNow"] = new[] { "Stop & disable now", "今すぐ停止・無効化" },
            ["btn.cancel"] = new[] { "Cancel", "中止" },
            ["btn.keep"] = new[] { "Keep running", "続行" },
            ["btn.copyHealth"] = new[] { "Copy health URL", "ヘルスURLをコピー" },
            ["btn.copyMcpConfig"] = new[] { "Copy MCP config", "MCP設定をコピー" },
            ["btn.copyDiagnostics"] = new[] { "Copy sanitized diagnostics JSON", "診断JSONをコピー (絶対パス除外)" },
            ["btn.openRegistry"] = new[] { "Open discovery registry", "discovery registryを開く" },
            ["btn.openDocs"] = new[] { "Open documentation", "ドキュメントを開く" },
            ["btn.copySetup"] = new[] { "Copy setup", "設定をコピー" },
            ["btn.armUpload"] = new[] { "Arm one upload (30 min)", "アップロード1回を許可 (30分)" },
            ["btn.disarmUpload"] = new[] { "Disarm", "許可を解除" },
            ["dialog.cancelJob"] = new[]
            {
                "Signal cancellation for this job? Some Unity/SDK phases can only stop at their next safe checkpoint.",
                "このジョブへ中止を通知しますか？Unity/SDK処理は次の安全な区切りまで停止できない場合があります。",
            },
            ["dialog.disable"] = new[]
            {
                "Stop the listener now, disconnect all clients, release the write lease and cancel active jobs? The disabled marker remains until you enable it here again.",
                "listenerを即時停止し、全クライアント切断・write lease解放・実行中jobの中止通知を行いますか？ここで再有効化するまでdisabled markerが残ります。",
            },
            ["dialog.armUpload"] = new[]
            {
                "HUMAN OPERATOR ACTION ONLY. Arm exactly one VRChat upload for up to 30 minutes? The server consumes the arm file when an upload begins. Review the active avatar/world and SDK state first.",
                "人間オペレーター専用操作です。VRChatアップロード1回を最長30分だけ許可しますか？upload開始時にserverが許可ファイルを消費します。対象avatar/worldとSDK状態を先に確認してください。",
            },
            ["upload.disarmed"] = new[] { "DISARMED", "未許可" },
            ["upload.expired"] = new[] { "EXPIRED (not usable)", "期限切れ (使用不可)" },
            ["upload.armed"] = new[] { "ARMED for one upload", "アップロード1回を許可中" },
            ["upload.explain"] = new[]
            {
                "This UI does not expose an MCP arm method. Only a deliberate local click can create the one-shot arm file.",
                "MCPから許可するmethodはありません。ローカルUIで人間が明示クリックした時だけone-shot許可ファイルを作ります。",
            },
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
            ["toast.diagnosticsCopied"] = new[] { "Sanitized diagnostics copied.", "絶対パスを除いた診断をコピーしました。" },
            ["toast.healthCopied"] = new[] { "Health URL copied.", "ヘルスURLをコピーしました。" },
            ["toast.enabled"] = new[] { "Listener and registry started immediately.", "listenerとregistryを即時起動しました。" },
            ["toast.disabled"] = new[] { "Listener and registry stopped immediately.", "listenerとregistryを即時停止しました。" },
            ["toast.uploadArmed"] = new[] { "One upload armed for 30 minutes.", "アップロード1回を30分間許可しました。" },
            ["toast.uploadDisarmed"] = new[] { "Upload gate disarmed.", "アップロード許可を解除しました。" },
        };

        public static string Tr(string key)
        {
            string[] pair;
            if (!Table.TryGetValue(key, out pair)) return key;
            return pair[IsJapanese ? 1 : 0];
        }
    }
}
