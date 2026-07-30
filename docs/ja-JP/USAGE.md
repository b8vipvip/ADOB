# GPT–GitHub–VPS 自動開発エージェント利用ガイド

[English](../USAGE.md) | [简体中文](../zh-CN/USAGE.md) | **日本語**

このガイドでは、ADOB が GPT クライアント、GitHub リポジトリ、VPS をどのように接続するか、コントローラーの導入方法、完全な開発サイクル、そして安全で明確な依頼例を説明します。

## 1. コンポーネントと役割

| コンポーネント | 主な役割 | 保存する秘密情報 |
|---|---|---|
| GPT / ChatGPT / Codex / MCP クライアント | 要件理解、状態確認、計画、制限ツール呼び出し | GitHub Token や SSH 秘密鍵は保存しない |
| ADOB コントローラー | プロジェクト許可リスト、MCP ツール、GitHub API、モード検証 | Fine-grained GitHub Token、任意の MCP Bearer Secret |
| GitHub | ソース、ブランチ、Pull Request、CI、Actions、監査履歴 | GHS SSH 秘密鍵と正確な VPS ホスト鍵を Actions Secrets に保存 |
| VPS | アプリ実行、本番 `.env`、データベース、Volume、ヘルスチェック、デプロイスクリプト | 本番アプリケーションの秘密情報 |

GPT クライアントに無制限の本番認証情報を渡してはいけません。

## 2. 前提条件

コントローラーサーバー：

- Debian または Ubuntu
- root または `sudo` 権限
- GitHub と OS パッケージリポジトリへの外向き通信
- 管理対象リポジトリだけに制限した Fine-grained GitHub Token

各管理対象プロジェクト：

- GitHub リポジトリ
- CI と許可済みデプロイ、診断、ロールバック Workflow
- サニタイズ済み `ops-status` スナップショット
- VSR Runner または GHS デプロイアカウント

Token 権限は有効にするツールにより異なります。プライベートテストでは通常、選択したリポジトリの Metadata、Contents 読み取りと Actions の読み取り／実行権限が必要です。必要最小限だけを付与してください。

## 3. サーバーに ADOB コントローラーを導入

### 対話式導入

スクリプトをダウンロードして確認した後、root で実行します。

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/bootstrap-server.sh \
  -o /tmp/adob-bootstrap.sh
less /tmp/adob-bootstrap.sh
sudo bash /tmp/adob-bootstrap.sh
```

スクリプトの処理：

1. Debian/Ubuntu と root 権限を確認
2. 必要に応じて `git`、`curl`、`jq`、OpenSSL、Docker、Docker Compose を導入
3. GitHub Token を非表示入力
4. 一つのプロジェクト設定を作成、または完全な JSON レジストリを読み込み
5. 指定した ADOB リビジョンを `/opt/adob-agent` に取得
6. 秘密情報を `/etc/adob-agent/adob.env` に mode `600` で保存
7. Docker Compose で MCP コントローラーを構築・起動
8. `/health` が Ready になるまで待機
9. 任意で同じ VPS を GHS デプロイ先として設定

### 主なインストーラー変数

| 変数 | 既定値 | 意味 |
|---|---|---|
| `ADOB_REF` | `main` | 導入するブランチ、タグ、Commit |
| `ADOB_SOURCE_DIR` | `/opt/adob-agent` | ソースと Compose 管理ディレクトリ |
| `ADOB_CONFIG_DIR` | `/etc/adob-agent` | 保護された実行設定ディレクトリ |
| `ADOB_BIND_ADDRESS` | `127.0.0.1` | Docker がホストへ公開するアドレス |
| `ADOB_PORT` | `8787` | MCP とヘルスチェックのホストポート |
| `AUTODEVOPS_ALLOWED_HOSTS` | `127.0.0.1,localhost` | 許可する HTTP Host ヘッダー |
| `GITHUB_TOKEN_FILE` | 空 | Fine-grained GitHub Token を保存したファイル |
| `AUTODEVOPS_PROJECTS_JSON` | 対話作成 | 完全なプロジェクトレジストリ JSON 配列 |
| `MCP_SHARED_SECRET` | 自動生成 | `/mcp` に必要な Bearer Secret |
| `CONFIGURE_GHS_TARGET` | `ask` | `true`、`false`、または対話確認 |

自動プロビジョニングでは Token をシェル履歴へ直接書かず、root のみ読めるファイルに保存します。

```bash
sudo install -d -m 700 /root/.secrets
sudo sh -c 'umask 077; cat > /root/.secrets/adob-github-token'
```

実行例：

```bash
sudo env \
  GITHUB_TOKEN_FILE=/root/.secrets/adob-github-token \
  PROJECT_REPO=owner/example \
  PROJECT_ID=example \
  PROJECT_NAME='Example App' \
  PRODUCTION_BRANCH=main \
  DEPLOYMENT_MODE=GHS \
  CONFIGURE_GHS_TARGET=false \
  bash /tmp/adob-bootstrap.sh
