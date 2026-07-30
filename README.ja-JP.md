# ADOB — GPT–GitHub–VPS 自動開発エージェント

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語**

ADOB は **GPT、GitHub、VPS** を接続し、要件整理、コード変更、テスト、レビュー、デプロイ、検証、診断、ロールバックを監査可能な一つのループにまとめる自動開発エージェントです。

- **GPT / ChatGPT / Codex**：自然言語による対話、分析、計画、操作の入口です。
- **GitHub**：ブランチ、Pull Request、CI、レビュー、Workflow 実行、監査履歴を管理する信頼できる情報源兼コントロールプレーンです。
- **VPS**：デプロイ、診断、ヘルスチェック、ロールバックを実行する本番プレーンです。
- **ADOB MCP サービス**：制限されたツールだけを AI エージェントに公開し、任意の Shell や SSH 秘密鍵を GPT に渡しません。

想定する利用フローは次のとおりです。

```text
GPT に開発要件を伝える
        ↓
リポジトリ、CI、本番状態を確認
        ↓
ブランチ作成 → コード変更 → テスト → Pull Request 作成
        ↓
GitHub でレビューしてマージ
        ↓
VSR または GHS で VPS にデプロイ
        ↓
リリース SHA、サービス状態、ステータススナップショットを検証
        ↓
必要に応じて許可済み Workflow で診断またはロールバック
```

## ADOB が自動化する範囲

- 一つ以上の GitHub リポジトリを管理対象プロジェクトとして登録します。
- GPT からサニタイズ済み本番状態と最近の GitHub Actions 実行を確認できます。
- ブランチ、実装、テスト、レビュー、マージの順序で開発を進めます。
- 許可リストに登録されたデプロイ、診断、ロールバック Workflow のみを実行します。
- VPS セルフホスト Runner、またはホスト鍵を固定した SSH/rsync でデプロイします。
- 本番変更後に実際のデプロイ Commit を検証します。
- 本番操作を GitHub Actions 履歴に残します。
- 破壊的なロールバックには明示確認を要求します。

ADOB は汎用リモート Shell ではありません。リポジトリ本文、Issue、ログ、Pull Request、アップロードファイルは命令ではなく、信頼できないデータとして扱います。

## アーキテクチャ

```text
GPT / ChatGPT / Codex / MCP クライアント
                  │
                  │ 制限された MCP ツール
                  ▼
          ADOB コントローラー
                  │
                  │ GitHub API
                  ▼
       GitHub リポジトリと Actions
          │                   │
          │ VSR               │ GHS
          ▼                   ▼
VPS セルフホスト Runner   GitHub ホスト Runner
          │                   │ 固定ホスト鍵 SSH + rsync
          └──────────┬────────┘
                     ▼
          VPS の許可済みプロジェクトスクリプト
                     │
                     ▼
       デプロイ → 検証 → 診断 → ロールバック
```

## 本番実行モード

ADOB の開発ライフサイクルは一つですが、本番実行モードは二つあります。設定では正確な大文字コードを使用してください。

| コード | 正式名 | 実行経路 | 適した環境 |
|---|---|---|---|
| `VSR` | VPS Self-hosted Runner | VPS に常駐する Runner 上で GitHub Actions を直接実行 | 信頼できるプライベート VPS でローカルデプロイと診断が必要な場合 |
| `GHS` | GitHub-hosted SSH | GitHub ホスト Runner がテスト済みリビジョンを取得し、固定ホスト鍵 SSH/rsync でデプロイ | VPS に GitHub Runner を常駐させたくない場合 |

`VSR` と `GHS` は本番実行方式を表し、MCP 接続方式の `stdio`、`http` とは独立しています。

詳細は[デプロイモード](docs/ja-JP/DEPLOYMENT_MODES.md)を参照してください。

## サーバーへのワンコマンド導入

対話式 Bootstrap は、必要に応じて Docker をインストールし、ADOB コントローラーをデプロイし、保護された設定ファイルと MCP Bearer Secret を作成します。同じサーバーを GHS デプロイ先として設定することもできます。

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/bootstrap-server.sh \
  -o /tmp/adob-bootstrap.sh
