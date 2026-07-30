# ADOB デプロイモード：VSR と GHS

[English](../DEPLOYMENT_MODES.md) | [简体中文](../zh-CN/DEPLOYMENT_MODES.md) | **日本語**

ADOB は 1 つの自動化された開発ライフサイクルと、2 つの本番実行モードを使用します。モードコードはプロジェクト契約の一部であり、常に大文字で記述する必要があります。

## 標準名称

### VSR — VPS Self-hosted Runner（VPS セルフホスト Runner）

```text
GitHub Actions
      ↓
VPS 上の常駐セルフホスト Runner
      ↓
許可リスト内のプロジェクトデプロイスクリプト
```

VSR は、対象 VPS 上で GitHub Actions ジョブを直接実行します。Runner がすでに本番ホスト内で実行されているため、追加のデプロイ用 SSH ホップはありません。

VSR が適している場合：

- 専用で信頼済みの Runner を VPS に常駐させ、オンライン状態を維持できる。
- ローカル診断、ステータス公開、デプロイ、ロールバックを直接実行したい。
- リポジトリが危険な fork ワークフローから保護されている。
- Runner アカウントと Docker アクセスを本番レベルの権限として管理できる。

主な運用特性：

- VPS 上に常駐 Runner サービスがある。
- ローカルサービスやファイルへ最短でアクセスできる。
- デプロイ用の GitHub Actions SSH 秘密鍵は不要。
- Runner のライフサイクル、更新、分離を維持する必要がある。
- 信頼できないワークフローを本番 Runner 上で実行してはならない。

### GHS — GitHub-hosted SSH（GitHub ホスト SSH）

```text
GitHub ホスト Runner
      ↓ 正確なテスト済みリビジョン
ホスト鍵固定 SSH + rsync
      ↓
VPS 上の専用デプロイアカウント
      ↓
許可リスト内のプロジェクトデプロイスクリプト
```

GHS は GitHub ホスト Runner 上でオーケストレーションジョブを実行します。正確なテスト済みリビジョンをチェックアウトし、本番外のステージングディレクトリへアップロードして、ホスト鍵を固定した SSH 経由でプロジェクトのレビュー済みデプロイスクリプトを呼び出します。

GHS が適している場合：

- VPS 上に常駐 GitHub Runner を置きたくない。
- 専用 SSH 秘密鍵と正確なホスト鍵を GitHub Actions secrets に保存できる。
- デプロイをクリーンな GitHub ホスト Runner から開始したい。
- VPS の直接診断を別の制限付きワークフローまたはエンドポイントで処理する。

主な運用特性：

- VPS 上に常駐 GitHub Runner サービスは不要。
- デプロイ前に rsync で正確なコミットをステージングする。
- 専用の非 root デプロイアカウントを使用する。
- 正確な `known_hosts` エントリと `StrictHostKeyChecking=yes` を使用する。
- `.env`、データベース、ボリューム、オブジェクトストレージ、バックアップは VPS 上に残す。

## 比較

| 項目 | VSR | GHS |
|---|---|---|
| 正式名称 | VPS Self-hosted Runner | GitHub-hosted SSH |
| GitHub ジョブの実行場所 | 対象 VPS | GitHub ホスト Runner |
| デプロイ接続 | 追加の SSH ホップなし | ホスト鍵固定 SSH と rsync |
| VPS 常駐エージェント | 必須 | 不要 |
| GitHub SSH secrets | デプロイには不要 | 必須 |
| ローカル診断 | 直接実行でき便利 | 通常は別の制限付きワークフロー/API |
| 主なリスク境界 | 本番 Runner がリポジトリワークフローを実行 | SSH 鍵、ホスト鍵、デプロイアカウント |
| 最適な用途 | 信頼済み Runner を置ける安定したプライベート VPS | VPS 上の常駐エージェントを最小化したい場合 |

## プロジェクトレジストリでの宣言

すべてのプロジェクトは 1 つのモードを宣言します。

```json
{
  "id": "sumeme",
  "repo": "b8vipvip/sumeme",
  "deploymentMode": "GHS"
}
```

許可される値：

```text
VSR
GHS
```

不明な値は拒否されます。後方互換性のため `deploymentMode` を省略した場合、MCP サーバーは `VSR` を既定値として使用しますが、本番設定では明示的に宣言してください。

## ChatGPT での表現

推奨される依頼：

```text
sumeme を GHS でデプロイしてください。
プロジェクトの状態を確認し、VSR と GHS のどちらが設定されているか教えてください。
最新の VSR デプロイ失敗を診断してください。
このプロジェクトを VSR から GHS に切り替えるには、先にサーバー側のプロジェクトレジストリを更新する必要があります。
```

次のような曖昧な表現は避けてください。

```text
通常モードを使ってください。
リモートデプロイを使ってください。
runner モードを使ってください。
```

## MCP 呼び出し

定義を取得する：

```json
{
  "tool": "list_deployment_modes",
  "arguments": {}
}
```

明示的な宣言でデプロイする：

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

`mode` を省略すると、ADOB はサーバー側のプロジェクトレジストリを使用します。指定した `mode` がレジストリと一致しない場合、呼び出しは失敗します。これにより、ChatGPT がユーザーの意図と異なる本番経路を黙って実行することを防ぎます。

## GitHub Actions での宣言

### VSR ジョブ

```yaml
deploy-production-vsr:
  runs-on: [self-hosted, linux, x64, production]
  env:
    ADOB_MODE: VSR
  steps:
    - uses: actions/checkout@v4
    - name: Deploy exact tested revision
      run: bash scripts/deploy-production.sh "${GITHUB_SHA}"
```

### GHS 再利用可能ワークフロー

```yaml
deploy-production-ghs:
  uses: b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml@<PINNED_ADOB_SHA>
  with:
    adob_mode: GHS
    project_name: example
    ssh_host: ${{ vars.VPS_HOST }}
    ssh_port: ${{ vars.VPS_PORT || '22' }}
    ssh_user: ${{ vars.VPS_USER }}
    deploy_path: /opt/example
    deploy_script: scripts/deploy-production.sh
  secrets:
    ssh_private_key: ${{ secrets.SSH_PRIVATE_KEY }}
    ssh_host_key: ${{ secrets.SSH_HOST_KEY }}
```

再利用可能な SSH ワークフローは `adob_mode: GHS` のみを受け付け、それ以外の値を拒否します。

## モード変更

モード変更はインフラ移行であり、リクエストごとの設定ではありません。切り替える前に：

1. 管理対象リポジトリのワークフローを更新してレビューする。
2. 必要な Runner または SSH デプロイアカウントを用意する。
3. MCP プロジェクトレジストリの `deploymentMode` を更新する。
4. 新しいコードで明示的なデプロイを 1 回実行する。
5. デプロイ済み SHA、ヘルス、サニタイズ済みステータスを確認する。
6. 新しい経路が成功した後にのみ古い経路を無効化する。

1 回のデプロイ中に VSR と GHS を黙って切り替えてはなりません。

## MCP トランスポートとは別の設定

次の設定は独立しています。

```text
ADOB デプロイモード：VSR | GHS
MCP 接続トランスポート：stdio | http
```

`VSR` と `GHS` は本番デプロイをどこでどのように実行するかを表します。`stdio` と `http` は ChatGPT または Codex が ADOB MCP サーバーへ接続する方法を表します。