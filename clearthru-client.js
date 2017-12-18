var io = require('socket.io-client')

var RemoteError = exports.RemoteError = class extends Error {
	constructor(error) {
		super(error.message || error);
		this.remote = error;
		this.name = 'RemoteError';
	}
}

var BadInstanceError = exports.BadInstanceError = class extends Error {
	constructor() {
		super('BadInstanceError');
		this.name = 'BadInstanceError';
	}
}

var CommunicationError = exports.CommunicationError = class extends Error {
	constructor() {
		super('CommunicationError');
		this.name = 'CommunicationError';
	}
}

exports.connect = function (host) {


	var socket = io(host, {
		transports: ['websocket'],
		parser: require('socket.io-msgpack-parser')
	})

	var isConnected = false

	var instances = {}

	socket.on('connect', function () {
		socket.emit("clearthru_instances", instances, function (reply) {
			if(reply.resolve) {
				isConnected = true
			} else {
				console.log("Contexts rejected", reply.reject)
				instances = {}
			}
		})
	})
	socket.on('disconnect', function () {
		isConnected = false
	})


	function apifn(fnname, instKey) {
		return function () {
			var args = Array.from(arguments)
			return new Promise(function (resolve, reject) {
				if(instKey && !instances[instKey]) {
					reject(new Error("BadInstanceError"))
				//} else if (!isConnected) {
				//	reject(new CommunicationError())
				} else {
					function onDisconnect () {
						socket.off('disconnect', onDisconnect)
						reject(new CommunicationError())
					}
					socket.on('disconnect', onDisconnect)
					socket.emit("clearthru_call", instKey, fnname, args, function (reply) {
						socket.off('disconnect', onDisconnect)
						if(reply.reject) {
							reject(new RemoteError(reply.reject))
						} else {
							resolve(parse(reply.resolve))
						}
					})
				}
			})
		}
	}

	function parse_clearapi(obj) {
		var api = {}
		instances[obj.instKey] = obj
		obj.fns.forEach(function (fnname) {
			api[fnname] = apifn(fnname, obj.instKey)
		})
		return api
	}

	function parse(obj) {
	    if (typeof(obj) === 'object') {
			if(obj.__clearapi) {
				return parse_clearapi(obj.__clearapi)
			} else {
			    Object.keys(obj).forEach(function (key) {
		       		obj[key] = parse(obj[key])
			    })
			}
	    }
	   	return obj
	}

	return apifn('bootstrap')()

}
