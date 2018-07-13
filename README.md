# ClearThru

Doing Remote Promise Calls over WebSocket. 

## Features:
* Wrap Js Classes (```extends clearthru.API```) server-side and expose its methods that will be callable from the client.
* Server Methods can instantiate new ```clearthru.API``` Objects that could be returned to the client. This allows scoped APIs in an Object-Oriented pattern.
* Scalable. Server could be shutted off and the client would keep its state and try to resume connection. On a successful connection, even with a new server instance, the client objects APIs will restore their context and resume normal operation.

## Documentation

TODO

### Server

```javascript
//require the server
var clearthru = require('clearthru').server

//Define an API
class MyAPI extends clearthru.API {
  method2() {
  }
}
// This register an object
clearthru.register(MyAPI)

class Boot extends clearthru.API {
  method1() {
      return new MyAPI()
  }
}
// This register the bootstrap object 
clearthru.bootstrap(Boot)

...

//Create a http server
var server = http.createServer(app)
//Attach clearthru to the server
clearthru.attach(server, SECRETKEY)

```

### Client

```javascript
// Require the client
var client = require('clearthru').client

// Connect to the server
var boot = await client.init('ws://localhost:3082')
// boot is now mapped to an instance of Boot on the server

// Call a method as a Promise
var api = await boot.method1()
// In this example, api will map to an instance of MyAPI on the server

await api.method2()


```

## Example

Look in the example folder. First, run ```npm install``` in the root folder and in example folder.

```bash
cd example
node svr.js # This will start a server demo
# Either you browse http://localhost:3082 or you run:
node cli.js # a client demo
```