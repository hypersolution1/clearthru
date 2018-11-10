exports.client = require('./clearthru-client')(window.WebSocket || window.MozWebSocket, require('wolfy87-eventemitter'))
