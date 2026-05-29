#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
DOMAIN="${2:-}"
ALIAS="${3:-}"
FORWARD_TO="${4:-}"

API_BASE="${IMPROVMX_API_BASE:-https://api.improvmx.com/v3}"
IMPROVMX_API_KEY="${IMPROVMX_API_KEY:-}"

RESPONSE_CODE=""
RESPONSE_BODY=""

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/email-forwarding-improvmx.sh template <domain>
  ./scripts/email-forwarding-improvmx.sh check-dns <domain>
  ./scripts/email-forwarding-improvmx.sh setup <domain> <alias> <forward_to_email>
  ./scripts/email-forwarding-improvmx.sh verify-api <domain>

Environment:
  IMPROVMX_API_KEY   Required for setup/verify-api.
  IMPROVMX_API_BASE  Optional. Defaults to https://api.improvmx.com/v3

Example:
  export IMPROVMX_API_KEY='your_api_key'
  ./scripts/email-forwarding-improvmx.sh setup zlxjy.com coco 785432128@qq.com
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

require_domain() {
  if [[ -z "${DOMAIN}" ]]; then
    echo "Domain is required." >&2
    usage
    exit 1
  fi
}

require_api_key() {
  if [[ -z "${IMPROVMX_API_KEY}" ]]; then
    echo "IMPROVMX_API_KEY is required for this mode." >&2
    exit 1
  fi
}

print_dns_template() {
  require_domain
  cat <<EOF
DNS records for ${DOMAIN}

Type  Host  Value                              Priority
MX    @     mx1.improvmx.com                   10
MX    @     mx2.improvmx.com                   20
TXT   @     v=spf1 include:spf.improvmx.com ~all

Notes:
- Remove old MX records first.
- DNS propagation can take up to 24-48 hours.
EOF
}

check_dns_records() {
  require_domain
  require_cmd dig
  require_cmd rg

  local mx_values txt_values
  mx_values="$(dig +short MX "${DOMAIN}" | awk '{print $2}' | sed 's/\.$//' | sort -u)"
  txt_values="$(dig +short TXT "${DOMAIN}" | tr -d '"')"

  echo "[MX]"
  if [[ -n "${mx_values}" ]]; then
    echo "${mx_values}"
  else
    echo "(none)"
  fi

  echo "[TXT]"
  if [[ -n "${txt_values}" ]]; then
    echo "${txt_values}"
  else
    echo "(none)"
  fi

  local mx_ok txt_ok
  mx_ok=0
  txt_ok=0

  if echo "${mx_values}" | rg -q "^mx1\.improvmx\.com$" && echo "${mx_values}" | rg -q "^mx2\.improvmx\.com$"; then
    mx_ok=1
  fi

  if echo "${txt_values}" | rg -q "include:spf\.improvmx\.com"; then
    txt_ok=1
  fi

  if [[ "${mx_ok}" -eq 1 && "${txt_ok}" -eq 1 ]]; then
    echo "DNS check passed: MX and SPF records look correct."
  else
    echo "DNS check failed: please apply template records and wait for propagation." >&2
    return 1
  fi
}

api_call() {
  local method="$1"
  local endpoint="$2"
  local body="${3:-}"
  local tmp_file
  tmp_file="$(mktemp)"

  if [[ -n "${body}" ]]; then
    RESPONSE_CODE="$(curl -sS -o "${tmp_file}" -w '%{http_code}' -X "${method}" "${API_BASE}${endpoint}" -u "api:${IMPROVMX_API_KEY}" -H 'Content-Type: application/json' --data "${body}")"
  else
    RESPONSE_CODE="$(curl -sS -o "${tmp_file}" -w '%{http_code}' -X "${method}" "${API_BASE}${endpoint}" -u "api:${IMPROVMX_API_KEY}")"
  fi

  RESPONSE_BODY="$(cat "${tmp_file}")"
  rm -f "${tmp_file}"
}

ensure_domain_exists() {
  api_call "GET" "/domains/${DOMAIN}"
  case "${RESPONSE_CODE}" in
    200)
      echo "Domain exists in ImprovMX: ${DOMAIN}"
      ;;
    404)
      echo "Domain not found in ImprovMX, creating..."
      api_call "POST" "/domains" "{\"domain\":\"${DOMAIN}\"}"
      if [[ "${RESPONSE_CODE}" != "200" && "${RESPONSE_CODE}" != "201" ]]; then
        echo "Failed to create domain (${RESPONSE_CODE})."
        echo "${RESPONSE_BODY}"
        exit 1
      fi
      echo "Domain created: ${DOMAIN}"
      ;;
    *)
      echo "Unexpected API response when checking domain: ${RESPONSE_CODE}"
      echo "${RESPONSE_BODY}"
      exit 1
      ;;
  esac
}

upsert_alias() {
  if [[ -z "${ALIAS}" || -z "${FORWARD_TO}" ]]; then
    echo "Alias and forward_to_email are required for setup mode." >&2
    usage
    exit 1
  fi

  api_call "PUT" "/domains/${DOMAIN}/aliases/${ALIAS}" "{\"forward\":\"${FORWARD_TO}\"}"
  if [[ "${RESPONSE_CODE}" == "200" ]]; then
    echo "Alias updated: ${ALIAS}@${DOMAIN} -> ${FORWARD_TO}"
    return
  fi

  if [[ "${RESPONSE_CODE}" == "404" ]]; then
    api_call "POST" "/domains/${DOMAIN}/aliases" "{\"alias\":\"${ALIAS}\",\"forward\":\"${FORWARD_TO}\"}"
    if [[ "${RESPONSE_CODE}" == "200" || "${RESPONSE_CODE}" == "201" ]]; then
      echo "Alias created: ${ALIAS}@${DOMAIN} -> ${FORWARD_TO}"
      return
    fi
  fi

  echo "Failed to create/update alias (${RESPONSE_CODE})."
  echo "${RESPONSE_BODY}"
  exit 1
}

verify_domain_api() {
  require_domain
  require_api_key
  require_cmd curl

  api_call "GET" "/domains/${DOMAIN}/check"
  if [[ "${RESPONSE_CODE}" != "200" ]]; then
    echo "Failed to verify domain via API (${RESPONSE_CODE})."
    echo "${RESPONSE_BODY}"
    exit 1
  fi

  echo "ImprovMX verification response:"
  echo "${RESPONSE_BODY}"
}

setup_all() {
  require_domain
  require_api_key
  require_cmd curl
  require_cmd rg

  ensure_domain_exists
  upsert_alias

  echo ""
  echo "Local DNS check:"
  if check_dns_records; then
    echo ""
    echo "Attempting API-side verification..."
    verify_domain_api
  else
    echo ""
    echo "Alias is configured in ImprovMX, but DNS records are not ready yet."
    echo "Please apply DNS template and rerun check-dns or verify-api later."
  fi
}

main() {
  case "${MODE}" in
    template)
      print_dns_template
      ;;
    check-dns)
      check_dns_records
      ;;
    setup)
      setup_all
      ;;
    verify-api)
      verify_domain_api
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
