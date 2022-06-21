const { v4 } = require("uuid")
const fs = require("fs")
const { resolve } = require("path")
let computer = null
let callx = null

class Cpu {
    constructor() {
        this.prograkitAPI = { 
            PrograKit_Print_Char(stack) {
                const code = parseInt((stack.data[stack.currentIndex - 1]), 2)
                console.log("Printing: " + String.fromCharCode(code))
            },
            Screen_Print_Char(stack) {
                const x = parseInt(stack.data[stack.currentIndex - 3], 2)
                const y = parseInt(stack.data[stack.currentIndex - 2], 2)
                const code = parseInt((stack.data[stack.currentIndex - 1]), 2)
                const char = String.fromCharCode(code).toLowerCase()

                // console.log(stack.data.filter((x, y) => y < stack.currentIndex))
                // console.log(x, y, char, code, '\n')

                const template = computer.fonts.prograkit1[char]

                computer.socket.emit("gpu:draw_pattern", { x, y, w: 16, h: 16, rgb: 'white', pattern: template })

                // computer.popAtStack(stack.name)
            },
            Debugger_Last(stack) {
                console.log(parseInt(stack.data[stack.currentIndex - 1], 2))
            }
        }

        setTimeout(() => {
            const uuid = v4()
            computer.socket.emit("cpu:listen_for_event_kp", { uuid, ev: 'keydown' })
            computer.sockets.forEach(socket => {
                socket.on(`${uuid}keydown`, (data) => {
                    if(data.toLowerCase() == "backspace") {
                        this.backspaceCallbacks.forEach(x => x())
                        return
                    }
                    data = data.charCodeAt(0)
                    console.log(data)
                    this.keypressCallbacks.forEach(x => x(data))
                })
            })
        }, 2500)
    }

    keypressCallbacks = [] //(x) => console.log(x)]
    backspaceCallbacks = []

    setComputer() {
        computer = this.computer
    }

    draw(stack) {
        const rgb = parseInt(stack.data[stack.currentIndex - 5], 2)

        const x = parseInt(stack.data[stack.currentIndex - 1], 2)
        const y = parseInt(stack.data[stack.currentIndex - 2], 2)
        const w = parseInt(stack.data[stack.currentIndex - 3], 2)
        const h = parseInt(stack.data[stack.currentIndex - 4], 2)

        computer.socket.emit("gpu:draw", { x, y, w, h, rgb })
    }

    runProgram(source, path) {
        const program = this.parseProgram(source, path)
        this.run(program)
    }

    parseProgram(rsource, path) {
        let source = rsource

        while(source.indexOf("include") != -1) {
            const index = source.indexOf("include")
            const include = source.substring(index, source.indexOf("\n", index))
            const file = resolve(path + include.split(" ")[1]).split(".pk")[0] + ".pk"

            source = source.replace(include, fs.readFileSync(file, "utf8"))
        }

        while(source.indexOf("  ") != -1) {
            source = source.replace(/  /g, " ")
        }

        while(source.indexOf(".data:") != -1) {
            const index = source.indexOf(".data:")
            let was = false, was2 = false
            function setWas() { was = true; return was }
            function setWas2() { was2 = true; return was2 }
            const name = source.split('').filter((x,y) => y >= index && y <= index + 16 && !was && (x != '=' || setWas())).join('').split('.data:')[1].split('=')[0]
            const value = source.split('').filter((x,y) => y >= index + name.length + 1 && y <= index + name.length + 1 + 16 && !was2 && (x != ',' || setWas2())).join('').split('=')[1].split(',')[0]
            // console.log(name, value)

            const sentence = `.data:${name}=${value},`
            source = source.replace(sentence, "")
            source = source.replace(new RegExp(`%${name}%`, 'g'), value)
        }

        const lines = source.split("\n")
        const program = []

        for(let i = 0; i < lines.length; i++) {
            const line = lines[i][0] == " " ? lines[i].substring(1, lines[i].length - 1) : lines[i]
            const [command, ...args] = line.split(" ")

            program.push({
                command,
                args,
                secret: command,
                index: i
            })
        }

        return program
    }

    toFull32(x) {
        let y = x.toString(2)
        for(let i = 0; i < 32 - x.toString(2).length; i++) {
            y = "0" + y
        }
        return y
    }

    assemblyError(message, line, program) {
        console.error(`${message} at line ${line + 1}`)
        console.error(program[line])
        process.exit(1)
    }

