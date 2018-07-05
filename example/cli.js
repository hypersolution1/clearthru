(async function () {

	var client = require('../').client

	client.onRestoreFailed(function (err) {
		console.log(err)
		process.exit(0)
	})

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

	var boot = await client.init('ws://localhost:3082')
	myapi = await boot.login("admin", "admin")
	myapi.on('testmsg', data => {
		console.log('testmsg: ' + JSON.stringify(data, null, 2))
	})
	tst()

})()
.catch(function (err) {
	console.log(err)
	process.exit(0)
})
