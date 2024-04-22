const fs = require('fs').promises;
require('./wasm_exec.js');
const { 
    Worker,
    setEnvironmentData,
    workerData
} = require('node:worker_threads');

// stacks

// destructive
const push = (arr, ...x) => {
    for (let c of x) arr.push(c)
    return arr
}

// non-destructive
const peek = (arr, ind = 0) => arr.slice(-1 - ind)[0]


// heap

const word_size = 8
setEnvironmentData("word_size", word_size)


const heap_make = heap_size => {
    if (heap_size % word_size !== 0) throw new Error('invalid heap size')
    const data = new SharedArrayBuffer(heap_size)
    const view = new DataView(data)
    return [data, view]
}

const [shared, HEAP] = heap_make(1_000_000)

let free = new Int32Array(shared, 0, 1) // free pointer to heap
free[0] = 1

const size_offset = 6
setEnvironmentData("size_offset", size_offset)
// [type, subtype, payload, payload, payload, payload, size, size]
// Type is the main type eg. int, float, uint
// Subtype is the size of the type in bytes eg. int32 (4), int64 (8), uint8 (1), float32 (4), float64 (8)
// Payload is the actual data
// Size is the number of words taken up including children (so size * word_size is the actual size taken up)
const heap_alloc = (full_type, size) => {
    const ptr = Atomics.add(free, 0, size)
    HEAP.setUint16(ptr * word_size, full_type)
    HEAP.setUint16(ptr * word_size + size_offset, size)
    return ptr
}

// get and set a word in heap at given address
const heap_get = address =>
    HEAP.getFloat64(address * word_size)

const heap_set = (address, x) =>
    HEAP.setFloat64(address * word_size, x)

// child index starts at 0
const heap_get_child = (address, child_index) =>
    heap_get(address + 1 + child_index)

const heap_set_child = (address, child_index, value) =>
    heap_set(address + 1 + child_index, value)

const heap_get_full_type = address =>
    HEAP.getUint16(address * word_size)

const heap_get_type = address =>
    heap_get_full_type(address) & 0xFF00

const heap_get_subtype = address =>
    heap_get_full_type(address) & 0x00FF

const heap_get_size = address =>
    HEAP.getUint16(address * word_size + size_offset)

// number of children is size - (subtype//4) - 1
const heap_get_number_of_children = address =>
    heap_get_size(address) - (heap_get_subtype(address) >> 2) - 1 // bitshift for floor division easily

const heap_set_byte_at_offset = (address, offset, value) =>
    HEAP.setUint8(address * word_size + offset, value)

const heap_get_byte_at_offset = (address, offset) =>
    HEAP.getUint8(address * word_size + offset)

const heap_set_2_bytes_at_offset = (address, offset, value) =>
    HEAP.setUint16(address * word_size + offset, value)

const heap_get_2_bytes_at_offset = (address, offset) =>
    HEAP.getUint16(address * word_size + offset)

const heap_set_4_bytes_at_offset = (address, offset, value) =>
    HEAP.setUint32(address * word_size + offset, value)

const heap_get_4_bytes_at_offset = (address, offset) =>
    HEAP.getUint32(address * word_size + offset)

const display_word = word => {
    bytes = []
    for (let i = 0; i < word_size; i++) {
        bytes.push(HEAP.getUint8(word * word_size + i).toString(16))
    }
    return bytes
}

// Types
// first byte is the type
// second byte is the subtype
// pointers are shown by the first bit
//     so  0b0xxx_xxxx is a type t 
//     and 0b1xxx_xxxx is a pointer to type t
// subtype of 0 means a nil type

const Bool_t = 0x0101
const Int8_t = 0x0201
const Int16_t = 0x0202
const Int32_t = 0x0204
//const Int64_t = 0x0208 // Not supported because of JS limitations
const Uint8_t = 0x0301
const Uint16_t = 0x0302
const Uint32_t = 0x0304
//const Uint64_t = 0x0308  // Not supported because of JS limitations
//const Float32_t = 0x0404 // Not supported because of JS limitations 
const Float64_t = 0x0408

// all functions are *technically* pointers to machine code
const Func_t = 0x8504
const Builtin_t = 0x8502

// machine types
const Nil_t = 0x0000
const Unassn_t = 0x0001
const Blockframe_t = 0x0002
const Callframe_t = 0x0003
const Frame_t = 0x0004
const Environment_t = 0x0005

