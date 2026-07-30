# ADOB — GitHub と VPS のための自動開発エージェント

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語**

ADOB は AI モデル、GitHub、GitHub Actions、VPS 本番環境を接続する**自動開発エージェントシステム**です。

中核は、制約された複数の自動開発 Agents と、安全なオーケストレーションを担当する MCP コントローラーです。次の処理を監査可能な形で実行します。

- リポジトリ、Pull Request、CI、サニタイズ済み本番状態の確認
- ブランチ上の実装、テスト、レビュー用 Pull Request の準備
- 許可リスト方式の GitHub Actions 実行
- 長時間タスクを追跡し、「実行中」を失敗と誤判定しないこと
- VSR / GHS デプロイ、本番検証、限定診断、確認済みロールバック

MCP 対応クライアントや GPT 互換モデルを対話入口として利用できます。GitHub は常にコードの信頼できる情報源であり、VPS は本番実行環境です。

## エージェントの開発フロー

```text
要件
  ↓
計画・リポジトリ確認 Agents
  ↓
ブランチ実装 → テスト → Pull Request
  ↓
GitHub レビューと CI
  ↓
Workflow 監視：キュー/実行中 → 待機または独立作業を並行実行
  ↓
VSR または GHS で VPS にデプロイ
  ↓
本番 SHA とヘルスを検証
  ↓
必要に応じて限定診断または確認済みロールバック
```

## 長時間 GitHub Actions の扱い

- `queued`、`requested`、`pending`、`waiting`、`in_progress` は失敗ではありません。
- `status: completed` になった後だけ最終結果を判断します。
- `wait_seconds=0` では直ちに戻り、Agent は独立タスクを並行実行できます。
- 一回の呼び出しで最大 `300` 秒までポーリングできます。
- `wait_for_workflow_run` で Run ID、または実行時刻と Workflow から後で再確認できます。
- 待機時間を超えても実行中なら「継続中」と返し、失敗にはしません。

依存する次の操作や最終報告の前には必ず状態を再確認します。

## アーキテクチャ

```text
AI 自動開発 Agents / MCP クライアント
              │ 制限ツール
              ▼
          ADOB MCP コントローラー
              │ GitHub API
              ▼
       GitHub リポジトリと Actions
          │                  │
          │ VSR              │ GHS
          ▼                  ▼
VPS セルフホスト Runner  GitHub ホスト Runner
          │                  │ 固定ホスト鍵 SSH + rsync
          └─────────┬────────┘
                    ▼
             VPS 許可済みスクリプト
                    ▼
       デプロイ → 検証 → 診断 → ロールバック
```

ADOB は任意のリモート Shell をモデルに公開しません。リポジトリ本文、Issue、コメント、PR、ログ、アップロードファイルは信頼できないデータとして扱います。

## 本番実行モード

| コード | 正式名 | 実行経路 | 適した環境 |
|---|---|---|---|
| `VSR` | VPS Self-hosted Runner | VPS 上の信頼済み Runner で Actions を実行 | 本番ホスト上の直接デプロイと診断が必要なプライベート環境 |
| `GHS` | GitHub-hosted SSH | GitHub ホスト Runner から固定ホスト鍵 SSH/rsync でデプロイ | VPS に GitHub Runner を常駐させない環境 |

## サーバーへの導入

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/bootstrap-server.sh \
  -o /tmp/adob-bootstrap.sh
sudo bash /tmp/adob-bootstrap.sh
```

```text
ソースと Compose： /opt/adob-agent
保護設定：          /etc/adob-agent/adob.env
MCP：               http://127.0.0.1:8787/mcp
ヘルス：            http://127.0.0.1:8787/health
```

既定では localhost のみにバインドします。リモート利用時は認証付き HTTPS リバースプロキシを使用してください。

## GitHub リポジトリ導入

```bash
gh auth login

curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/setup-managed-repo.sh \
  -o /tmp/setup-managed-repo.sh

bash /tmp/setup-managed-repo.sh
```

このウィザードは導入ブランチ、CI、デプロイ、診断、ロールバック、ステータス Workflow、Actions Variables、GHS Secrets、`.adob-project.json`、ドラフト PR を準備できます。

## MCP Workflow ツール

読み取り・追跡：

- `list_projects`
- `get_project_status`
- `get_recent_workflow_runs`
- `get_workflow_run`
- `wait_for_workflow_run`

本番操作：

- `trigger_deploy`
- `trigger_diagnose`
- `trigger_rollback`

並行作業用の即時戻り例：

```json
{
  "project_id": "example",
  "mode": "GHS",
  "ref": "main",
  "wait_seconds": 0
}
```

最大 5 分待機する例：

```json
{
  "project_id": "example",
  "run_id": 123456789,
  "max_wait_seconds": 300,
  "poll_interval_seconds": 15
}
```

## セキュリティモデル

- 任意の `shell`、`ssh`、`exec` ツールを公開しません。
- GitHub Token は ADOB コントローラーに保存します。
- GHS 秘密鍵は GitHub Actions Secrets に保存します。
- VPS ホスト鍵を固定し、`StrictHostKeyChecking` を無効化しません。
- レビュー済みのリポジトリ相対許可スクリプトだけを実行します。
- 本番 `.env`、DB、Volume、アップロード、バックアップは VPS に保持します。
- 診断は限定・サニタイズします。
- ロールバックには文字列 `ROLLBACK` が必要です。
- 実行中 Actions を失敗として報告しません。

## ドキュメント

| トピック | English | 简体中文 | 日本語 |
|---|---|---|---|
| 利用方法 | [Open](docs/USAGE.md) | [打开](docs/zh-CN/USAGE.md) | [開く](docs/ja-JP/USAGE.md) |
| Workflow 待機と並行処理 | [Open](docs/WORKFLOW_WAITING.md) | [打开](docs/zh-CN/WORKFLOW_WAITING.md) | [開く](docs/ja-JP/WORKFLOW_WAITING.md) |
| GitHub 設定 | [Open](docs/GITHUB_SETUP.md) | [打开](docs/zh-CN/GITHUB_SETUP.md) | [開く](docs/ja-JP/GITHUB_SETUP.md) |
| デプロイモード | [Open](docs/DEPLOYMENT_MODES.md) | [打开](docs/zh-CN/DEPLOYMENT_MODES.md) | [開く](docs/ja-JP/DEPLOYMENT_MODES.md) |
| 導入 | [Open](docs/ONBOARDING.md) | [打开](docs/zh-CN/ONBOARDING.md) | [開く](docs/ja-JP/ONBOARDING.md) |
| セキュリティ | [Open](docs/SECURITY.md) | [打开](docs/zh-CN/SECURITY.md) | [開く](docs/ja-JP/SECURITY.md) |
| 本番準備 | [Open](docs/PUBLICATION.md) | [打开](docs/zh-CN/PUBLICATION.md) | [開く](docs/ja-JP/PUBLICATION.md) |

## ライセンスと帰属表示

[Apache License 2.0](LICENSE) により、変更、二次開発、再配布、商用利用が可能です。派生配布物ではライセンスと [NOTICE](NOTICE) の表示を保持してください。

```text
原作者：b8vipvip
出典：https://github.com/b8vipvip/ADOB
```
