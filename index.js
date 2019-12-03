exports.server = require('./clearthru-server')
exports.client = require('./clearthru-client')(require('ws'), require('events').EventEmitter)

exports.browserClient = function () {
  var asset
  return function (req, res, next) {
    if (req.originalUrl === '/clearthru-client') {
      if(!asset) {
        var browserify = require('browserify')
        var b = browserify()
        b.require(`${__dirname}/browser.js`, {expose: 'clearthru'})
        b.bundle((err, data) => {
          asset = data
          res.writeHead(200, {"Content-Type": "application/javascript"})
          res.end(asset)
        })
      } else {
        res.writeHead(200, {"Content-Type": "application/javascript"})
        res.end(asset)
      }
    } else {
      next()
    }
  }
}