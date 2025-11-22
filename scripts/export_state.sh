#!/bin/bash
# Export Redis state to a JSON file
# Usage: ./export_state.sh [filename]

FILENAME=${1:-"redis_dump.json"}

# Ensure we are in the project root
cd "$(dirname "$0")/.."

echo "Exporting Redis state to $FILENAME..."
node scripts/redis_tools.js export "$FILENAME"
