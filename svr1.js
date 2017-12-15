#!/usr/bin/env node
var Promise = require("bluebird");

var http = require('http');

var fs = require('fs');
fs.readFileAsync = fs.readFileAsync || Promise.promisify(fs.readFile);
fs.writeFileAsync = fs.writeFileAsync || Promise.promisify(fs.writeFile);
fs.appendFileAsync = fs.appendFileAsync || Promise.promisify(fs.appendFile);

//*****************************************************************************
// Configs
//*****************************************************************************

/* istanbul ignore next */
var port = +process.env.PROJ_PORT || 3082;

/* istanbul ignore next */
//var dbUrl = process.env.PROJ_DBURL || 'mongodb://localhost:27017/test';

//*****************************************************************************
// Web API
//*****************************************************************************

var connect = require('connect');

var app = connect();

//test
exports.app = app;

var compression = require('compression');
app.use(compression());

var bodyParser = require('body-parser');
app.use(bodyParser.json());

//*****************************************************************************

var clearthru = require('./clearthru-server')

class MyAPI extends clearthru.API {
	async test() {
		console.log("MyAPI.test() called", this.getInstKey(), this.getCtx())
	}
	async test2() {
		console.log("MyAPI.test2() called", super.getInstKey())
		return Promise.delay(2000)
	}
}
clearthru.register(MyAPI)

class Boot extends clearthru.API {
	login(user, password) {
		console.log("Boot.login() called")
		if(user == "admin" && password == "admin") {
			return new MyAPI({user:user})
		}
		throw new Error("Invalid credentials")
	}
}
clearthru.bootstrap(Boot)


//*****************************************************************************
// Process Entry point
//*****************************************************************************

/* istanbul ignore next */
process.on('unhandledRejection', (err) => { 
  console.error('!!! unhandledRejection !!!', err)
  process.exit(1)
})

/* istanbul ignore next */
process.on('SIGINT', () => {
	process.exit();
});

(async function (){

	//var config = JSON.parse(await fs.readFileAsync('config.json', 'utf8'));

	var server = http.createServer(app)

	clearthru.attach(server)

	server.listen(port, function () {
		var host = server.address().address
		var port = server.address().port
		console.log('listening at http://%s:%s', host, port)
		//test
		app.emit("listening")
	});

	//test
	exports.close = async function () {
		await new Promise (function (resolve) {
			server.close(resolve)
		})
	}
	
})()
.catch(/* istanbul ignore next */ function (err) {
	console.log(err.stack || err)
	process.exit();
})
