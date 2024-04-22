package test7

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func sqrt_aux(x, a float64) float64 {
	if abs((a*a)-x) < 0.0001 {
		return a
	} else {
		return sqrt_aux(x, (a+(x/a))/2)
	}
}

func sqrt(x float64) float64 {
	if x < 0 {
		panic(x)
	}
	return sqrt_aux(x, x/2)
}

func main() {
	const x float64 = 42.0
	var y float64 = sqrt(x)
	println(y)
}
