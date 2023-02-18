#!/bin/bash

share_dir="/share/bestin"

if [ ! -f "$share_dir/bestin.js" ]; then
    if ! mkdir -p "$share_dir"; then
        echo "ERROR: Failed to create directory $share_dir"
        exit 1
    fi

    if ! mv /bestin.js "$share_dir"; then
        echo "ERROR: Failed to move bestin.js to $share_dir"
        exit 1
    fi
fi

echo "INFO: Running bestin Addon..."
cd "$share_dir"
if ! node bestin.js; then
    echo "ERROR: Failed to run bestin.js"
    exit 1
fi

# For dev
# while true; do echo "still live"; sleep 100; done
