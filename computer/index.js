// Importing all required Modules
const { Computer } = require("../src/index")

const computer = new Computer({
    ram: 64 * 1024, // 64KB
    path: __dirname,
    additionalApi: {
        printToConsole(stack) {
            console.log(String.fromCharCode(parseInt(stack.data[stack.currentIndex - 1], 2)))
        }
    }
})

computer.boot()