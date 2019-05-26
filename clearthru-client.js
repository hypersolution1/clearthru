var BSON = require('bson')
var bson = new BSON()

module.exports = function (WebSocket, EventEmitter) {
	var exports = new EventEmitter()

	var RemoteError = exports.RemoteError = class extends Error {
		constructor(error) {
			super(error.message || error.name || error);
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

	var UnlinkedError = exports.UnlinkedError = class extends Error {
		constructor() {
			super('UnlinkedError');
			this.name = 'UnlinkedError';
		}
	}

	var CommunicationError = exports.CommunicationError = class extends Error {
		constructor(error) {
			super(error.message || error.name || error || 'CommunicationError');
			this.detail = error;
			this.CommunicationError = true;
			this.name = 'CommunicationError';
		}
	}
	var ConnectionError = exports.ConnectionError = class extends CommunicationError {
		constructor() {
			super('ConnectionError');
			this.name = 'ConnectionError';
		}
	}
	var CanceledError = exports.CanceledError = class extends CommunicationError {
		constructor() {
			super('CanceledError');
			this.name = 'CanceledError';
		}
	}
	var ReplyError = exports.ReplyError = class extends CommunicationError {
		constructor() {
			super('ReplyError');
			this.name = 'ReplyError';
		}
	}

	var host, client
	var instances = {}
	var callCtx = {}
	var callQueue = []

	var throwUnlinkErr = function () {
		throw new UnlinkedError()
	}

	function clearthru_revive(obj) {
		var inst = { __clearthru_api: obj, __clearthru_events:{} }
		instances[obj.instKey] = inst
		//
		inst.__clearthru_unlink = function () {
			delete instances[obj.instKey]
			inst.__clearthru_events = null
			inst.on = throwUnlinkErr
			inst.off = throwUnlinkErr
			obj.fns.forEach(function (fnname) {
				inst[fnname] = throwUnlinkErr
			})
		}
		//
		inst.on = function (ev, fn) {
			var event = inst.__clearthru_events[ev] || (inst.__clearthru_events[ev] = [])
			if(!event.includes(fn)) {
				event.push(fn)
			}
		}
		inst.off = function (ev, fn) {
			var event = inst.__clearthru_events[ev] || (inst.__clearthru_events[ev] = [])
			if(!fn) {
				event = []
			} else {
				var idx = event.indexOf(fn)
				if(idx > -1) {
					event.splice(idx, 1)
				}
			}
		}
		//
		obj.fns.forEach(function (fnname) {
			inst[fnname] = apifn(fnname, obj.instKey)
		})
		return inst
	}

	function clearthru_scan(obj) {
		if (obj !== null && typeof(obj) === 'object') {
			if(obj.__clearthru_api) {
				return clearthru_revive(obj.__clearthru_api)
			} else {
			    Object.keys(obj).forEach(function (key) {
		       		obj[key] = clearthru_scan(obj[key])
			    })
			}
	  }
	  return obj
	}

	function clearthru_reply(reply) {
		var ctx = callCtx[reply.id]
		if(ctx) {
			delete callCtx[reply.id]
			if(reply.reject) {
				ctx.reject(new RemoteError(reply.reject))
			} else {
				ctx.resolve(clearthru_scan(reply.resolve))
			}
		}
	}

	function clearthru_msg(msg) {
		var inst = instances[msg.instKey]
		if(inst) {
			var fns = inst.__clearthru_events[msg.event]
			if(fns && fns.length) {
				fns.forEach(fn => fn(msg.data))
			}
		}
	}

	function clearthru_apiToken(msg) {
		var inst = instances[msg.instKey]
		if(inst) {
			inst.__clearthru_api.apiToken = msg.apiToken
		}
	}

	function on_message(message) {
	    Promise.resolve()
	    .then(function () {
        var obj = bson.deserialize(Buffer.from(message.data), { promoteBuffers: true })
	    	if(obj) {
	    		if(obj.__clearthru_reply) {
	    			return clearthru_reply(obj.__clearthru_reply)
	    		}
					if(obj.__clearthru_msg) {
						return clearthru_msg(obj.__clearthru_msg)
					}
					if(obj.__clearthru_apiToken) {
						return clearthru_apiToken(obj.__clearthru_apiToken)
					}
	    	}
	    })
		.catch(function (err) {
			console.log("client.on message", err)
		})
	}

	function cancel_calls() {
		callQueue.forEach(function (ctx) {
			ctx.reject(new CanceledError())
			delete callCtx[ctx.id]
		})
	}

	function shoot_pendings() {
		for(var i in callCtx) {
			var ctx = callCtx[i]
			if (ctx.pending) {
				ctx.reject(new ReplyError())
				delete callCtx[ctx.id]
			}
		}
	}

	function process_calls() {
		if(!client) {
			return
		}
		var ctx = callQueue.shift()
		if(ctx) {
			Promise.resolve()
			.then(function () {
				client.send(bson.serialize({__clearthru_call:ctx.__clearthru_call}), { binary: true })
				ctx.pending = true
			})
			.then(function () {
				process_calls()
			})
			.catch(function (err) {
				//callQueue.unshift(ctx)
				ctx.reject(new CommunicationError(err))
				delete callCtx[ctx.id]
				if(client) {
					client.close()
				}
			})
		}
	}

	function call_loop() {
		return Promise.resolve()
		.then(function () {
			return process_calls()
		})
		.then(function () {
			return new Promise(function (resolve) {
				function resume() {
					delay_reset()
					exports.removeListener('_internal_connect', resume)
					exports.removeListener('_internal_call', resume)
					resolve()
				}
				exports.on('_internal_connect', resume)
				exports.on('_internal_call', resume)
			})
		})
		.then(call_loop)
	}

	function rndStr() {
	    return ""+Math.random().toString(36).substr(2)
	}

	function clearthru_call(instKey, fnname, args) {
		return new Promise(function (resolve, reject) {
			if(instKey && !instances[instKey]) {
				reject(new BadInstanceError())
			}
			var id = rndStr()
			var __clearthru_call = {id, instKey, fnname, args}
			callCtx[id] = {resolve, reject, __clearthru_call}
			callQueue.push(callCtx[id])
			exports.emit('_internal_call')
		})
	}

	function apifn(fnname, instKey) {
		return function () {
			var args = Array.from(arguments)
			return clearthru_call(instKey, fnname, args)
		}
	}

	function clearthru_restore(insts) {
		return new Promise(function (resolve, reject) {
			var objs = Object.values(insts).map(inst => inst.__clearthru_api)
			var id = rndStr()
			var __clearthru_call = {id, fnname:"restore", args:[objs]}
			callCtx[id] = {resolve, reject, __clearthru_call, pending:true}
			try {
				client.send(bson.serialize({__clearthru_call}), { binary: true })
			} catch (err) {
				reject(err)
			}
		})	
	}

	function connect() {
		return new Promise(function (resolve, reject) {
			try {
				var ws = new WebSocket(host)
				ws.binaryType = 'arraybuffer'
			} catch (err) {
				reject(err)
			}
			ws.onopen = function () {
				resolve(ws)
			}
			ws.onerror = function (err) {
				reject(new ConnectionError(err))
			}
		})
	}

	var delay_fib = [0,1]
	function delay_next() {
		var [f0,f1] = delay_fib
		var next = ((f0+f1)>30) ? 30 : (f0+f1)
		delay_fib.push(next)
		delay_fib.shift()
		return next
	}
	function delay_reset() {
		delay_fib = [0,1]
	}


	function connect_delay(ms) {
		return new Promise(function (resolve) {
			var tm = setTimeout(resolve, ms)
			function resume() {
				delay_reset()
				exports.removeListener('_internal_call', resume)
				clearTimeout(tm)
				resolve()
			}
			exports.on('_internal_call', resume)

		})
	}

	function reconnect() {
		return connect()
		.then(function (ws) {
			client = ws
			client.onmessage = on_message
			client.onclose = on_close
			return clearthru_restore(instances)
		})
		.then(function () {
			exports.emit('connect')
			exports.emit('_internal_connect')
		})
		.catch(function (err) {
			if(err.name == "ConnectionError") {
				var sec = delay_next()
				return connect_delay(sec * 1000)
				.then(reconnect)
			} else {
				throw err
			}
		})
	}

	function on_close() {
		client = null
		shoot_pendings()
		exports.emit('disconnect')
		reconnect()
		.catch(function (err) {
			exports.emit('restoreFailed', err)
		})
	}

	exports.unlink = function (inst) {
		if (typeof(inst) === 'object' && inst.__clearthru_api) {
			inst.__clearthru_unlink()
			return apifn('unlink')(inst.__clearthru_api.instKey)
		}
	}

	exports.getName = function (inst) {
		if (typeof(inst) === 'object' && inst.__clearthru_api) {
			return inst.__clearthru_api.name
		}
	}

	exports.init = function (h) {

		host = h
		return reconnect()
		.then(function () {
			return apifn('bootstrap')()
		})

	}

	call_loop()

	return exports
}