```

複数プロジェクトを登録する場合、保護された環境ファイルや構成管理から完全な JSON 配列を渡します。

```json
[
  {
    "id": "frontend",
    "name": "Frontend",
    "repo": "owner/frontend",
    "productionBranch": "main",
    "statusBranch": "ops-status",
    "statusPath": "status/status.json",
    "deploymentMode": "GHS",
    "workflows": {
      "deploy": "deploy-production.yml",
      "diagnose": "diagnose-production.yml",
      "rollback": "rollback-production.yml"
    }
  },
  {
    "id": "api",
    "name": "API",
    "repo": "owner/api",
    "productionBranch": "main",
    "statusBranch": "ops-status",
    "statusPath": "status/status.json",
    "deploymentMode": "VSR",
    "workflows": {
      "deploy": "deploy-production.yml",
      "diagnose": "diagnose-production.yml",
      "rollback": "rollback-production.yml"
    }
  }
]
```

### コントローラーの確認と操作

```bash
curl http://127.0.0.1:8787/health
sudo docker compose -f /opt/adob-agent/compose.yaml ps
sudo docker compose -f /opt/adob-agent/compose.yaml logs -f
```

クライアント設定時だけ、生成された MCP Bearer Secret を読み取ります。

```bash
sudo sed -n 's/^MCP_SHARED_SECRET=//p' /etc/adob-agent/adob.env
```

導入リビジョンの更新：

```bash
sudo env ADOB_REF=main GITHUB_TOKEN_FILE=/root/.secrets/adob-github-token \
  AUTODEVOPS_PROJECTS_JSON="$(sudo sed -n 's/^AUTODEVOPS_PROJECTS_JSON=//p' /etc/adob-agent/adob.env)" \
  CONFIGURE_GHS_TARGET=false \
  bash /tmp/adob-bootstrap.sh
```

サーバー交換前に `/etc/adob-agent/adob.env` を安全にバックアップしてください。

## 4. MCP エンドポイントを安全に公開

既定のエンドポイントはローカル限定です。

```text
http://127.0.0.1:8787/mcp
```

リモート MCP クライアントを接続する場合：

1. ADOB は localhost にバインドしたままにする
2. Nginx、Caddy、Traefik などレビュー済みリバースプロキシを使用
3. 検証済みドメインと有効な HTTPS 証明書を使用
4. `Authorization: Bearer <MCP_SHARED_SECRET>` を転送
5. `AUTODEVOPS_ALLOWED_HOSTS` に正確なドメインを設定
6. 可能な限り Firewall やプライベートネットワークで接続元を制限

現在の Bearer Secret 方式はプライベートテスト用です。公開マルチユーザーサービスには OAuth 2.1、PKCE、テナント分離、暗号化 Token 保存、レート制限、失効処理が必要です。

## 5. 管理対象リポジトリを準備

一般的な構成：

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml
scripts/deploy-production.sh
```

ステータス発行処理は制限された JSON を次へ書き込みます。

```text
ops-status:status/status.json
```

`.env`、認証情報、Cookie、個人データ、生のデータベース内容、無制限ログを含めてはいけません。

### GHS デプロイ先の設定

Bootstrap から `installer/install-ssh-deploy.sh` を呼び出せます。個別実行例：

```bash
SSH_PUBLIC_KEY="$(cat /secure/path/id_ed25519.pub)" \
DEPLOY_USER=autodevops-deploy \
DEPLOY_DIR=/opt/example \
SSH_HOST=example.com \
SSH_PORT=22 \
sudo -E bash installer/install-ssh-deploy.sh
```

秘密鍵と、スクリプトが表示する正確なホスト鍵行を GitHub Actions Secrets に保存します。秘密鍵を GPT や ADOB コントローラーへ貼り付けてはいけません。

### VSR デプロイ先の設定

VSR には短期 GitHub Runner 登録 Token と、GitHub が表示する正確な Runner URL・チェックサムが必要です。

```bash
export GITHUB_REPOSITORY=owner/example
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/...'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='example-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/example'

sudo -E bash installer/install-runner.sh
```

信頼できない Fork Workflow を本番 VSR Runner で実行しないでください。

## 6. GPT または MCP クライアントを接続

クライアント設定：

```text
URL：          https://your-adob-domain.example/mcp
Authorization：Bearer <MCP_SHARED_SECRET>
```

ローカル Codex／プラグインテストでは MCP サーバーを Build し、リポジトリの `.mcp.json` を使用します。

