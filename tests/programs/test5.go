package test5

func powers(x int) (int, int, int) {
	var square int = x * x
	var cube int = square * x
	var fourth int = cube * x
	return square, cube, fourth
}

func main() {
	// test multiple return values
	var x int = 4
	var y, z, w int = powers(x)
	println(y)
	println(z)
	println(w)
	// and print statement with arity > 1
	println(y, z, w)
}