const representable = {
    [Bool_t]: (x) => {
        return x === true || x === false
    },
    [Int8_t]: (x) => {
        return Number.isInteger(x) && x >= -128 && x <= 127
    },
    [Int16_t]: (x) => {
        return Number.isInteger(x) && x >= -32768 && x <= 32767
    },
    [Int32_t]: (x) => {
        return Number.isInteger(x) && x >= -2147483648 && x <= 2147483647
    },
    [Uint8_t]: (x) => {
        return Number.isInteger(x) && x >= 0 && x <= 255
    },
    [Uint16_t]: (x) => {
        return Number.isInteger(x) && x >= 0 && x <= 65535
    },
    [Uint32_t]: (x) => {
        return Number.isInteger(x) && x >= 0 && x <= 4294967295
    },
    [Float64_t]: (x) => {
        return typeof x === 'number' // all JS numbers are float64 already
    },
}

const zero_value = {
    Bool_t: false,
    Int8_t: 0,
    Int16_t: 0,
    Int32_t: 0,
    Uint8_t: 0,
    Uint16_t: 0,
    Uint32_t: 0,
    Float64_t: 0,
}


// all values (including literals) are allocated on the heap

// Singletons

// Booleans
// [0x01, 0x01, 0x00/0x01, 0x00, 0x00, 0x00, 0x00, 0x00]
const False = heap_alloc(Bool_t, 1)
setEnvironmentData("False", False)
heap_set_byte_at_offset(False, 2, 0)
const True = heap_alloc(Bool_t, 1)
setEnvironmentData("True", True)
heap_set_byte_at_offset(True, 2, 1)


const is_bool = address =>
    heap_get_full_type(address) === Bool_t
    
const is_False = address =>
    is_bool(address) && !heap_get_byte_at_offset(address, 2)

const is_True = address =>
    is_bool(address) && heap_get_byte_at_offset(address, 2)

// Nil
// [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
const Nil = heap_alloc(Nil_t, 1)
setEnvironmentData("Nil", Nil)

const is_Nil = address =>
    heap_get_full_type(address) === Nil_t

// Unassigned
// [0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
const Unassigned = heap_alloc(Unassn_t, 1)
setEnvironmentData("Unassigned", Unassigned)

const is_Unassigned = address =>
    heap_get_full_type(address) === Unassn_t


// Builtins
// [0x85, 0x02, ID, ID, 0x00, 0x00, 0x00, 0x00]

const heap_alloc_builtin = id => {
    const address = heap_alloc(Builtin_t, 2)
    heap_set_2_bytes_at_offset(address, 2, id)
    return address
}

const is_builtin = address =>
    heap_get_full_type(address) === Builtin_t

const heap_get_builtin_id = address =>
    heap_get_2_bytes_at_offset(address, 2)

// Functions
// [0x85, 0x04, arity in, arity out, pc, pc, size, size]

const heap_alloc_func = (arity_in, arity_out, pc, env) => {
    const address = heap_alloc(Func_t, 2)
    heap_set_byte_at_offset(address, 2, arity_in)
    heap_set_byte_at_offset(address, 3, arity_out)
    heap_set_2_bytes_at_offset(address, 4, pc)
    heap_set_child(address, 0, env)
    return address
}

const heap_get_func_arity_in = address =>
    heap_get_byte_at_offset(address, 2)

const heap_get_func_arity_out = address =>
    heap_get_byte_at_offset(address, 3)

const heap_get_func_pc = address =>
    heap_get_2_bytes_at_offset(address, 4)

const heap_get_func_env = address =>
    heap_get_child(address, 0)

const is_func = address =>
    heap_get_full_type(address) === Func_t

// Blocks
// [0x00, 0x02, 0x00, 0x00, 0x00, 0x00, size, size]

const heap_alloc_block = env => {
    const address = heap_alloc(Blockframe_t, 2)
    heap_set_child(address, 0, env)
    return address
}

const heap_get_block_env = address =>
    heap_get_child(address, 0)

const is_block = address =>
    heap_get_full_type(address) === Blockframe_t

// Callframes
// [0x00, 0x03, pc, pc, 0x00, 0x00, size, size]

const heap_alloc_callframe = (env, pc) => {
    const address = heap_alloc(Callframe_t, 2)
    heap_set_2_bytes_at_offset(address, 2, pc)
    heap_set_child(address, 0, env)
    return address
}

