#!/usr/bin/env node
var http = require('http')

//*****************************************************************************
// Configs
//*****************************************************************************

/* istanbul ignore next */
var port = +process.env.PROJ_PORT || 3082

//*****************************************************************************
// Web API
//*****************************************************************************

var connect = require('connect')

var app = connect()

//test
exports.app = app

var compression = require('compression')
app.use(compression())

var bodyParser = require('body-parser')
app.use(bodyParser.json())

//*****************************************************************************

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

var clearthru = require('../').server

class MyAPI extends clearthru.API {
  /*_init() {
      console.log("MyAPI long init")
      return delay(5000).then(function () {
          console.log("MyAPI long init done")
      })
  }
  _unlink() {
    console.log("_unlink called on", this.getInstKey(), this.getCtx())
  }*/
  _init() {
    console.log("MyAPI init with event emitter")
    var emittest = () => {
      if(this._marked_unlink) {
        return
      }
      this.emit("testmsg", { hello: "world" })
      return delay(1000).then(emittest)
    }
    emittest()
    .catch((err) => {
      console.log("Stop emitting", err.message)
    })
  }
  _unlink() {
    console.log("_unlink called on", this.getInstKey(), this.getCtx())
  }
  async test() {
    console.log("MyAPI.test() called", this.getInstKey(), this.getCtx())
  }
  async test2() {
    console.log("MyAPI.test2() called", super.getInstKey(), this.getCtx())
    return delay(2000)
  }
}
clearthru.register(MyAPI)

class Boot extends clearthru.API {
  login(user, password) {
    console.log("Boot.login() called")
    if (user == "admin" && password == "admin") {
      return new MyAPI({ user: user })
    }
    throw new Error("Invalid credentials")
  }
}
clearthru.bootstrap(Boot)

var ecstatic = require('ecstatic')
app.use(ecstatic({ root: __dirname + '/public', baseDir: "/", showDir: false, handleError: false }));


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

(async function () {

  //var config = JSON.parse(await fs.readFileAsync('config.json', 'utf8'));

  var server = http.createServer(app)

  clearthru.attach(server, "iwK5smMv2ilCToo8wjVuFFtlsSSQSRmY")

  server.listen(port, function () {
    var host = server.address().address
    var port = server.address().port
    console.log('listening at http://%s:%s', host, port)
    //test
    app.emit("listening")
  });

  //test
  exports.close = async function () {
    await new Promise(function (resolve) {
      server.close(resolve)
    })
  }

})()
  .catch(/* istanbul ignore next */ function (err) {
    console.log(err.stack || err)
    process.exit();
  })
