// Parser for GO_S1
// Only has support for expressions, constants and variables, and functions
// Types supported are int, float, bool

package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"reflect"
	"strconv"
	"syscall/js"
)

func parseBasicLit(basicLit *ast.BasicLit) map[string]interface{} {
	if basicLit.Kind == token.INT {
		val, err := strconv.ParseInt(basicLit.Value, 0, 0)
		if err != nil {
			return map[string]interface{}{
				"tag": "error",
				"val": err.Error(),
			}
		} else {
			return map[string]interface{}{
				"tag":  "lit",
				"kind": "int",
				"val":  val,
			}
		}
	} else if basicLit.Kind == token.FLOAT {
		val, err := strconv.ParseFloat(basicLit.Value, 64) // We don't have float32 in our language

		if err != nil {
			return map[string]interface{}{
				"tag": "error",
				"val": err.Error(),
			}
		} else {
			return map[string]interface{}{
				"tag":  "lit",
				"kind": "float",
				"val":  val,
			}
		}
	} else {
		// error
		return map[string]interface{}{
			"tag": "error",
			"val": fmt.Sprintf("Unsupported literal type %s", basicLit.Kind.String()),
		}
	}
}

var blankIdent = map[string]interface{}{
	"tag": "ident",
	"val": "_",
}

func parseFuncSignature(fieldList *ast.FieldList) ([]map[string]interface{}, []map[string]interface{}) {
	if fieldList == nil || fieldList.List == nil {
		return []map[string]interface{}{}, []map[string]interface{}{}
	}

	parsedTypes := make([](map[string]interface{}), len(fieldList.List))
	for i, field := range fieldList.List {
		parsedTypes[i] = parseAst(field.Type)
	}
	if fieldList.List[0].Names == nil { // No mixed params so we only need to check the first
		return []map[string]interface{}{}, parsedTypes
	}

	numParams := 0
	for _, field := range fieldList.List {
		numParams += len(field.Names)
	}
	names := make([](map[string]interface{}), numParams)
	types := make([](map[string]interface{}), numParams)
	for i, field := range fieldList.List {
		for j, name := range field.Names {
			names[i+j] = parseIdent(name)
			types[i+j] = parsedTypes[i]
		}
	}

	return names, types
}

func parseFuncType(funcType *ast.FuncType) map[string]interface{} {
	if funcType.TypeParams != nil {
		return map[string]interface{}{
			"tag": "error",
			"val": "Generics not supported",
		}
	}

	params, paramTypes := parseFuncSignature(funcType.Params)
	results, resultTypes := parseFuncSignature(funcType.Results)

	return map[string]interface{}{
		"tag":         "funcType",
		"params":      params,
		"paramTypes":  paramTypes,
		"results":     results,
		"resultTypes": resultTypes,
	}
}

func parseFuncLit(funcLit *ast.FuncLit) map[string]interface{} {
	return map[string]interface{}{
		"tag":  "funcLit",
		"type": parseFuncType(funcLit.Type),
		"body": parseAst(funcLit.Body),
	}
}

func parseIdent(ident *ast.Ident) map[string]interface{} {
	return map[string]interface{}{
		"tag": "ident",
		"val": ident.Name,
	}
}

func parseBinaryExpr(binaryExpr *ast.BinaryExpr) map[string]interface{} {
	return map[string]interface{}{
		"tag": "binop",
		"op":  binaryExpr.Op.String(),
		"op1": parseAst(binaryExpr.X),
		"op2": parseAst(binaryExpr.Y),
	}
}

func parseUnaryExpr(unaryExpr *ast.UnaryExpr) map[string]interface{} {
	return map[string]interface{}{
		"tag": "unop",
		"op":  unaryExpr.Op.String() + "u",
		"op1": parseAst(unaryExpr.X),
	}
}

func parseParenExpr(parenExpr *ast.ParenExpr) map[string]interface{} {
	return parseAst(parenExpr.X)
}