const heap_get_callframe_pc = address =>
    heap_get_2_bytes_at_offset(address, 2)

const heap_get_callframe_env = address =>
    heap_get_child(address, 0)

const is_callframe = address =>
    heap_get_full_type(address) === Callframe_t


// Frames
// [0x00, 0x04, 0x00, 0x00, 0x00, 0x00, size, size]

const heap_alloc_frame = number_of_vals => 
    heap_alloc(Frame_t, number_of_vals + 1)

const display_frame = frame => {
    const size = heap_get_size(frame)
    console.log(`Frame with ${size - 1} values:`)
    for (let i = 0; i < size - 1; i++) {
        console.log(i, display_word(heap_get_child(frame, i)))
    }
}

// Environment
// [0x00, 0x05, 0x00, 0x00, 0x00, 0x00, size, size]

const heap_alloc_env = number_of_frames => {
    return heap_alloc(Environment_t, number_of_frames + 1)
}

const heap_empty_env = heap_alloc_env(0)


const heap_get_env_val = (env, position) => {
    const [frame_index, value_index] = position
    const frame = heap_get_child(env, frame_index)
    return heap_get_child(frame, value_index)
}

const heap_set_env_val = (env, position, value) => {
    const [frame_index, value_index] = position
    const frame = heap_get_child(env, frame_index)
    heap_set_child(frame, value_index, value)
}

const heap_env_extend = (env, new_frame) => {
    const old_size = heap_get_size(env)
    const new_env = heap_alloc_env(old_size)

    let i
    for (i = 0; i < old_size - 1; i++) {
        heap_set_child(new_env, i, heap_get_child(env, i))
    }
    heap_set_child(new_env, i, new_frame)
    return new_env
}

const display_env = env => {
    const size = heap_get_size(env)
    console.log(`Environment with ${size - 1} frames:`)
    for (let i = 0; i < size - 1; i++) {
        console.log(`Frame ${i}:`)
        const frame = heap_get_child(env, i)
        display_frame(frame)
    }
}

// Numbers

// Integers

const heap_alloc_int8 = value => {
    const address = heap_alloc(Int8_t, 1)
    heap_set_byte_at_offset(address, 2, value % 0x100)
    return address
}

const heap_get_int8 = address =>
    HEAP.getInt8(address * word_size + 2)

const heap_alloc_int16 = value => {
    const address = heap_alloc(Int16_t, 1)
    heap_set_2_bytes_at_offset(address, 2, value % 0x10000)
    return address
}

const heap_get_int16 = address =>
    HEAP.getInt16(address * word_size + 2)

const heap_alloc_int32 = value => {
    const address = heap_alloc(Int32_t, 1)
    heap_set_4_bytes_at_offset(address, 2, value % 0x100000000)
    return address
}

const heap_get_int32 = address =>
    HEAP.getInt32(address * word_size + 2)


// const heap_alloc_int64 = value => {
//     const address = heap_alloc(Int64_t, 2)
//     heap_set_child(address, 0, value)
//     return address
// }

// const heap_get_int64 = address =>
//     heap_get_child(address, 0)

const is_int = address =>
    heap_get_type(address) === 0x0200

// Unsigned Integers

const heap_alloc_uint8 = value => {
    const address = heap_alloc(Uint8_t, 1)
    heap_set_byte_at_offset(address, 2, (value>>>0) % 0x100)
    return address
}

const heap_get_uint8 = address =>
    heap_get_byte_at_offset(address, 2)>>>0

const heap_alloc_uint16 = value => {
    const address = heap_alloc(Uint16_t, 1)
    heap_set_2_bytes_at_offset(address, 2, (value>>>0) % 0x10000)
    return address
}

const heap_get_uint16 = address =>
    heap_get_2_bytes_at_offset(address, 2)>>>0

const heap_alloc_uint32 = value => {
    const address = heap_alloc(Uint32_t, 1)
    heap_set_4_bytes_at_offset(address, 2, (value>>>0) % 0x100000000)
    return address
}

const heap_get_uint32 = address =>
    heap_get_4_bytes_at_offset(address, 2)>>>0

const is_uint = address =>
    heap_get_type(address) === 0x0300

// Floats

const heap_alloc_float64 = value => {
    const address = heap_alloc(Float64_t, 2)
    heap_set(address + 1, value)
    return address
}

