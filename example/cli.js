var client = require('../').client

var myapi
async function tst() {
	console.log("test call")
	await myapi.test2()
	.catch(function (err) {
		console.log(err)
	})
	console.log("test done")
	setTimeout(tst, 2000)
}

(async function () {
	var boot = await client.init('ws://localhost:3082')
	myapi = await boot.login("admin", "admin")
	tst()
})()
.catch(function (err) {
	console.log(err)
})
