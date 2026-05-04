#!/usr/bin/env bash
set -euo pipefail
curl -N -X POST "http://localhost:4000/api/generate-seo" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  --data-binary @request.json