const heap_get_float64 = address =>
    heap_get(address + 1)

const is_float = address =>
    heap_get_type(address) === 0x0400


// Converting from address to value

const address_to_JS = x => {
    if (is_int(x)) {
        switch (heap_get_subtype(x)) {
            case 1: return heap_get_int8(x)
            case 2: return heap_get_int16(x)
            case 4: return heap_get_int32(x)
        }
    } else if (is_uint(x)) {
        switch (heap_get_subtype(x)) {
            case 1: return heap_get_uint8(x)
            case 2: return heap_get_uint16(x)
            case 4: return heap_get_uint32(x)
        }
    } else if (is_float(x)) {
        return heap_get(x + 1)
    } else if (is_True(x)) {
        return true
    } else if (is_False(x)) {
        return false
    } else if (is_Nil(x)) {
        return null
    } else if (is_Unassigned(x)) {
        return "<unassigned>"
    } else if (is_builtin(x)) {
        return "<builtin>"
    } else if (is_func(x)) {
        return "<function>"
    } else {
        return "unknown"
    }
}

const JS_to_address = (x, type) => {
    if (type === Int8_t) {
        return heap_alloc_int8(x)
    } else if (type === Int16_t) {
        return heap_alloc_int16(x)
    } else if (type === Int32_t) {
        return heap_alloc_int32(x)
    // } else if (type === Int64_t) {
    //     return heap_alloc_int64(x)
    } else if (type === Uint8_t) {
        return heap_alloc_uint8(x)
    } else if (type === Uint16_t) {
        return heap_alloc_uint16(x)
    } else if (type === Uint32_t) {
        return heap_alloc_uint32(x)
    } else if (type === Float64_t) {
        return heap_alloc_float64(x)
    } else if (type === Bool_t) {
        return x ? True : False
    } else if (type === Nil_t) {
        return Nil
    } else if (type === Unassn_t) {
        return Unassigned
    } else {
        return "unknown"
    }
}


// Compile Time Environment

const compile_time_env_position = (env, x) => {
    let frame_index = env.length
    while (value_index(env[--frame_index], x) === -1) {}
    return [frame_index, 
            value_index(env[frame_index], x)]
}

const value_index = (frame, x) => {
    for (let i = 0; i < frame.length; i++) {
        if (frame[i] === x) return i
    }
    return -1;
}

const predefined_types = {
    "int" : Int32_t,
    "int8" : Int8_t,
    "int16" : Int16_t,
    "int32" : Int32_t,
    // "int64" : Int64_t,
    "float" : Float64_t,
    "float64" : Float64_t,
    "uint8" : Uint8_t,
    "uint16" : Uint16_t,
    "uint32" : Uint32_t,
    "bool" : Bool_t,

    // aliases
    "rune" : Int32_t,
    "byte" : Uint8_t,
}

const builtin_object = {
    println         : () => {
                        arity = OS.pop()
                        values = []
                        for (let i = 0; i < arity; i++) {
                            values.push(address_to_JS(OS.pop()))
                        }
                        console.log(...values.reverse())
                      },
    panic           : () => {
                        OS.pop() // ignored
                        const address = OS.pop()
                        throw new Error(address_to_JS(address))
                      },
    min             : () => {
                        const n = OS.pop() // number of arguments
                        const type = heap_get_full_type(peek(OS))
                        let min = Infinity
                        for (let i = 0; i < n; i++) {
                            const x = address_to_JS(OS.pop())
                            if (x < min) min = x
                        }
                        return JS_to_address(min, type)
                      },
    max            : () => {
                        const n = OS.pop() // number of arguments
                        const type = heap_get_full_type(peek(OS))
                        let max = -Infinity
                        for (let i = 0; i < n; i++) {
                            const x = address_to_JS(OS.pop())
                            if (x > max) max = x
                        }
                        return JS_to_address(max, type)
                    },
}

for (const type in predefined_types) {
    if (representable.hasOwnProperty(predefined_types[type])) {
        builtin_object[type] = () => {
            OS.pop() // ignore arity
            const x = OS.pop()
            if (!representable[predefined_types[type]](address_to_JS(x))) {
                throw new Error("value not representable as " + type)
            }
            return JS_to_address(address_to_JS(x), predefined_types[type])
        }
    }
}

