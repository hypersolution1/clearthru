
var client = require('./clearthru-client')


var myapi
async function tst() {
	console.log("test call")
	await myapi.test()
	.catch(function (err) {
		console.log(err)
	})
	console.log("test done")
	setTimeout(tst, 2000)
}
/*
client.connect('http://localhost:3082')
.then(function (server) {
	return server.login("admin", "admin")
})
.then(function (obj) {
	myapi = obj
	tst()
})
.catch(function (err) {
	console.log(err)
})
*/

(async function () {
	var boot = await client.connect('http://localhost:3082')
	myapi = await boot.login("admin", "admin")
	tst()
})()
.catch(function (err) {
	console.log(err)
})
