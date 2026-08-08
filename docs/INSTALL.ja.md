# インストール — TunaSync Unity MCP

[English version](INSTALL.md)

2 つの部品で動きます: Unity **パッケージ** (プロジェクト側) と小さな
**MCP サーバー** (AI クライアント側)。それぞれ 1 コマンド / 1 リポジトリ登録
+ エディタでの初回同意クリック 1 回です。

> **要件 / 状態**: Windows・Unity **2022.3** (2022.3.22f1 で検証)・Node.js 20+。
> このツールは AI にエディタ内で任意の C# を実行させます — 必ずバージョン管理
> 下のプロジェクトで使ってください。実 `vrc_upload` の公開は二重ゲート
> (`confirm:true` **+** 人間が作る一回限りの arm ファイル) です。画面共有中は
> `UNITY_MCP_STREAM_MODE=1` で破壊系・公開系をロックできます
> (`docs/STREAMING.md`)。README の「インストール前に」も読んでください。

## 1. Unity パッケージ

### VCC / ALCOM (VRChat クリエイター — 推奨)

リポジトリを 1 回追加:

```
https://tunasync-studio.github.io/UnityMCP-VCC/vpm/index.json
```

VCC: Settings > Packages > Add Repository → URL を貼り付け。
その後、任意のプロジェクトの Manage Project で **TunaSync Unity MCP** を
インストール。

### 素の Unity (UPM git URL — VCC 不要)

Package Manager → `+` → *Add package from git URL*:

```
https://github.com/TunaSync-Studio/UnityMCP-VCC.git?path=/package/com.tunasync.unity-mcp
```

### 初回起動

パッケージが最初に読み込まれると、1 回だけダイアログが出ます:
「このプロジェクトでローカル MCP ブリッジ (127.0.0.1 のみ) を有効にしますか?」
→ **Enable** をクリック。そのプロジェクトではこれが唯一のクリックです
(同意はユーザー × プロジェクト単位)。以後はエディタと一緒に静かに起動します。

- 後から変更: `Tools > TunaSync Unity MCP > Creator Console` (即時有効/停止ボタン・
  日本語表示切替もここ) またはプロジェクト直下に `UnityMCP.disabled` を置く。
- CI / ヘッドレス: 環境変数 `UNITY_MCP_AUTOCONSENT=1`。

## 2. MCP サーバー (AI クライアント側)

Node.js 20+ が必要です。

**Claude Code**

```bash
claude mcp add unity-mcp -- npx -y tunasync-unity-mcp
```

**OpenAI Codex CLI**

```bash
codex mcp add unity-mcp -- npx -y tunasync-unity-mcp
```

ChatGPT デスクトップアプリ・Codex CLI・Codex IDE 拡張は同じ MCP 設定を
共有します。デスクトップ / IDE では **Settings > MCP servers > Add server**
から **STDIO** を選び、command=`npx`、arguments=`-y`,
`tunasync-unity-mcp` として保存後に再起動してください。NDMF / アップロードの
長い待機を行う場合は、`~/.codex/config.toml` に生成された
`[mcp_servers.unity-mcp]` テーブルへ `tool_timeout_sec = 1300` を追加できます。
待機がタイムアウトしてもジョブは継続し、`job_status` で確認できます。

**Claude Desktop** — `claude_desktop_config.json`:

```json
{ "mcpServers": { "unity-mcp": {
    "command": "npx", "args": ["-y", "tunasync-unity-mcp"] } } }
```

**Cursor / その他の MCP クライアント**: 同じコマンド
(`npx -y tunasync-unity-mcp`、stdio トランスポート)。

Creator Console のクライアント別設定ボタンで Codex / Claude / Cursor 用の設定を
クリップボードに取れます。

MCPセッションを起動せずに、読み取り専用のローカル事前診断もできます:

```bash
npx -y tunasync-unity-mcp doctor
```

自動化用JSONは`--json`、ローカルのプロジェクト名/pathまで確認する場合だけ
`--verbose`を付けます。既定出力はそれらを省き、registry tokenは常に出しません。

## 3. 使う

1. Unity プロジェクトを開く (ブリッジは自動起動 — 気になるなら
   `Tools > TunaSync Unity MCP > Creator Console`)。
2. AI に話しかけるだけ。`unity_health_check` で接続確認。以降:
   `execute_editor_command` (エディタ内で C# 実行)、`get_editor_state`、
   `scene_query`、`camera_capture`、`find_recipe` (400+ の既製エディタ操作)、
   VRChat プロジェクトなら `vrc_avatar_audit`、`ndmf_bake_run`、
   `vrc_upload {dry_run:true}`。
3. **エディタを起動していなくても** `vcc_project` (プロジェクト一覧・
   パッケージ確認) と `vpm_manage` (vrc-get 経由のパッケージ追加/更新) は
   動きます。

エディタの起動順は問いません — サーバーが起動中のエディタを自動発見します
(複数プロジェクト同時も可。`project` パラメータで選択)。

## サーバー更新時

MCP クライアントはツール一覧を**クライアントセッションの接続時に 1 回だけ**
取得します。サーバーを更新したら (npx の新バージョン / 新ビルド)、MCP
クライアントのセッションを再起動または再接続してください (Claude Code は
`/mcp` reconnect) — しないとクライアントは古いツール説明を使い続け、新しい
パラメータが「Input validation error」で弾かれることがあります。
`unity_health_check` は `server:{version, build, pid, startedAt}` を返すので、
どのビルドが応答したかは常に確認できます。

## セキュリティモデル

- ブリッジは **127.0.0.1 のみ**でリッスンします。ブリッジ自体はネットワークに
  何も公開せず、テレメトリも送りません (実 `vrc_upload` の公開は VRC SDK 経由で
  VRChat と通信し、`npx` は npm からサーバーパッケージを取得します — それらは
  呼び出し側自身のネットワーク操作です)。
- フレーム接続には、あなたの OS ユーザーしか読めないファイルに置かれた
  セッショントークンの提示が必要です — 共有マシンの他 OS ユーザーのプロセスは
  接続できません (あなた自身のユーザーや管理者として動くプロセスはその
  ファイルを読めます。トークン不要の HTTP ヘルスピークは意図的に読み取り専用の
  状態 JSON をローカルの任意プロセスへ返します)。
- AI がエディタで C# を実行できるのは、**あなたがそのプロジェクトでブリッジを
  有効化し、自分で MCP クライアントを設定した後**だけです。

## 実 VRChat アップロードの arm (リポジトリのチェックアウト不要)

実 `vrc_upload` には `confirm:true` **に加えて**、人間 (あなた) が作る
一回限りの arm ファイルが必要です。推奨は **Creator Console > VRCアップロード
安全ゲート > アップロード1回を許可** です。ローカル確認が必須で、MCPからarmする
methodはありません。リポジトリがあるなら代わりに
`tools/arm-vrc-upload.bat` を実行。VCC + npx で導入していてチェックアウトが
無い場合は、マーカーファイルを自分で作ってください:

```powershell
New-Item -Force -ItemType File "$env:LOCALAPPDATA\UnityMCP\arm\vrc-upload.arm"
```

30 分で失効し、次の実アップロード試行で消費されます。**AI に作らせないで
ください** — 人間がボタンに触れたこと自体が、このゲートの意味です。