const primitive = {}
const builtins = []

{
    let id = 0
    for (const key in builtin_object) {
        primitive[key] = {
            tag : 'primitive',
            id  : id,
            arity_in : 0,
            arity_out : 1, 
        }
        builtins[id++] = builtin_object[key]
    }
}

// for (const type in predefined_types) {
//     primitive[type] = predefined_types[type]
// }

const predefined_values = {
    "true" : True,
    "false" : False,
    "nil" : Nil,
}

for (const value in predefined_values) {
    primitive[value] = predefined_values[value]
}

const compile_time_env_extend = (env, vals) => {
    return push([...env], vals) // shallow copy
}

// Global compile time environment
// doesn't need to be an object because we don't care about the values
const global_compile_frame = Object.keys(primitive)
const global_compile_env = [global_compile_frame]

//
// Compiler
//

// scan out declarations from a sequence of statements
// Note : ignores nested blocks

const scan = comp => 
    comp.tag === "seq" 
        ? comp.stmts.reduce((acc, x) => acc.concat(scan(x)), [])
        : ["constDecl", "varDecl"].includes(comp.tag)
        ? comp.spec.idents.map(x => x.val)
        : []



const compile_sequence = (seq, env) => {
    seq.map(x => compile(x, env))
}

// replace iota with a new value
const set_iota = (comp, iota) => {
    if (comp.tag === "ident" && comp.val === "iota") {
        comp.tag = "lit"
        comp.val = iota
        comp.kind = "int"
    } else if (comp.tag === "binop") {
        comp.op1 = set_iota(comp.op1, iota)
        comp.op2 = set_iota(comp.op2, iota)
    } else if (comp.tag === "unop") {
        comp.op1 = set_iota(comp.op1, iota)
    } else if (comp.tag === "call") {
        comp.args = comp.args.map(x => set_iota(x, iota))
    }
    return comp
}

// process named returns

// write pointer
let wp

// entry point 
let ep

// byte-code array
let instrs

// MARK: - Compile Components

