const cpu = require("./cpu")
const fs = require("fs")
const http = require("http")
const express = require("express")
const socket = require("socket.io")
const { exec } = require("child_process")
const { resolve } = require("path")

const __FREE_BYTES__ = "00000000000000000000000000000000"

class Computer {
    constructor({ ram, path, additionalApi }) {

        exec(`node ${resolve("node_modules/electron/cli.js")} ${resolve("src/electron.js")}`)

        this.express = express()
        this.http = http.createServer(this.express)
        this.socket = socket(this.http)
        this.sockets = []

        this.http.listen(3050, () => console.log("Computer is running on port 3050"))
        
        this.additionalApi = additionalApi
        
        this.cpu = new cpu()

        this.cpu.computer = this
        this.cpu.setComputer()
        this.cpu.addAdditionalApi()

        this.ramSize = ram
        this.usedRam = 0
        this.stacks = []

        this.path = path
        this.fonts = {  prograkit1: require("./font-prograkit-1") }

        this.#createRamMemory()
        this.#makeSockets()
    }

    #makeSockets() {
        this.socket.on("connection", (socket) => {
            this.sockets.push(socket)
            socket.on("disconnect", () => {
                this.sockets.splice(this.sockets.indexOf(socket), 1)
            })
        })
    }

    #createRamMemory() {
        // Creating test stack
        this.createStack("test-stack", 1 * 1024)
    }

    createStack(name, size) {
        this.stacks.push({
            name,
            size,
            data: Array(size / 32).fill(__FREE_BYTES__),
            used: 0,
            currentIndex: 0,
            maxIndexes: size / 32
        })

        this.usedRam += size

        return this.stacks[this.stacks.length - 1]
    }

    getStack(name) {
        return this.stacks.find(stack => stack.name === name)
    }

    getStackIndex(name, index) {
        const stack = this.getStack(name)

        if(!stack) return null

        return stack.data[index]
    }

    pushAtStack(stackName, value) {
        const stack = this.getStack(stackName)

        if(!stack) return null

        if(stack.used === stack.maxIndexes * 32) return null

        stack.data[stack.currentIndex] = value
        stack.currentIndex++
        stack.used += 32
    }

    popAtStack(stackName) {
        const stack = this.getStack(stackName)

        if(!stack) return null
        if(stack.used === 0) return null

        stack.data[stack.currentIndex] = __FREE_BYTES__
        stack.used -= 32
        stack.currentIndex--
    }

    createHeap(size) {
        const heap = {
            size,
            data: Array(size / 32).fill(__FREE_BYTES__),
            used: 0,
            currentIndex: 0,
            maxIndexes: size / 32
        }

        this.usedRam += size

        return heap
    }

    boot() {
        console.log("Booting...")
        setTimeout(() => {
            const source = fs.readFileSync(this.path + "/booter/bootloader.pk", "utf8")
            this.cpu.runProgram(source, this.path + "/booter/")
            console.log("Booted...")
        }, 2500)
    }
}

module.exports = Computer