接続後は読み取り専用の依頼から始めます。

```text
登録済みプロジェクトを一覧表示し、各プロジェクトのデプロイモードを示してください。
```

```text
example の現在状態を取得し、本番 SHA、ヘルス、警告を要約してください。
```

## 7. エンドツーエンド開発フロー

### フェーズ A — 確認

エージェントは次を読み取ります。

- プロジェクトレジストリとデプロイモード
- 現在の本番状態
- ブランチと未マージ Pull Request
- 最近の CI とデプロイ実行
- デプロイ済み SHA とサービス警告

このフェーズでは本番を変更しません。

### フェーズ B — 開発

1. 非本番ブランチを作成または利用
2. 最小で一貫した変更を実装
3. テストを追加または更新
4. 無関係な整形や依存更新を避ける
5. Diff の秘密情報とセキュリティ影響を確認

### フェーズ C — 検証とレビュー

利用可能なチェックを実行し、Pull Request を作成します。検証済み結果と推測を明確に分け、実際に成功した場合だけ「テスト済み」と説明します。

### フェーズ D — マージとデプロイ

レビューとマージ後、プロジェクトレジストリの `VSR` または `GHS` を使って許可済みデプロイ Workflow を実行します。モードを暗黙に切り替えてはいけません。

### フェーズ E — 検証

- Workflow が成功
- デプロイ SHA が目的のリリースと一致
- ヘルスチェック成功
- 必須サービスが稼働
- 重大なディスク／メモリ警告がない

### フェーズ F — 診断またはロールバック

失敗時は範囲を制限した診断を収集し、失敗手順を特定して前進修正を優先します。ロールバックの方が安全で、ユーザーが文字列 `ROLLBACK` を入力した場合だけ実行します。

## 8. 完全な依頼例

### 読み取り専用監査

```text
example プロジェクトを監査してください。設定済み ADOB モード、サニタイズ済み本番状態、未マージ Pull Request、最近 10 件の Workflow を読み取り、確認済み事実、推測、必要な対応を分けて報告してください。変更はしないでください。
```

### 機能実装

```text
example 管理画面に CSV Export を追加してください。現在の構成とテストを確認し、新しいブランチで最小の一貫した変更を実装し、テスト追加、チェック実行、Diff とセキュリティ確認後に Pull Request を作成してください。レビューとマージ前にデプロイしないでください。
```

### 本番障害修正

```text
example API が断続的に 502 を返します。本番状態と最近の Workflow を読み、API サービスの範囲を制限した診断を収集してください。.env や生の秘密情報を要求しないでください。原因を推定し、ブランチで修正、テスト、Pull Request 作成まで行ってください。
```

### レビュー済みリリースのデプロイ

```text
example の main は CI に成功し Pull Request はマージ済みです。設定済み GHS モードでデプロイし、完了後に本番 SHA と main を比較し、公開・ローカルのヘルスを検証してください。
```

### 制御されたロールバック

```text
example を <known-good-sha> に戻す準備をしてください。現在リリースを確認し、データベース Migration が不可逆か説明し、実行する正確な Workflow を示してください。私が ROLLBACK と返信するまで実行しないでください。
```

## 9. よく使う運用コマンド

再起動：

```bash
sudo docker compose -f /opt/adob-agent/compose.yaml restart
```

ソース更新後の再構築：

```bash
sudo docker compose -f /opt/adob-agent/compose.yaml up -d --build
```

停止：

```bash
sudo docker compose -f /opt/adob-agent/compose.yaml down
```

MCP Bearer Secret のローテーション：

```bash
new_secret="$(openssl rand -hex 32)"
sudo sed -i "s/^MCP_SHARED_SECRET=.*/MCP_SHARED_SECRET=${new_secret}/" /etc/adob-agent/adob.env
sudo docker compose -f /opt/adob-agent/compose.yaml up -d --force-recreate
```

GitHub Token を交換する場合、`/etc/adob-agent/adob.env` を mode `600` のまま編集し、コンテナを再作成します。

## 10. セキュリティチェックリスト

- コントローラーをプライベートに保つか HTTPS の背後に配置
- 選択したリポジトリだけに制限した Fine-grained Token を使用
- GPT メッセージへ GitHub Token や SSH 秘密鍵を送らない
- GHS ホスト鍵検証を有効に保つ
- 本番ブランチとデプロイ Workflow を保護
- 本番データをアップロード用ソース一時領域へ含めない
- ステータスと診断をサニタイズし範囲を制限
- デプロイ前にレビューと CI 成功を要求
- 本番変更後にデプロイ SHA を検証
- 派生配布では Apache-2.0 と NOTICE の帰属表示を保持
