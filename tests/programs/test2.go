package test2

func factorial(x int) int {
	if x == 0 {
		return 1
	} else {
		return x * factorial(x-1)
	}
}

func main() {
	// test recursive function call
	const x int = 4 + 2
	var y int = factorial(x)
	println(y)
}