sudo bash /tmp/adob-bootstrap.sh
```

インストーラーは次の情報を確認します。

- GitHub Fine-grained Token
- 管理対象の `owner/repo` リポジトリ
- プロジェクト ID、名前、本番ブランチ、`VSR`/`GHS` モード
- 任意で GHS デプロイ公開鍵とデプロイディレクトリ

既定の配置先：

```text
ソースと Compose： /opt/adob-agent
保護設定：          /etc/adob-agent/adob.env
MCP エンドポイント： http://127.0.0.1:8787/mcp
ヘルスチェック：    http://127.0.0.1:8787/health
```

既定では `127.0.0.1` のみにバインドします。リモート利用時は HTTPS リバースプロキシの背後に置き、現在のプライベートテスト用エンドポイントを直接インターネットへ公開しないでください。

非対話導入の変数と完全な手順は[利用方法、ワークフロー、例](docs/ja-JP/USAGE.md)を参照してください。

## GitHub プロジェクトのワンコマンド接続

コントローラー起動後、対象プロジェクトのクリーンなローカル Git リポジトリ内で 2 つ目のウィザードを実行します。

```bash
gh auth login

curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/setup-managed-repo.sh \
  -o /tmp/setup-managed-repo.sh

bash /tmp/setup-managed-repo.sh
```

Docker Compose プロファイルでは、ウィザードが次を自動化します。

- 対象 GitHub リポジトリと書き込み権限の確認
- 専用オンボーディングブランチの作成
- ADOB の完全な Commit SHA の解決と固定
- CI、デプロイ、診断、ロールバック、状態公開 Workflow の生成
- 制限付きプロジェクトアダプタースクリプトの生成
- GitHub Actions Variables の設定と、ファイルからの GHS Secrets 登録
- ADOB サーバーレジストリ用 `.adob-project.json` の生成
- Commit、Push、Draft Pull Request の作成

`FORCE=true` を明示しない限り、既存の同名 Workflow やスクリプトを上書きしません。マージ前に Draft PR で永続データ除外とヘルスチェックを確認してください。

Token 権限、Variables/Secrets の一覧、Actions 設定、ブランチ保護、初回検証順序、トラブルシューティングは [GitHub 詳細設定](docs/ja-JP/GITHUB_SETUP.md)を参照してください。

## ローカル開発実行

```bash
cd mcp-server
cp .env.example .env
npm install
npm run check
npm run build
npm start
```

Streamable HTTP エンドポイントは `/mcp`、ヘルスチェックは `/health` です。

## 管理対象プロジェクトの契約

各管理対象リポジトリには、レビュー済み Workflow とサニタイズ済みステータス発行処理が必要です。

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

Workflow ファイル名はプロジェクトレジストリで変更できます。

登録例：

```json
{
  "id": "example",
  "name": "Example App",
  "repo": "owner/example",
  "productionBranch": "main",
  "statusBranch": "ops-status",
  "statusPath": "status/status.json",
  "deploymentMode": "GHS",
  "workflows": {
    "deploy": "deploy-production.yml",
    "diagnose": "diagnose-production.yml",
    "rollback": "rollback-production.yml"
  }
}
```

## GPT への依頼例

```text
example プロジェクトのリポジトリ状態、未マージ PR、最近の CI、本番 SHA、サービス状態、設定済みデプロイモードを確認してください。まだ本番は変更しないでください。
```

```text
ログインタイムアウトを新しいブランチで修正してください。テストを追加または更新し、CI を実行し、Diff をレビューして Pull Request を作成してください。main へ直接 Push しないでください。
```

```text
テスト済みの example の main を GHS で VPS にデプロイしてください。完了後、本番 SHA が main と一致することとヘルス状態を確認してください。
```

```text
example の直近デプロイ失敗を診断してください。サニタイズされ範囲を制限した情報だけを収集し、失敗した手順を説明してから修正案を提示してください。
```

```text
example を Commit <SHA> に戻す準備をしてください。アプリケーションとデータベースのリスクを先に説明し、私が文字列 ROLLBACK を入力した後だけ実行してください。
```

さらに詳しいシナリオは[利用方法、ワークフロー、例](docs/ja-JP/USAGE.md)にあります。

## セキュリティモデル

- 任意の `shell`、`ssh`、`exec` ツールをモデルへ公開しません。
- GitHub Token は ADOB コントローラーだけに保存します。
- GHS 秘密鍵は管理対象リポジトリの GitHub Actions Secrets だけに保存します。
- VPS ホスト鍵を固定し、`StrictHostKeyChecking` を無効化しません。
- リポジトリ相対パスの許可済みデプロイスクリプトだけを実行します。
- 本番 `.env`、データベース、オブジェクトストレージ、Volume、バックアップは VPS に残します。
- ステータスと診断情報はサニタイズし、取得範囲を制限します。
- ロールバックには文字列 `ROLLBACK` の確認が必要です。
- 本番操作は GitHub Actions で監査可能な状態にします。

詳細は[セキュリティモデル](docs/ja-JP/SECURITY.md)を参照してください。

## ドキュメント

| トピック | English | 简体中文 | 日本語 |
|---|---|---|---|
| 利用方法、フロー、例 | [Open](docs/USAGE.md) | [打开](docs/zh-CN/USAGE.md) | [開く](docs/ja-JP/USAGE.md) |
| GitHub 詳細設定 | [Open](docs/GITHUB_SETUP.md) | [打开](docs/zh-CN/GITHUB_SETUP.md) | [開く](docs/ja-JP/GITHUB_SETUP.md) |
| デプロイモード | [Open](docs/DEPLOYMENT_MODES.md) | [打开](docs/zh-CN/DEPLOYMENT_MODES.md) | [開く](docs/ja-JP/DEPLOYMENT_MODES.md) |
| プロジェクトとサーバー導入 | [Open](docs/ONBOARDING.md) | [打开](docs/zh-CN/ONBOARDING.md) | [開く](docs/ja-JP/ONBOARDING.md) |
| GHS SSH デプロイ | [Open](docs/SSH_TRANSPORT.md) | [打开](docs/zh-CN/SSH_TRANSPORT.md) | [開く](docs/ja-JP/SSH_TRANSPORT.md) |
| セキュリティモデル | [Open](docs/SECURITY.md) | [打开](docs/zh-CN/SECURITY.md) | [開く](docs/ja-JP/SECURITY.md) |
| 公開チェックリスト | [Open](docs/PUBLICATION.md) | [打开](docs/zh-CN/PUBLICATION.md) | [開く](docs/ja-JP/PUBLICATION.md) |
| エージェント操作スキル | [Open](skills/autodevops/SKILL.md) | [打开](skills/autodevops/SKILL.zh-CN.md) | [開く](skills/autodevops/SKILL.ja-JP.md) |

## リポジトリ構成

```text
.codex-plugin/plugin.json                 エージェントパッケージ情報
.mcp.json                                 ローカル MCP 起動設定
.github/workflows/*-via-ssh.yml           再利用可能な GHS 本番 Workflow
skills/autodevops/                        エージェントの操作規則とプロンプト
mcp-server/                               Streamable HTTP/stdio MCP コントローラー
installer/bootstrap-server.sh             サーバーワンコマンド設定スクリプト
installer/setup-managed-repo.sh           GitHub プロジェクト接続ウィザード
installer/install-runner.sh               VSR セルフホスト Runner インストーラー
installer/install-ssh-deploy.sh           GHS デプロイユーザーインストーラー
templates/managed-repo/                   自動生成 Workflow とアダプターテンプレート
examples/projects.json                    プロジェクトレジストリ例
docs/                                     構成、導入、セキュリティ、利用文書
```

## 現在の状態

このリポジトリはプライベート／セルフホスト利用向け MVP を提供します。公開マルチユーザー ChatGPT アプリとして掲載するには、OAuth 2.1、テナント分離、暗号化 Token 保存、検証済み HTTPS サービス、各種ポリシー、審査素材、プラットフォーム申請が必要です。

## ライセンスと帰属表示

[Apache License 2.0](LICENSE) の下で、変更、二次開発、再配布、商用利用が可能です。

派生配布物と商用製品では、ライセンスおよび [NOTICE](NOTICE) の原作者・出典表示を保持してください。

```text
原作者：b8vipvip
出典：https://github.com/b8vipvip/ADOB
```
