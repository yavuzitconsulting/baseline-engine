#!/bin/bash
# Import Redis state from a JSON file
# Usage: ./import_state.sh [filename]

FILENAME=${1:-"redis_dump.json"}

# Ensure we are in the project root
cd "$(dirname "$0")/.."

echo "Importing Redis state from $FILENAME..."
node scripts/redis_tools.js import "$FILENAME"
