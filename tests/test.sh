#!/bin/bash

# Set the paths to the programs and expected directories
programs_dir="$(pwd)/programs"
expected_dir="$(pwd)/expected"

# Create a directory to store the actual results if needed
actual_dir="$(pwd)/actual"
mkdir -p "$actual_dir"

passed=0
# Loop through each file in the programs directory
find "$programs_dir" -type f -name "*.go" | while read -r program_file; do

    # Get the filename without the directory path and extension
    filename=$(basename "$program_file" .go)

    # Run the program and store the output in the actual directory
    cd ..
    node ./go-slang.js "$program_file" > "$actual_dir/$filename.act"
    cd tests

    # Compare the actual output with the expected output
    diff "$actual_dir/$filename.act" "$expected_dir/$filename.exp" > /dev/null

    # If the files are the same, print a success message with colour
    if [ $? -eq 0 ]; then
        echo -e "\033[0;32m$filename passed :)\033[0m"
    else
        echo -e "\033[0;31m$filename failed :(\033[0m"
    fi

done