const compile_comp = {
    lit: (comp, env) => {
        instrs[wp++] = { tag: "LDC", val: comp.val, type: comp.kind }
    },
    ident: (comp, env) => {
        instrs[wp++] = {
            tag: "LD",
            sym: comp.val,
            pos: compile_time_env_position(env, comp.val),
        }
    },
    unop: (comp, env) => {
        compile(comp.op1, env)
        instrs[wp++] = { tag: "UNOP", sym: comp.op }
    },
    binop: (comp, env) => {
        compile(comp.op1, env)
        compile(comp.op2, env)
        instrs[wp++] = { tag: "BINOP", sym: comp.op }
    },
    call: (comp, env) => {
        compile(comp.fun, env)
        comp.args.map(x => compile(x, env))
        instrs[wp++] = { tag: "CALL", arity_in: comp.args.length }
    },
    assign: (comp, env) => {
        comp.vals.map(x => compile(x, env)) // left to right (according to spec)
        // copy needed because reverse is destructive ... for some reason
        const idents = [...comp.idents].reverse() // right to left (because of stack)
        idents.map(ident => {
            instrs[wp++] = {
                tag: "ASSIGN",
                sym: ident.val,
                pos: compile_time_env_position(env, ident.val),
            }
        })
    },
    funcLit: (comp, env) => {
        if (comp.type.results.length > 0) {
            throw new Error("named results are not supported yet")
        }
        instrs[wp++] = { 
            tag: "LDF", 
            arity_in: comp.type.paramTypes.length, // read types because possible unnamed params
            arity_out: comp.type.resultTypes.length, // read types because possible unnamed results
            named_returns: comp.type.results.length > 0,
            addr: wp + 1 
        }
        const goto_instr = { tag: "GOTO" }
        instrs[wp++] = goto_instr
        let names = comp.type.params.map(x => x.val)
        names = names === "" ? [] : names
        compile(comp.body, compile_time_env_extend(env, names))
        instrs[wp++] = { tag: "LDC", val: undefined } 
        instrs[wp++] = { tag: "RESET" }
        goto_instr.addr = wp
    },
    seq: (comp, env) => {
        compile_sequence(comp.stmts, env)
    },
    block: (comp, env) => {
        const locals = scan(comp.body)
        instrs[wp++] = { tag: "ENTER_SCOPE", num: locals.length }
        compile(comp.body, compile_time_env_extend(env, locals))
        instrs[wp++] = { tag: "EXIT_SCOPE" }
    },
    varDecl: (comp, env) => {
        comp.spec.vals.map(x => compile(x, env)) // left to right
        const idents = [...comp.spec.idents].reverse() // right to left
        idents.map(ident => {
            instrs[wp++] = {
                tag: "ASSIGN",
                sym: ident.val,
                pos: compile_time_env_position(env, ident.val),
            }
        })
    },
    constDecl: (comp, env) => {
        let iota = 0
        comp.spec.vals.map(x => {compile(set_iota(x, iota++), env)}) // left to right
        const idents = [...comp.spec.idents].reverse() // right to left
        idents.map(ident => {
            instrs[wp++] = {
                tag: "ASSIGN",
                sym: ident.val,
                pos: compile_time_env_position(env, ident.val),
            }
        })
    },
    funcDecl: (comp, env) => {
        // convert to constDecl and funcLit
        compile({
            tag: "constDecl",
            spec: {
                idents: [{tag:"ident", val:comp.name}],
                vals: [{
                    tag: "funcLit",
                    type: comp.type,
                    body: comp.body,
                }]
            }
        }, env)
    },
    return: (comp, env) => {
        comp.results.map(x => compile(x, env))
        if (comp.results.length === 1 && comp.results[0].tag === "call") {
            instrs[wp - 1].tag = "TAIL_CALL"
        } else {
            instrs[wp++] = { tag: "RESET" }
        }
            
    },
    package: (comp, env) => {
        // TODO: implement reordering of top level declarations

        const globals = []
        for (const decl of comp.decls) {
            if (decl.tag === "constDecl" || decl.tag === "varDecl") {
                globals.push(...decl.spec.idents.map(x => x.val))
            } else if (decl.tag === "funcDecl") {
                globals.push(decl.name)
            }
        }
        instrs[wp++] = { tag: "ENTER_SCOPE", num: globals.length }

        const new_env = compile_time_env_extend(env, globals)
        // compile all declarations
        for (const decl of comp.decls) {
            if ((decl.tag === "funcDecl") && (decl.name === "main")) {
                if (decl.type.paramTypes.length > 0 || decl.type.resultTypes.length > 0) {
                    throw new Error("main must have no parameters or results")
                }
                entry_point = compile_time_env_position(new_env, "main")
            }
            compile(decl, new_env)
        }
        instrs[wp++] = { tag: "LD", sym: "main", pos: entry_point }
        instrs[wp++] = { tag: "CALL", arity_in: 0 }
        instrs[wp++] = { tag: "EXIT_SCOPE" }
    },
    if: (comp, env) => {
        compile(comp.cond, env)
        const jof_instr = { tag: "JOF" }
        instrs[wp++] = jof_instr
        compile(comp.then, env)
        const goto_instr = { tag: "GOTO" }
        instrs[wp++] = goto_instr
        jof_instr.addr = wp
        compile(comp.else, env)
        goto_instr.addr = wp
    },
    go: (comp, env) => {
        compile(comp.call, env)
        instrs[wp - 1] = { tag: "GO_CALL", arity_in: comp.call.args.length }
    },
    nop: (comp, env) => {
    },
}


const compile = (comp, env) => {
    compile_comp[comp.tag](comp, env)
}

const compile_program = (program) => {
    wp = 0
    instrs = []
    entry_point = -1
    compile(program, global_compile_env)
    if (entry_point === -1) {
        throw new Error("no main function found")
    }
    instrs[wp++] = { tag: "DONE" }
}

// 
// operators and builtins
// 

const binop_microcode = {
    // logical ops
    "&&": (x, y) => x && y,
    "||": (x, y) => x || y,

    // rel ops
    "==": (x, y) => x === y,
    "!=": (x, y) => x !== y,
    "<": (x, y) => x < y,
    ">": (x, y) => x > y,
    "<=": (x, y) => x <= y,
    ">=": (x, y) => x >= y,

    // add ops
    "+": (x, y) => x + y,
    "-": (x, y) => x - y,
    "|": (x, y) => x | y,
    "^": (x, y) => x ^ y,

    // mul ops
    "*": (x, y) => x * y,
    "/": (x, y) => x / y,
    "%": (x, y) => x % y,
    "<<": (x, y) => x << y,
    ">>": (x, y) => x >> y,
    "&": (x, y) => x & y,
    "&^": (x, y) => x & ~y,
}

