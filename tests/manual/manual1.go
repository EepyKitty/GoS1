package manual1

var z int = 5

func spooky(x int) {
	z = z + x
	println(z)
}

func main() {
	const x, y, z int = iota, iota, iota
	go spooky(x)
	go spooky(y)
	go spooky(z)
}
