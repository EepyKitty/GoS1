package test6

func main() {
	// let's test all the builtins!
	println(42)
	const x, y, z int = 3, 4, 5
	println(min(x, y))
	println(max(x, y))
	// type conversion time
	var a int = 42
	var b float64 = float64(a)
	println(b)

}
