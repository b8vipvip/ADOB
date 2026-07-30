# GHS — GitHub ホスト SSH デプロイ

[English](../SSH_TRANSPORT.md) | [简体中文](../zh-CN/SSH_TRANSPORT.md) | **日本語**

`GHS` は、ADOB における **GitHub-hosted SSH（GitHub ホスト SSH）** の標準コードです。

```text
GHS
GitHub ホスト Runner
      ↓ 正確なテスト済みリビジョン
ホスト鍵固定 SSH + rsync
      ↓
VPS 上の許可リスト内プロジェクトデプロイスクリプト
```

代替モードは `VSR` — VPS Self-hosted Runner です。完全な比較については [`DEPLOYMENT_MODES.md`](DEPLOYMENT_MODES.md) を参照してください。

## 再利用可能ワークフロー

GHS は次のワークフローで実装されています。

```text
b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml
```

このワークフローは、呼び出し元リポジトリを正確なテスト済み SHA でチェックアウトし、ソースツリーを本番外のステージングディレクトリへアップロードしたうえで、次の環境変数を使って呼び出し元リポジトリの許可リスト内デプロイスクリプトを実行します。

```text
ADOB_MODE=GHS
DEPLOY_DIR=<production path>
SOURCE_DIR=<uploaded source path>
```

Docker Compose 操作、ローカルヘルスチェック、スナップショット、ロールバックは引き続きプロジェクトのデプロイスクリプトが担当します。

## 必須のモード宣言

呼び出し元は次を明示的に渡してください。

```yaml
with:
  adob_mode: GHS
```

再利用可能ワークフローは `GHS` のみを受け付けます。別の値は、チェックアウトや SSH 設定の前に拒否されます。

## セキュリティルール

- SSH 秘密鍵は管理対象プロジェクトの GitHub Actions secrets に保存し、ADOB ソース、ChatGPT、Codex、issue、ログ、MCP サーバーには保存しない。
- 専用の非 root デプロイアカウントを使用する。Docker グループへの所属は本番レベルの権限として扱う。
- VPS からコピーした正確な `known_hosts` 行を使って VPS ホスト鍵を固定する。
- ワークフローは `StrictHostKeyChecking=yes` を使用し、`ssh-keyscan` へのフォールバックや検証の無効化を行わない。
- 呼び出し元はリポジトリ相対パスのデプロイスクリプトを指定する。ADOB は任意のリモートコマンドを受け付けない。
- `.env`、データベース、オブジェクトストレージ、ボリューム、バックアップは VPS 上に残し、rsync 対象から除外する。
- 呼び出し元は未固定ブランチではなく、ADOB のコミット SHA またはレビュー済みリリースタグへ固定する。

## VPS の初期セットアップ

安全な管理セッションで専用鍵ペアを生成します。

```bash
install -d -m 700 /root/adob-deploy-key
ssh-keygen \
  -t ed25519 \
  -C "github-actions:<owner>/<repository>" \
  -f /root/adob-deploy-key/id_ed25519 \
  -N ""
```

信頼できるチェックアウトから ADOB インストーラーを実行します。

```bash
SSH_PUBLIC_KEY="$(cat /root/adob-deploy-key/id_ed25519.pub)" \
DEPLOY_USER="existing-or-new-deploy-user" \
DEPLOY_DIR="/opt/project" \
SSH_HOST="VPS_PUBLIC_IP_OR_SSH_HOST" \
SSH_PORT="22" \
bash installer/install-ssh-deploy.sh
```

既存の VSR デプロイから移行する場合、その専用サービスアカウントを再利用すると、本番ディレクトリの所有権変更を避けられます。最初の GHS デプロイとステータス検証の両方が成功するまで、VSR Runner を停止しないでください。

インストーラーは GitHub secret として保存すべき正確なホスト鍵行を出力します。完全な秘密鍵は別の GitHub secret として保存し、最初のデプロイ成功後に管理環境側のコピーを削除してください。

## 呼び出し元ワークフロー

管理対象リポジトリは、CI ジョブ成功後に再利用可能ジョブとして ADOB を呼び出します。

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/test.sh

  deploy-production-ghs:
    if: >-
      github.event_name == 'push' &&
      github.ref == 'refs/heads/main' &&
      vars.ADOB_MODE == 'GHS'
    needs: [test]
    uses: b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml@<PINNED_ADOB_SHA>
    with:
      adob_mode: GHS
      project_name: example
      ssh_host: ${{ vars.VPS_HOST }}
      ssh_port: ${{ vars.VPS_PORT || '22' }}
      ssh_user: ${{ vars.VPS_USER }}
      deploy_path: /opt/example
      deploy_script: scripts/deploy-production.sh
      public_health_url: https://example.com/health
    secrets:
      ssh_private_key: ${{ secrets.SSH_PRIVATE_KEY }}
      ssh_host_key: ${{ secrets.SSH_HOST_KEY }}
```

移行中は、反対条件の下に VSR ジョブを残せます。

```yaml
if: vars.ADOB_MODE != 'GHS'
env:
  ADOB_MODE: VSR
```

GHS デプロイを検証した後、次を設定します。

```text
ADOB_MODE=GHS
```

その後、古い VSR Runner を停止し、後で登録解除できます。復旧用にフォールバックワークフローをソースへ残すことはできますが、無効化したままにし、GHS 失敗後に黙って実行されないようにしてください。

## 管理対象プロジェクトに必要な契約

呼び出し元のデプロイスクリプトは次を満たす必要があります。

1. 正確な Git SHA を第 1 引数として受け取る。
2. `SOURCE_DIR` からアップロード済みチェックアウトを読み取る。
3. 永続化された `.env` やデータボリュームを置き換えずに `DEPLOY_DIR` へデプロイする。
4. ロックにより本番変更を直列化する。
5. ローカルサービスのヘルスを検証する。
6. 成功時に `${DEPLOY_DIR}/.deploy/current_sha` を書き込む。
7. 上限付きでサニタイズ済みのデプロイ履歴を記録する。
8. 可能な場合は安全なコードロールバックを試みる。

プロジェクトスクリプト成功後、ADOB の GHS ワークフローはオプションの公開ヘルス URL も確認します。