const binop_allowed_types = {
    // logical ops
    "&&": [Bool_t],
    "||": [Bool_t],

    // rel ops
    "==": [Bool_t, Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    "!=": [Bool_t, Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    "<": [Bool_t, Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    ">": [Bool_t, Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    "<=": [Bool_t, Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    ">=": [Bool_t, Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],

    // add ops
    "+": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    "-": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    "|": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t],
    "^": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t],

    // mul ops
    "*": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    "/": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    "%": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t],
    "&": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t],
    "&^": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t],

    // shift ops
    "<<": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t],
    ">>": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t],
}

// y is above x on the stack
const apply_binop = (op, y, x) => {
    const type_1 = heap_get_full_type(x)
    const type_2 = heap_get_full_type(y)
    const op1 = address_to_JS(x)
    const op2 = address_to_JS(y)
    // console.log(op, op1, op2, type_1, type_2)

    //if (type_1 !== type_2) throw new Error("type mismatch")
    // no need anymore because of compile time check
    
    if (!binop_allowed_types[op].includes(type_1)) throw new Error("invalid type for operation: " + op)

    if (["==", "!=", "<", ">", "<=", ">="].includes(op)) {
        return JS_to_address(binop_microcode[op](op1, op2), Bool_t)
    } else {
        return JS_to_address(binop_microcode[op](op1, op2), type_1)
    }
}

const unop_microcode = {
    "+u": x => x,
    "-u": x => -x,
    "!u": x => !x,
    "^u": x => ~x,
}

const unop_allowed_types = {
    "+u": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    "-u": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t, Float64_t],
    "!u": [Bool_t],
    "^u": [Int8_t, Int16_t, Int32_t, Uint8_t, Uint16_t, Uint32_t],
}

const apply_unop = (op, x) => {
    const type = heap_get_full_type(x)
    const op1 = address_to_JS(x)

    if (!unop_allowed_types[op].includes(type)) throw new Error("invalid type for operation: " + op)

    return JS_to_address(unop_microcode[op](op1), type)
}

const apply_builtin = id => {
    const result = builtins[id]()
    OS.pop() // pop the builtin
    if (result === undefined) return
    push(OS, result)
}

// global runtime environment
const primitive_values = Object.values(primitive)
const frame_address = heap_alloc_frame(primitive_values.length)
for (let i = 0; i < primitive_values.length; i++) {
    const primitive_val = primitive_values[i]
    if (typeof primitive_val === "object" && primitive_val.hasOwnProperty("id")) {
        heap_set_child(frame_address, i, heap_alloc_builtin(primitive_val.id))
    } else {
        heap_set_child(frame_address, i, primitive_val)
    }
}

const global_runtime_env = heap_env_extend(heap_empty_env, frame_address)

//
// Virtual Machine
//

// machine registers
let OS; // JS array (stack) of words (Addresses,
//        word-encoded literals, numbers)
let PC; // JS number
let E; // heap Address
let RTS; // JS array (stack) of Addresses
HEAP; // (declared above already)

