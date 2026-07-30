# AutoDevOps Bridge（ADOB）

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語**

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

AutoDevOps Bridge は、監査可能かつ許可リストで制御された GitHub ワークフローを通じて、セルフホスト型ソフトウェアプロジェクトを運用するための再利用可能な ChatGPT/Codex プラグインです。

## 標準デプロイモード

ADOB には 1 つの開発ライフサイクルと、2 つの本番実行モードがあります。プロジェクトを設定するとき、または ChatGPT にデプロイを依頼するときは、必ず正確な大文字のモードコードを使用してください。

| コード | 正式名称 | 実行経路 | 主な要件 |
|---|---|---|---|
| `VSR` | VPS Self-hosted Runner（VPS セルフホスト Runner） | GitHub Actions → VPS 上の常駐 Runner → プロジェクトスクリプト | 信頼できるセルフホスト Runner が VPS に継続してインストールされ、オンラインであること |
| `GHS` | GitHub-hosted SSH（GitHub ホスト SSH） | GitHub ホスト Runner → ホスト鍵を固定した SSH/rsync → VPS のプロジェクトスクリプト | 専用 SSH 鍵と正確な VPS ホスト鍵を GitHub Actions secrets に保存すること |

```text
ChatGPT / Codex
       │
       ▼
AutoDevOps MCP サーバー
       │ GitHub API
       ▼
管理対象リポジトリのワークフロー
       │
       ├─ VSR：VPS セルフホスト Runner
       │
       └─ GHS：GitHub ホスト Runner → ホスト鍵固定 SSH/rsync → VPS
```

`VSR` と `GHS` は本番実行方式を表します。MCP 接続トランスポートである `stdio` と `http` とは別の概念です。

詳細な比較と宣言ルールについては、[`docs/ja-JP/DEPLOYMENT_MODES.md`](docs/ja-JP/DEPLOYMENT_MODES.md) を参照してください。

## モードの宣言方法

プロジェクトレジストリ：

```json
{
  "id": "sumeme",
  "repo": "b8vipvip/sumeme",
  "deploymentMode": "GHS"
}
```

自然言語による依頼：

```text
sumeme プロジェクトを GHS モードでデプロイしてください。
```

MCP ツール呼び出し：

```json
{
  "tool": "trigger_deploy",
  "arguments": {
    "project_id": "sumeme",
    "mode": "GHS",
    "ref": "main"
  }
}
```

`mode` 引数は省略可能で、省略時はサーバー側のプロジェクトレジストリ設定が使用されます。指定した場合は設定済みのプロジェクトモードと一致する必要があり、不一致の場合、ADOB は別の実行経路へ黙って切り替えずに要求を拒否します。

読み取り専用ツール `list_deployment_modes` は標準定義を返し、プロジェクトおよびステータス関連ツールの出力にも設定済みモードが含まれます。

## 現在のバージョンで対応している機能

- 1 つ以上の GitHub リポジトリをプロジェクトとして登録する。
- 各プロジェクトの本番モードを `VSR` または `GHS` として宣言する。
- `ops-status` ブランチからサニタイズ済みの本番スナップショットを読み取る。
- 最近の GitHub Actions 実行を確認する。
- 許可リストに登録されたデプロイワークフローを起動する。
- 許可リストに登録された診断ワークフローを起動する。
- 明示的な `ROLLBACK` 確認値がある場合のみロールバックを起動する。
- VPS セルフホスト Runner、または ADOB の再利用可能な GitHub ホスト SSH デプロイワークフローを使用する。
- ChatGPT に再利用可能なスキルを提供し、安全な順序「確認 → ブランチ作成 → 変更 → テスト → レビュー → マージ → デプロイ → 検証」を強制する。

## リポジトリの内容

