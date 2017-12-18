var WebSocket = require('ws');

var ws = new WebSocket('ws://localhost:3082/');

ws.on('open', function () {
  ws.send('something');
});

ws.on('message', function (data) {
  console.log(data);
});


var client = require('./clearthru-client2')


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

(async function () {
	var boot = await client.connect('http://localhost:3082')
	myapi = await boot.login("admin", "admin")
	tst()
})()
.catch(function (err) {
	console.log(err)
})