const microcode = {
	LDC: (instr) => push(OS, JS_to_address(instr.val, predefined_types[instr.type])),
	UNOP: (instr) => push(OS, apply_unop(instr.sym, OS.pop())),
	BINOP: (instr) => push(OS, apply_binop(instr.sym, OS.pop(), OS.pop())),
	POP: (instr) => OS.pop(),
	JOF: (instr) => (PC = is_True(OS.pop()) ? PC : instr.addr),
	GOTO: (instr) => (PC = instr.addr),
	ENTER_SCOPE: (instr) => {
		push(RTS, heap_alloc_block(E));
		const frame_address = heap_alloc_frame(instr.num);
		E = heap_env_extend(E, frame_address);
		for (let i = 0; i < instr.num; i++) {
			heap_set_child(frame_address, i, Unassigned);
		}
	},
	EXIT_SCOPE: (instr) => (E = heap_get_block_env(RTS.pop())),
	LD: (instr) => {
		const val = heap_get_env_val(E, instr.pos);
		if (is_Unassigned(val)) error("access of unassigned variable");
		push(OS, val);
	},
	ASSIGN: (instr) => heap_set_env_val(E, instr.pos, OS.pop()),
	LDF: (instr) => {
		const closure_address = heap_alloc_func(instr.arity_in, instr.arity_out, instr.addr, E);
		push(OS, closure_address);
	},
	CALL: (instr) => {
		const arity_in = instr.arity_in;
        const arity_out = instr.arity_out;
		const fun = peek(OS, arity_in);
		if (is_builtin(fun)) {
            OS.push(arity_in)
			return apply_builtin(heap_get_builtin_id(fun));
		}
        const frame_size = arity_in + (instr.named_returns ? arity_out : 0);
		const frame_address = heap_alloc_frame(frame_size);
		for (let i = arity_in - 1; i >= 0; i--) {
			heap_set_child(frame_address, i, OS.pop());
		}
		OS.pop(); // pop fun
		push(RTS, heap_alloc_callframe(E, PC));
		E = heap_env_extend(
			heap_get_func_env(fun),
            frame_address,
		);
		PC = heap_get_func_pc(fun);
	},
	TAIL_CALL: (instr) => {
		const arity_in = instr.arity_in;
        const arity_out = instr.arity_out;
		const fun = peek(OS, arity_in);
		if (is_builtin(fun)) {
			return apply_builtin(heap_get_builtin_id(fun));
		}
        const frame_size = arity_in + (instr.named_returns ? arity_out : 0);
		const frame_address = heap_alloc_frame(frame_size);
		for (let i = arity_in - 1; i >= 0; i--) {
			heap_set_child(frame_address, i, OS.pop());
		}
		OS.pop(); // pop fun
		// push(RTS, heap_alloc_callframe(E, PC)); Don't do this because tail call
		E = heap_env_extend(
			heap_get_func_env(fun),
            frame_address,
		);
		PC = heap_get_func_pc(fun);
	},
    GO_CALL: (instr) => {
        const arity_in = instr.arity_in;
        const arity_out = instr.arity_out;
		const fun = peek(OS, arity_in);
		if (is_builtin(fun)) {
			throw new Error("cannot call builtin in goroutine");
		}
		const frame_address = heap_alloc_frame(arity_in);
		for (let i = arity_in - 1; i >= 0; i--) {
			heap_set_child(frame_address, i, OS.pop());
		}
		OS.pop(); // pop fun
		exit_frame = heap_alloc_callframe(E, instrs.length-1); 
		E_new = heap_env_extend(
			heap_get_func_env(fun),
            frame_address,
		);
        const worker = new Worker(
            './goroutine_worker.js', 
            {
                workerData: [instrs, HEAP, free, E_new, [exit_frame], heap_get_func_pc(fun)],
            })

        // let listener for stdout as messages from worker since
        // console.log gets eaten by main thread most of the time
        worker.on('message', (message) => {
            console.log(message);
        })
        worker.postMessage({msg: "it's alive!"})
    },
	RESET: (instr) => {
		PC--;
		// keep popping...
		const top_frame = RTS.pop();
		if (is_callframe(top_frame)) {
			// ...until top frame is a call frame
			PC = heap_get_callframe_pc(top_frame);
			E = heap_get_callframe_env(top_frame);
		}
	},
}

async function run () {
    OS = []
    PC = 0
    E = global_runtime_env
    // display_env(E)
    RTS = []

    while (instrs[PC].tag !== "DONE") {
        // console.log(PC, instrs[PC], OS.map(display_word))
        const instr = instrs[PC++]
        microcode[instr.tag](instr)
        // uncomment to slow down the execution
        // await new Promise(r => setTimeout(r, 500))
    }

    return address_to_JS(OS.pop())
}

const preprocess = program => {
    // for now, only look for parsing errors
    if (typeof program === "object") {
        if (program.tag === "error") {
            throw new Error(program.val)
        }
        for (const key in program) {
            preprocess(program[key])
        }
    }
}

const compile_run = (program) => {
    preprocess(program)
    compile_program(program)
    // console.log(instrs)
    return run()
}

// Parse the program to JSON
let ast;
const go = new Go();
(async () => {
    const wasm = await fs.readFile('./parser.wasm');
    const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
    go.run(instance);

    const program = await fs.readFile(process.argv[2], 'utf8');
    ast = JSON.parse(parseToJson(program));

    cleanup(); // let go program exit

    // console.log(JSON.stringify(ast, null, 2));

    // Run the program
    const result = await compile_run(ast);

    // console.log(result);
    }
)();
