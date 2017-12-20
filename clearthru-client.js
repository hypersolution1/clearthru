var WebSocket = require('ws');

function delay(ms) {
	return new Promise(function (resolve) {
		setTimeout(resolve, ms)
	})
}

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

function clearthru_revive(obj) {
	var api = {}
	instances[obj.instKey] = obj
	obj.fns.forEach(function (fnname) {
		api[fnname] = apifn(fnname, obj.instKey)
	})
	return api
}

function clearthru_scan(obj) {
    if (typeof(obj) === 'object') {
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
			return
		}
		ctx.resolve(clearthru_scan(reply.resolve))
	}
}

function on_message(message) {
    Promise.resolve()
    .then(function () {
    	var obj = JSON.parse(message.data)
    	if(obj) {
    		if(obj.__clearthru_reply) {
    			return clearthru_reply(obj.__clearthru_reply)
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
			client.send(JSON.stringify({__clearthru_call:ctx.__clearthru_call}))
			ctx.pending = true
		})
		.then(function () {
			process_calls()
		})
		.catch(function (err) {
			callQueue.unshift(ctx)
			if(client) {
				client.close()
			}
		})
	}
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
		process_calls()
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
		var id = rndStr()
		var __clearthru_call = {id, fnname:"restore", args:[insts]}
		callCtx[id] = {resolve, reject, __clearthru_call, pending:true}
		try {
			client.send(JSON.stringify({__clearthru_call}))
		} catch (err) {
			reject(err)
		}
	})	
}

function connect() {
	return new Promise(function (resolve, reject) {
		try {
			var ws = new WebSocket(host)
		} catch (err) {
			reject(err)
		}
		ws.onopen = function () {
			resolve(ws)
		}
		ws.onerror = function (err) {
			reject(err)
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


function reconnect() {
	return connect()
	.then(function (ws) {
		client = ws
		client.onmessage = on_message
		client.onclose = on_close
		return clearthru_restore(instances)
	})
	.then(function () {
		process_calls()
	})
	.catch(function (err) {
		var sec = delay_next()
		return delay(sec * 1000)
		.then(reconnect)
	})
}

function on_close() {
	client = null
	shoot_pendings()
	delay_reset()
	reconnect()
}

exports.init = function (h) {

	host = h
	return reconnect()
	.then(function () {
		return apifn('bootstrap')()
	})

}