func parseValueSpec(valueSpec *ast.ValueSpec) map[string]interface{} {
	names := make([](map[string]interface{}), len(valueSpec.Names))
	types := make([](map[string]interface{}), len(valueSpec.Names))
	if valueSpec.Type == nil {
		return map[string]interface{}{
			"tag": "error",
			"val": "Type inference not supported",
		}
	}
	t := parseAst(valueSpec.Type)
	for i, name := range valueSpec.Names {
		names[i] = parseAst(name)
		types[i] = t
	}

	values := make([](map[string]interface{}), len(valueSpec.Values))
	for i, value := range valueSpec.Values {
		values[i] = parseAst(value)
	}

	return map[string]interface{}{
		"tag":    "spec",
		"idents": names,
		"types":  types,
		"vals":   values,
	}
}

func parseGenDecl(genDecl *ast.GenDecl) map[string]interface{} {
	if genDecl.Lparen.IsValid() {
		return map[string]interface{}{
			"tag": "error",
			"val": "Unsupported declaration type",
		}
	} else if genDecl.Tok == token.CONST {
		return map[string]interface{}{
			"tag":  "constDecl",
			"spec": parseValueSpec(genDecl.Specs[0].(*ast.ValueSpec)),
		}
	} else if genDecl.Tok == token.VAR {
		return map[string]interface{}{
			"tag":  "varDecl",
			"spec": parseValueSpec(genDecl.Specs[0].(*ast.ValueSpec)),
		}
	} else {
		return map[string]interface{}{
			"tag": "error",
			"val": "Unsupported declaration type",
		}
	}
}

func parseFuncDecl(funcDecl *ast.FuncDecl) map[string]interface{} {
	return map[string]interface{}{
		"tag":  "funcDecl",
		"name": parseIdent(funcDecl.Name)["val"],
		"type": parseFuncType(funcDecl.Type),
		"body": parseAst(funcDecl.Body),
	}
}

func parseAssignStmt(assignStmt *ast.AssignStmt) map[string]interface{} {
	// only support simple assignments
	if len(assignStmt.Lhs) != len(assignStmt.Rhs) || assignStmt.Tok != token.ASSIGN {
		return map[string]interface{}{
			"tag": "error",
			"val": "Only simple assignments are supported",
		}
	}

	lhs := make([](map[string]interface{}), len(assignStmt.Lhs))
	for i, l := range assignStmt.Lhs {
		lhs[i] = parseAst(l)
	}

	rhs := make([](map[string]interface{}), len(assignStmt.Rhs))
	for i, r := range assignStmt.Rhs {
		rhs[i] = parseAst(r)
	}

	return map[string]interface{}{
		"tag":    "assign",
		"idents": lhs,
		"vals":   rhs,
		"op":     assignStmt.Tok.String(),
	}
}

func parseBlockStmt(blockStmt *ast.BlockStmt) map[string]interface{} {
	stmts := make([](map[string]interface{}), len(blockStmt.List))
	for i, stmt := range blockStmt.List {
		stmts[i] = parseAst(stmt)
	}

	return map[string]interface{}{
		"tag": "block",
		"body": map[string]interface{}{
			"tag":   "seq",
			"stmts": stmts,
		},
	}
}

func parseCallExpr(callExpr *ast.CallExpr) map[string]interface{} {
	fun := parseAst(callExpr.Fun)
	args := make([](map[string]interface{}), len(callExpr.Args))
	for i, arg := range callExpr.Args {
		args[i] = parseAst(arg)
	}

	return map[string]interface{}{
		"tag":  "call",
		"fun":  fun,
		"args": args,
	}
}

func parseReturnStmt(returnStmt *ast.ReturnStmt) map[string]interface{} {
	results := make([](map[string]interface{}), len(returnStmt.Results))
	for i, result := range returnStmt.Results {
		results[i] = parseAst(result)
	}

	return map[string]interface{}{
		"tag":     "return",
		"results": results,
	}
}

