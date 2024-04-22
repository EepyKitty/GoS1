package test3

func main() {
	// test iota and multiple constant declarations
	const x, y, z int = iota, iota, iota
	println(x)
	println(y)
	println(z)
}
