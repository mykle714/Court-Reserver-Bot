#!/bin/bash

# Configuration
CONFIG_FILE="waitlistConfig.txt"
OUTPUT_DIR="waitlist_results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create output directory with timestamp
OUTPUT_DIR="${OUTPUT_DIR}_${TIMESTAMP}"
mkdir -p "$OUTPUT_DIR"

echo "============================================"
echo "Running curl commands from $CONFIG_FILE"
echo "Output directory: $OUTPUT_DIR"
echo "============================================"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: $CONFIG_FILE not found!"
    exit 1
fi

# Counter for tracking
count=0
failed=0

# Read each curl command and run in background
while IFS= read -r curl_command || [[ -n "$curl_command" ]]; do
    # Skip empty lines and comments
    [[ -z "$curl_command" || "$curl_command" =~ ^[[:space:]]*# ]] && continue
    
    ((count++))
    echo "[$count] Starting: ${curl_command:0:80}..."
    
    # Execute curl command in background, redirect output
    (
        eval "$curl_command" > "$OUTPUT_DIR/response_$count.txt" 2> "$OUTPUT_DIR/error_$count.txt"
        exit_code=$?
        if [ $exit_code -ne 0 ]; then
            echo "FAILED (exit code: $exit_code)" > "$OUTPUT_DIR/status_$count.txt"
        else
            echo "SUCCESS" > "$OUTPUT_DIR/status_$count.txt"
        fi
    ) &
    
done < "$CONFIG_FILE"

echo "============================================"
echo "Launched $count curl requests"
echo "Waiting for all requests to complete..."
echo "============================================"

# Wait for all background processes
wait

# Count successes and failures
for status_file in "$OUTPUT_DIR"/status_*.txt; do
    if grep -q "FAILED" "$status_file"; then
        ((failed++))
    fi
done

success=$((count - failed))

echo "============================================"
echo "COMPLETED!"
echo "Total requests: $count"
echo "Successful: $success"
echo "Failed: $failed"
echo "Results saved in: $OUTPUT_DIR"
echo "============================================"
