## Requirements
Project was tested and built using:
- nodejs version 21.7.2
- go version 1.22.2

## Usage
After cloning the repository, you can run as follows.
`node go-slang.js <path/to/source.go>`
Note you have to be in the same folder since the program requires `wasm_exec.js`, but the source file can be anywhere.

## Build Instructions 
The only part of the project that needs to be built is the parser. Since the wasm file is included this isn't necessary.

If it is required to rebuild the parser for any reason it can be done as follows :
1. Replace `wasm_exec.js` with the file bundled with your version of go. This file is version specific, and so must be supplied if rebuilding the parser. It is usually located at `$(go env GOROOT)/misc/wasm/wasm_exec.js`
2. Compile the parser using `GOOS=js GOARCH=wasm go build -o parser.wasm parser.go`. Note that this will require a relatively recent version of Go.

The javascript file doesn't need any building.
