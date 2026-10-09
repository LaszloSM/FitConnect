#!/usr/bin/env bash
# Corre una fase de deploy/lite/remote.sh en la instancia vía SSM y espera el
# resultado. Lo usa deploy-lite.yml; no hace falta SSH ni abrir puertos.
#
#   ssm-run.sh <instance-id> <bundle.tgz> <fase> [args...]
#
# El paquete (compose, Caddyfile, respaldos, remote.sh) viaja dentro del mismo
# comando en base64: pesa unos 7 KB, muy por debajo del límite de SSM.
set -euo pipefail

instance=$1 bundle=$2
shift 2
phase_args=$*
region=${AWS_REGION:-us-east-1}

b64=$(base64 -w0 "$bundle")
script=$(cat <<EOF
set -euo pipefail
work=\$(mktemp -d /tmp/fc-deploy.XXXXXX)
trap 'rm -rf "\$work"' EXIT
echo '$b64' | base64 -d | tar -xz -C "\$work"
bash "\$work/deploy/lite/remote.sh" $phase_args
EOF
)

params=$(jq -n --arg s "$script" '{commands: [$s], executionTimeout: ["1800"]}')
cmd_id=$(aws ssm send-command --region "$region" \
  --instance-ids "$instance" \
  --document-name AWS-RunShellScript \
  --comment "fitconnect deploy-lite: ${phase_args%% *}" \
  --parameters "$params" \
  --query Command.CommandId --output text)
echo "SSM $cmd_id (${phase_args})"

status=Pending
for _ in $(seq 1 400); do
  sleep 5
  status=$(aws ssm get-command-invocation --region "$region" --command-id "$cmd_id" --instance-id "$instance" \
    --query Status --output text 2>/dev/null || echo Pending)
  case "$status" in Pending|InProgress|Delayed) continue ;; *) break ;; esac
done

out=$(aws ssm get-command-invocation --region "$region" --command-id "$cmd_id" --instance-id "$instance" --output json)
echo "$out" | jq -r '.StandardOutputContent'
err=$(echo "$out" | jq -r '.StandardErrorContent')
[ -z "$err" ] || { echo "--- stderr ---"; echo "$err"; }

if [ "$status" != Success ]; then
  echo "::error::La fase '${phase_args}' terminó en $status"
  exit 1
fi