    run(program) {
        const fullRegistres = ["eax", "ebx", "ecx", "edx", "esi", "edi", "esp", "ebp", "ax", "bx", "cx", "dx", "si", "di", "sp", "bp", "al", "bl", "cl", "dl", "ah", "bh", "ch", "dh"]

        let sizeofStack = parseInt(program.find(x => x.command === ".stack").args[0])
        let maxHeapSize = parseInt(program.find(x => x.command === ".heap_max").args[0])
        let registres = { eax: 0, ebx: 0, ecx: 0, edx: 0, esi: 0, edi: 0, esp: 0, ebp: 0, ax: 0, bx: 0, cx: 0, dx: 0, si: 0, di: 0, sp: 0, bp: 0, al: 0, bl: 0, cl: 0, dl: 0, ah: 0, bh: 0, ch: 0, dh: 0 }
        let segments = { ...this.prograkitAPI }
        let rprogram = program
        let cmp = {}
        let lastWordLength = 0

        const heap = this.computer.createHeap(maxHeapSize)

        const name = `stack-${v4()}`
        const __STACK_NAME__ = name
        const stack = this.computer.createStack(name, sizeofStack)

        const parseLines = (program) => {
            for(let i = 0; i < program.length; i++) {
                const command = program[i]?.command
                const args = program[i].args

                function _call(name) {
                    const func = segments[name]

                    if(!func) return
                    if(typeof func === 'function') {
                        func(stack)
                        return
                    }
                    else {
                                            // RealProgram
                        const betweenLines = rprogram.filter(
                            (x, y) => y > func.start && 
                                    y < func.end
                        ).map(x => {
                            x.command = x?.secret
                            return x
                        })
                        parseLines(betweenLines)  
                    }
                }

                callx = _call
    
                if(command.startsWith(";") || command == ";") continue; // Comment
                if(command == "\r") continue;
    
                if(args.length == 0 && command.indexOf(":") > -1) {
                    const name = command.substring(0, command.length - 1).replace(/:/g, '')
                    if(segments[name]) {
                        this.assemblyError(`Section ${name} already exists`, i, program)
                    }
    
                    segments[name] = {
                        start: i,
                        end: program.find((x, y) => x.command == "ends" && y > i).index
                    }

                    const items = program.filter(x => x.index > i && x.index < segments[name].end)
                    items.forEach(item => item.command = ";")
    
                    continue
                }

                switch(command) {
                    case "push": {
                        if(fullRegistres.includes(args[0])) {
                            this.computer.pushAtStack(__STACK_NAME__, registres[args[0]])
                            continue
                        }

                        // Byte
                        if(args[0] == "b") {
                            const value = eval(args[1].replace("eax", registres.eax).replace("ebx", registres.ebx).replace("ecx", registres.ecx).replace("edx", registres.edx).replace("esi", registres.esi).replace("edi", registres.edi).replace("esp", registres.esp).replace("ebp", registres.ebp))
                            this.computer.pushAtStack(__STACK_NAME__, this.toFull32(value.charCodeAt(0)))
                        }

                        // DWord
                        else if(args[0] == "word") {
                            const value = eval(args.slice(1).join(" "))

                            lastWordLength = value.length
                            
                            value.split("").reverse().forEach(x => {
                                this.computer.pushAtStack(__STACK_NAME__, this.toFull32(x.charCodeAt(0)))
                            })

                            continue 
                        }

                        const value = eval(parseInt(args[0].replace("$$", lastWordLength).replace("eax", registres.eax).replace("ebx", registres.ebx).replace("ecx", registres.ecx).replace("edx", registres.edx).replace("esi", registres.esi).replace("edi", registres.edi).replace("esp", registres.esp).replace("ebp", registres.ebp).replace("ax", registres.ax).replace("bx", registres.bx).replace("cx", registres.cx).replace("dx", registres.dx).replace("si", registres.si).replace("di", registres.di).replace("sp", registres.sp).replace("bp", registres.bp).replace("al", registres.al).replace("bl", registres.bl).replace("cl", registres.cl).replace("dl", registres.dl).replace("ah", registres.ah).replace("bh", registres.bh).replace("ch", registres.ch).replace("dh", registres.dh)))
                        const type  = typeof value 

                        if(type == 'string') {
                            const _value = value.replace(/ws/g, ' ') 
                            this.computer.pushAtStack(__STACK_NAME__, this.toFull32(_value.charCodeAt(0)))
                        }
                        else if(type == 'number') {
                            const _value = this.toFull32((value).toString(2))
                            this.computer.pushAtStack(__STACK_NAME__, _value)
                        }
                    } break
                    case "pop": {
                        const times = parseInt(args[0]) || 1
    
                        for(let i = 0; i < times; i++) {
                            this.computer.popAtStack(name)
                        }
                    } break
                    case "call": {
                        const name = args[0].replace("\r", "")
                        _call(name)
                        
                    } break
                    case "mov": {
                        const to = args[0].split(",")[0]
                        const from = args[1]

                        let value = ""

                        if(from.indexOf("ls") > -1) {
                            value = stack.data[stack.currentIndex - 1] 
                        }
                        else if(fullRegistres.includes(from)) {
                            value = registres[from]
                        }
                        else {
                            value = this.toFull32(eval(from).toString(2))
                        }

                        registres[to] = value
                    } break
                    case "dec": {
                        const name = args[0]
                        
                        if(name == "ls") {
                            const val = stack.data[stack.currentIndex - 1]
                            stack.data[stack.currentIndex - 1] = this.toFull32(parseInt(val, 2) - 1)
                        }
                        else {
                            const val = parseInt(registres[name], 2)
                            registres[name] = this.toFull32((val - 1).toString(2))
                        }
                    } break
                    case "inc": {
                        const name = args[0]
                        
                        if(name == "ls") {   
                            const val = stack.data[stack.currentIndex - 1]
                            stack.data[stack.currentIndex - 1] = this.toFull32(parseInt(val, 2) + 1)
                        }
                        else {
                            const val = parseInt(registres[name], 2), value = this.toFull32((val + 1).toString(2))
                            registres[name] = value
                            
                        }
                    } break
                    case "cmp": {
                        cmp = {}

                        let name = args[0].replace(/,/g, '')
                        let value = args[1]

                        if(fullRegistres.includes(name)) {
                            name = parseInt(registres[name], 2)
                        }
                        
                        if(fullRegistres.includes(value)) {
                            value = parseInt(registres[value], 2)
                        }

                        cmp.a = name
                        cmp.b = value

                        cmp.isEqual = cmp.a == cmp.b
                        cmp.isNotEqual = cmp.a != cmp.b
                        cmp.isGreater = cmp.a > cmp.b
                        cmp.isLess = cmp.a < cmp.b
                        cmp.isGreaterOrEqual = cmp.a >= cmp.b
                        cmp.isLessOrEqual = cmp.a <= cmp.b
                        cmp.isZero = cmp.a == 0
                        cmp.isNotZero = cmp.a != 0
                        cmp.isPositive = cmp.a > 0
                        cmp.isNegative = cmp.a < 0
                    
                    } break
                    case "jne": {
                        if(cmp.isNotEqual) {
                            const name = args[0]
                            _call(name)
                            
                        } 
                    } break
                    case "je": {
                        if(cmp.isEqual) {
                            const name = args[0]
                            _call(name)
                        } 
                    } break
                    case "jg": {
                        if(cmp.isGreater) {
                            const name = args[0]
                            _call(name)
                            
                        } 
                    } break
                    case "jge": {
                        if(cmp.isGreaterOrEqual) {
                            const name = args[0]
                            _call(name)
                            
                        } 
                    } break
                    case "jl": {
                        if(cmp.isLess) {
                            const name = args[0]
                            _call(name)
                            
                        } 
                    } break
                    case "jle": {
                        if(cmp.isLessOrEqual) {
                            const name = args[0]
                            _call(name)
                            
                        } 
                    } break
                    case "jz": {
                        if(cmp.isZero) {
                            const name = args[0]
                            _call(name)
                            
                        } 
                    } break
                    case "jnz": {
                        if(cmp.isNotZero) {
                            const name = args[0]
                            _call(name)
                            
                        } 
                    } break
                    case "jp": {
                        if(cmp.isPositive) {
                            const name = args[0]
                            _call(name)
                            
                        } 
                    } break
                    case "jn": {
                        if(cmp.isNegative) {
                            const name = args[0]
                            _call(name)
                            
                        } 
                    } break
                    case "mul": {
                        const name = args[0].replace(/,/g, '')
                        const value = parseInt(registres[name], 2) * parseInt(args[1])
                        registres[name] = this.toFull32(value.toString(2))
                    } break
                    case "div": {
                        const name = args[0].replace(/,/g, '')
                        const value = parseInt(registres[name], 2) / parseInt(args[1])
                        registres[name] = this.toFull32(value.toString(2))
                        
                    } break
                    case "add": {
                        const name = args[0].replace(/,/g, '')
                        const value = parseInt(registres[name], 2) + parseInt(args[1])
                        registres[name] = this.toFull32(value.toString(2))
                    } break
                    case "sub": {
                        const name = args[0].replace(/,/g, '')
                        const value = parseInt(registres[name], 2) - parseInt(args[1])
                        registres[name] = this.toFull32(value.toString(2))
                    } break
                    case "ha": {
                        const size = parseInt(args[0])
                        let address = heap.currentIndex
                        let endAddress = heap.currentIndex + size

                        for(let i = 0; i < size; i++) {
                            heap.data[heap.currentIndex] = this.toFull32(0)

                            heap.currentIndex++
                        }

                        stack.data[stack.currentIndex - 1] = this.toFull32(parseInt(address, 2) + 1)
                    } break
                    case "hw": {
                        const address = parseInt(stack.data[stack.currentIndex - 1], 2)
                        const type = args[0]
                        if(type == "word") {
                            const value = eval(args.slice(1).join(' '))
                            value.split('').reverse().forEach((x, i) => {
                                heap.data[address + i] = this.toFull32((x.charCodeAt(0)).toString(2))
                            })
                            lastWordLength = value.length
                        }
                    } break
                    case "hr": {
                        const address = parseInt(stack.data[stack.currentIndex - 1], 2)
                        
                        const value = heap.data[address]
                        const zeros = this.toFull32("0")

                        heap.data[address] = zeros
                    } break
                    case "hts": {
                        const address = parseInt(stack.data[stack.currentIndex - 2], 2)
                        const items = parseInt(stack.data[stack.currentIndex - 1], 2) // parseInt(parseInt(stack.data[stack.currentIndex - 1], 2), 2)

                        // console.log("Items to stack: ", items)

                        for(let i = 0; i < 2; i++) {
                            computer.popAtStack(stack.name)
                        }
 
                        for(let i = 0; i < items; i++) {  
                            stack.data[stack.currentIndex] = heap.data[address + i]
                            // console.log(address + i, 'add', stack.data[stack.currentIndex])
                            stack.currentIndex++
                        }
                    } break
                    case "htsrvs": {
                        const address = parseInt(stack.data[stack.currentIndex - 2], 2)
                        const items = parseInt(stack.data[stack.currentIndex - 1], 2) // parseInt(parseInt(stack.data[stack.currentIndex - 1], 2), 2)
 
                        for(let i = 0; i < 2; i++) {
                            computer.popAtStack(stack.name)
                        }

                        for(let i = items; i > 0; i--) {  
                            stack.data[stack.currentIndex] = heap.data[address + i]
                            // console.log(address + i, 'add', stack.data[stack.currentIndex])
                            stack.currentIndex++
                        }
                    } break
                    case "dbgh": {
                        console.log(heap.data.filter((x, y) => y < heap.currentIndex).map(x => parseInt(x, 2)).join(' '))
                    } break
                    case "hwls": {
                        const address = parseInt(stack.data[stack.currentIndex - 1], 2)
                        const value = String.fromCharCode(parseInt(stack.data[stack.currentIndex - 2], 2))
                        // console.log('Fucking debuging: ', address, value, parseInt(stack.data[stack.currentIndex - 2], 2), registres.eax)
                        value.split('').reverse().forEach((x, i) => {
                            heap.data[address + i] = this.toFull32((x.charCodeAt(0)).toString(2))
                        })
                        lastWordLength = value.length

                        // console.log(heap.data.filter((x, y) => y < 10))
                    } break
                    case "hwlnrvs": {
                        const size = parseInt(parseInt(stack.data[stack.currentIndex - 2], 2), 2)
                        const address = parseInt(stack.data[stack.currentIndex - 1], 2)


                        for(let i = 0; i < size; i++) {
                            heap.data[address + i] = this.toFull32(stack.data[stack.currentIndex - 3 - i])
                            // console.log(String.fromCharCode(parseInt(heap.data[address + i], 2)))
                        }
                    } break
                    case "hits": { // Heap index to stack
                        const address = parseInt(stack.data[stack.currentIndex - 1], 2)
                        const value = heap.data[address]

                        stack.data[stack.currentIndex++] = value
                    } break
                    case "db2dec": { // DoubleBinary 2 dec
                        const last = parseInt(parseInt(stack.data[stack.currentIndex - 1], 2), 2)
                        stack.data[stack.currentIndex - 1] = this.toFull32(last.toString(2))
                    } break
                    case "ret_eq": {
                        if(cmp.isEqual) return
                    } break
                }
            }
        }

        parseLines(program)
        console.log(segments)
        // Events
        if(segments.OnKeyPress) {
            this.keypressCallbacks.push((key) => {
                stack.data[stack.currentIndex + 1] = this.toFull32(key.toString(2))
                stack.currentIndex++

                registres.eax = this.toFull32(key.toString(2))

                // console.log(stack.data[stack.currentIndex])

                callx("OnKeyPress")
            })
        }
        if(segments.OnBackspace) {
            this.backspaceCallbacks.push((key) => {
                // stack.data[stack.currentIndex + 1] = this.toFull32(key.toString(2))
                // stack.currentIndex++
                // registres.eax = this.toFull32(key.toString(2))
                // console.log(stack.data[stack.currentIndex])

                callx("OnBackspace")
            })
        }
    }

    push(value) {
        this.stack.push(value)
    }

    addAdditionalApi() {
        this.prograkitAPI = { ...this.prograkitAPI, ...this.computer.additionalApi }
        this.prograkitAPI.draw = this.draw
    }
}
        

module.exports = Cpu