func parseIfStmt(ifStmt *ast.IfStmt) map[string]interface{} {
	if ifStmt.Init != nil {
		return map[string]interface{}{
			"tag": "error",
			"val": "Init statement in if not supported",
		}
	}

	if ifStmt.Else == nil {
		return map[string]interface{}{
			"tag":  "if",
			"cond": parseAst(ifStmt.Cond),
			"then": parseAst(ifStmt.Body),
			"else": map[string]interface{}{
				"tag": "nop",
			},
		}
	}

	return map[string]interface{}{
		"tag":  "if",
		"cond": parseAst(ifStmt.Cond),
		"then": parseAst(ifStmt.Body),
		"else": parseAst(ifStmt.Else),
	}
}

func parseGoStmt(goStmt *ast.GoStmt) map[string]interface{} {
	return map[string]interface{}{
		"tag":  "go",
		"call": parseAst(goStmt.Call),
	}
}

func parseAst(node ast.Node) map[string]interface{} {
	switch t := node.(type) {
	case *ast.ExprStmt:
		return parseAst(t.X)
	case *ast.BasicLit:
		return parseBasicLit(node.(*ast.BasicLit))
	case *ast.FuncLit:
		return parseFuncLit(node.(*ast.FuncLit))
	case *ast.Ident:
		return parseIdent(node.(*ast.Ident))
	case *ast.BinaryExpr:
		return parseBinaryExpr(node.(*ast.BinaryExpr))
	case *ast.UnaryExpr:
		return parseUnaryExpr(node.(*ast.UnaryExpr))
	case *ast.ParenExpr:
		return parseParenExpr(node.(*ast.ParenExpr))
	case *ast.DeclStmt:
		return parseAst(t.Decl)
	case *ast.GenDecl:
		return parseGenDecl(node.(*ast.GenDecl))
	case *ast.FuncDecl:
		return parseFuncDecl(node.(*ast.FuncDecl))
	case *ast.AssignStmt:
		return parseAssignStmt(node.(*ast.AssignStmt))
	case *ast.FuncType:
		return parseFuncType(node.(*ast.FuncType))
	case *ast.BlockStmt:
		return parseBlockStmt(node.(*ast.BlockStmt))
	case *ast.CallExpr:
		return parseCallExpr(node.(*ast.CallExpr))
	case *ast.ReturnStmt:
		return parseReturnStmt(node.(*ast.ReturnStmt))
	case *ast.IfStmt:
		return parseIfStmt(node.(*ast.IfStmt))
	case *ast.GoStmt:
		return parseGoStmt(node.(*ast.GoStmt))
	default:
		fmt.Printf("Unsupported type: %T\n", t)
		return map[string]interface{}{
			"tag": "error",
			"val": fmt.Sprintf("Unsupported language feature: %s", reflect.TypeOf(t).Elem().Name()),
		}
	}
}

func parseToJson(program string) string {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "", program, 0)
	var parsed_ast map[string]interface{}
	if err != nil {
		parsed_ast = map[string]interface{}{
			"tag": "error",
			"val": err.Error(),
		}
	} else {
		// type check
		conf := types.Config{Importer: nil}
		_, err := conf.Check("main", fset, []*ast.File{f}, nil)
		if err != nil {
			parsed_ast = map[string]interface{}{
				"tag": "error",
				"val": err.Error(),
			}
		} else {
			decls := make([](map[string]interface{}), len(f.Decls))
			for i, decl := range f.Decls {
				decls[i] = parseAst(decl)
			}

			parsed_ast = map[string]interface{}{
				"tag":   "package",
				"decls": decls,
			}
		}
	}

	astJson, err := json.MarshalIndent(parsed_ast, "", "  ")
	if err != nil {
		fmt.Println(err)
		return ""
	}

	return string(astJson)
}

func cleanup(exit chan struct{}) {
	exit <- struct{}{}
}

func main() {
	js.Global().Set("parseToJson", js.FuncOf(func(this js.Value, p []js.Value) interface{} {
		return parseToJson(p[0].String())
	}))

	exit := make(chan struct{}, 0)

	js.Global().Set("cleanup", js.FuncOf(func(this js.Value, p []js.Value) interface{} {
		cleanup(exit)
		return nil
	}))

	<-exit
}
