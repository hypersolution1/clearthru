exports.client = require('./clearthru-client')(window.WebSocket || window.MozWebSocket)