```text
.codex-plugin/plugin.json                 プラグインパッケージのメタデータ
.mcp.json                                 ローカル Codex MCP 起動設定
.github/workflows/deploy-via-ssh.yml      再利用可能な GHS デプロイワークフロー
skills/autodevops/SKILL.md                運用ポリシーとモード用語
skills/autodevops/SKILL.zh-CN.md          AutoDevOps スキルの中国語版
skills/autodevops/SKILL.ja-JP.md          AutoDevOps スキルの日本語版
mcp-server/                               Streamable HTTP/stdio MCP サービス
installer/install-runner.sh               VSR セルフホスト Runner インストーラー
installer/install-ssh-deploy.sh           GHS デプロイユーザーインストーラー
examples/projects.json                    プロジェクトレジストリの例
docs/DEPLOYMENT_MODES.md                  標準 VSR/GHS 契約（英語）
docs/SSH_TRANSPORT.md                     GHS セットアップと呼び出し側契約（英語）
docs/zh-CN/                               中国語ドキュメント
docs/ja-JP/                               日本語ドキュメント
```

## ローカル単一ユーザー向けセットアップ

初期実装はプライベートテストに適しています。GitHub の fine-grained token は MCP サーバー上にのみ保存されます。

```bash
cd mcp-server
cp .env.example .env
npm install
npm run build
npm start
```

Streamable HTTP エンドポイントは `/mcp`、ヘルスエンドポイントは `/health` です。

## 管理対象リポジトリに必要な規約

各管理対象リポジトリには、許可リスト方式のワークフローファイルを配置し、サニタイズ済みステータススナップショットを公開する必要があります。

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml

ops-status ブランチ：
  status/status.json
  status/STATUS.md
```

ワークフロー名はプロジェクトごとに設定できます。

`GHS` の場合は、明示的な宣言付きで再利用可能な SSH ワークフローを呼び出します。

```yaml
uses: b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml@<PINNED_ADOB_SHA>
with:
  adob_mode: GHS
  project_name: example
  ssh_host: ${{ vars.VPS_HOST }}
  ssh_user: ${{ vars.VPS_USER }}
  deploy_path: /opt/example
```

`VSR` の場合は、セルフホストジョブ内でモードを明示します。

```yaml
deploy-production-vsr:
  runs-on: [self-hosted, linux, x64, production]
  env:
    ADOB_MODE: VSR
  steps:
    - uses: actions/checkout@v4
    - run: bash scripts/deploy-production.sh "${GITHUB_SHA}"
```

## セキュリティ原則

- モデルに任意の shell ツールを公開しない。
- SSH 秘密鍵を ChatGPT、Codex、MCP サービス、リポジトリソース、issue、ログに保存しない。
- GHS の secrets は管理対象プロジェクトの GitHub Actions secret ストアにのみ保存する。
- GHS では VPS のホスト識別情報を固定し、`StrictHostKeyChecking` を無効にしない。
- テスト済みコミットまたは信頼済みブランチのみをデプロイする。
- リポジトリ相対パスで指定された、許可リスト内のプロジェクトデプロイスクリプトのみを実行する。
- `.env` や無制限のログではなく、サニタイズ済みステータスを読み取る。
- 破壊的操作には明示的な確認を必要とする。
- すべての操作を GitHub Actions 履歴に残し、監査可能にする。

[`docs/ja-JP/ONBOARDING.md`](docs/ja-JP/ONBOARDING.md)、[`docs/ja-JP/DEPLOYMENT_MODES.md`](docs/ja-JP/DEPLOYMENT_MODES.md)、[`docs/ja-JP/SECURITY.md`](docs/ja-JP/SECURITY.md)、[`docs/ja-JP/SSH_TRANSPORT.md`](docs/ja-JP/SSH_TRANSPORT.md)、[`docs/ja-JP/PUBLICATION.md`](docs/ja-JP/PUBLICATION.md) も参照してください。

## ステータス

このリポジトリにはプライベートテスト用 MVP が含まれています。ChatGPT の公開ディレクトリに掲載するには、OAuth 2.1、テナント分離、検証済み HTTPS サービス、各種ポリシー、審査用アセット、開発者による提出が引き続き必要です。

## ライセンス

MIT。上流プロジェクトおよびサービスのライセンスはそれぞれ独立しています。