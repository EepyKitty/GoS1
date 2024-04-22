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

## Testing Instructions
There are 7 automated tests and 2 manual tests. The 7 automated tests can be run by going into the tests directory (required) and running `./tests.sh`. You may need to give the file execute permission by doing `chmod +x ./tests.sh`. There is no automated test suite for windows, but they can be run manually and compared.

The 2 manual tests cannot be automated simply. They are:
1. A test for goroutines. This file simply calls a goroutine 3 times in order to trigger a race condition. Test is successful if output is varied after a few runs.
2. A test for the `panic` builtin. Test is successful if there is an error with an appropriate error message.
