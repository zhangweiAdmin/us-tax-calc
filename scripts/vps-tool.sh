#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${PROJECT_ROOT}/.vps.env"

if [[ -f "${CONFIG_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${CONFIG_FILE}"
fi

VPS_HOST="${VPS_HOST:-}"
VPS_PORT="${VPS_PORT:-22}"
VPS_USER="${VPS_USER:-root}"
VPS_APP_DIR="${VPS_APP_DIR:-/opt/us-tax-calc}"
VPS_PASSWORD="${VPS_PASSWORD:-}"
MODE="${1:-}"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/vps-tool.sh login
  ./scripts/vps-tool.sh deploy
  ./scripts/vps-tool.sh deploy-login

Config priority:
  1) Environment variables
  2) .vps.env in project root

Supported variables:
  VPS_HOST, VPS_PORT, VPS_USER, VPS_APP_DIR, VPS_PASSWORD
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

prompt_password_if_needed() {
  if [[ -n "${VPS_PASSWORD}" ]]; then
    return
  fi

  if [[ -t 0 ]]; then
    read -rsp "VPS password for ${VPS_USER}@${VPS_HOST}:${VPS_PORT}: " VPS_PASSWORD
    echo
  else
    echo "VPS_PASSWORD is required in non-interactive mode." >&2
    exit 1
  fi
}

validate_required_config() {
  if [[ -z "${VPS_HOST}" ]]; then
    echo "VPS_HOST is required (set it in .vps.env or environment)." >&2
    exit 1
  fi
}

expect_open_login_shell() {
  env VPS_HOST="${VPS_HOST}" VPS_PORT="${VPS_PORT}" VPS_USER="${VPS_USER}" VPS_PASSWORD="${VPS_PASSWORD}" expect <<'EOF'
set timeout 60
set target "$env(VPS_USER)@$env(VPS_HOST)"

spawn ssh -o StrictHostKeyChecking=no -p $env(VPS_PORT) $target
expect {
  -re {yes/no} {
    send -- "yes\r"
    exp_continue
  }
  -re {[Pp]assword:} {
    send -- "$env(VPS_PASSWORD)\r"
    exp_continue
  }
  -re {[$#] $} {
    interact
  }
  timeout {
    puts "Login timeout."
    exit 1
  }
  eof {
    puts "Login failed."
    exit 1
  }
}
EOF
}

expect_sync_project() {
  env VPS_HOST="${VPS_HOST}" VPS_PORT="${VPS_PORT}" VPS_USER="${VPS_USER}" VPS_PASSWORD="${VPS_PASSWORD}" VPS_APP_DIR="${VPS_APP_DIR}" PROJECT_ROOT="${PROJECT_ROOT}" expect <<'EOF'
set timeout 300
set target "$env(VPS_USER)@$env(VPS_HOST):$env(VPS_APP_DIR)"
set ssh_cmd "ssh -o StrictHostKeyChecking=no -p $env(VPS_PORT)"

spawn rsync -az --delete --exclude .git/ --exclude EXECUTION_LOG.md -e $ssh_cmd "$env(PROJECT_ROOT)/" $target
expect {
  -re {yes/no} {
    send -- "yes\r"
    exp_continue
  }
  -re {[Pp]assword:} {
    send -- "$env(VPS_PASSWORD)\r"
    exp_continue
  }
  timeout {
    puts "Rsync timeout."
    exit 1
  }
  eof
}
EOF
}

expect_remote_deploy() {
  env VPS_HOST="${VPS_HOST}" VPS_PORT="${VPS_PORT}" VPS_USER="${VPS_USER}" VPS_PASSWORD="${VPS_PASSWORD}" VPS_APP_DIR="${VPS_APP_DIR}" expect <<'EOF'
set timeout 300
set target "$env(VPS_USER)@$env(VPS_HOST)"

proc wait_prompt {} {
  expect {
    -re {[$#] $} {}
    timeout {
      puts "Remote command timeout."
      exit 1
    }
    eof {
      puts "Remote connection closed unexpectedly."
      exit 1
    }
  }
}

proc run_cmd {cmd} {
  send -- "$cmd\r"
  wait_prompt
}

spawn ssh -o StrictHostKeyChecking=no -p $env(VPS_PORT) $target
expect {
  -re {yes/no} {
    send -- "yes\r"
    exp_continue
  }
  -re {[Pp]assword:} {
    send -- "$env(VPS_PASSWORD)\r"
    exp_continue
  }
  -re {[$#] $} {}
  timeout {
    puts "SSH login timeout."
    exit 1
  }
  eof {
    puts "SSH login failed."
    exit 1
  }
}

run_cmd "set -e"
run_cmd "cd $env(VPS_APP_DIR)"
run_cmd "npm ci --omit=dev"
run_cmd "systemctl restart us-tax-calc.service"
run_cmd "systemctl is-active us-tax-calc.service"
run_cmd "curl -sS http://127.0.0.1:3000/api/health"

send -- "exit\r"

expect eof
EOF
}

post_check_public() {
  echo "--- public health ---"
  curl -fsS "http://${VPS_HOST}/api/health"
  echo
}

main() {
  if [[ -z "${MODE}" ]]; then
    usage
    exit 1
  fi

  require_cmd expect
  require_cmd ssh
  require_cmd rsync
  require_cmd curl
  validate_required_config
  prompt_password_if_needed

  case "${MODE}" in
    login)
      expect_open_login_shell
      ;;
    deploy)
      expect_sync_project
      expect_remote_deploy
      post_check_public
      echo "Deploy completed."
      ;;
    deploy-login)
      expect_sync_project
      expect_remote_deploy
      post_check_public
      echo "Deploy completed. Entering remote shell..."
      expect_open_login_shell
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
