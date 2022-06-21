const { app, BrowserWindow, screen, ipcMain } = require('electron')
const config = { "vm": 3050 }

function createWindow (){
	
	const win = new BrowserWindow({
		width: 1920,
		height: 1080,
		x: 0,
		y: 0,
		frame: false,
		minimizable: true,
		maximizable: true,
		movable: true,
		resizable: true,
		transparent: true,
		webPreferences: {
			nodeIntegration: true
		},
		icon: __dirname + '/public/favicon.ico',
	})

	win.loadFile('index.html')
}

app.on('ready', () => createWindow())

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})