(async function () {

	var client = require('../').client

	client.on('restoreFailed', function (err) {
		console.log(err)
		process.exit(0)
  })
  client.on('connect', function (err) {
    console.log('connect')
  })
  client.on('disconnect', function (err) {
    console.log('disconnect')
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

	async function tst2() {
		console.log("create obj")
		var myapi = await boot.login("admin", "admin")
		myapi.on('testmsg', data => {
			console.log('testmsg: ' + JSON.stringify(data, null, 2))
		})
		await myapi.test2()
		.catch(function (err) {
			console.log(err)
		})
		await client.unlink(myapi)
		myapi = null
		console.log("test done")
		setTimeout(tst2, 2000)
	}

	var boot = await client.init('ws://localhost:3082')
	//myapi = await boot.login("admin", "admin")
	// myapi.on('testmsg', data => {
	// 	console.log('testmsg: ' + JSON.stringify(data, null, 2))
	// })
	//tst()
	tst2()

})()
.catch(function (err) {
	console.log(err)
	process.exit(0)
})
