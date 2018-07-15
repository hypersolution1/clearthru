var WebSocket = require('ws')
var encryptor

function randomId() {
	return ("00000000000" + Math.random().toString(36).substring(2)).substr(-11,11)
}

var ClearThruAPI = exports.API = class {
	__new(instKey, ctx, args, emitFn, createFn) {
		this._instKey = instKey
		this._ctx = JSON.parse(JSON.stringify(ctx))
		this._args = JSON.parse(JSON.stringify(args))
		this.emit = (event, data) => {
			if (this._marked_unlink) {
				throw new Error("Instance Unlinked")
			}
			return emitFn(this._instKey, event, data)
		}
		this.create = (clsname, ...args) => {
			if (this._marked_unlink) {
				throw new Error("Instance Unlinked")
			}
			return createFn(this._ctx, clsname, args)
		}
		return this._init(...args)
	}
	_init() {
	}
	_unlink() {
	}
	__unlink() {
		this._marked_unlink = true
		return this._unlink()
	}
	_invoke(fn, args) {
		if (this._marked_unlink) {
			throw new Error("Instance Unlinked")
		}
		return this[fn].apply(this, args)
	}
	get ctx() {
		return this._ctx
	}
	getInstKey() {
		return this._instKey
	}
	toJSON() {
		if (this._marked_unlink) {
			throw new Error("Instance Unlinked")
		}
		var name = this.constructor.name
		var instKey = this._instKey
		var ctx = this._ctx
		var args = this._args
		return {
			__clearthru_api: {
				name,
				instKey,
				apiToken: encryptor.encrypt({ name, instKey, ctx, args }),
				fns: Object.getOwnPropertyNames(Object.getPrototypeOf(this)).filter(fn => ((fn != "constructor") && (fn[0] != "_"))),
			}
		}
	}
}

var classes = {}
var bootstrap_className

var register = exports.register = function (cls) {
	if (!(cls.prototype instanceof ClearThruAPI)) {
		throw new Error("Class must extends clearthru.API")
	}
	classes[cls.name] = cls
}

exports.bootstrap = function (cls) {
	register(cls)
	bootstrap_className = cls.name
}

//*****************************************************************************

function on_connection(ws) {

	var instances = {}

	function apiEmit(instKey, event, data) {
		try {
			var __clearthru_msg = { instKey, event, data }
			ws.send(JSON.stringify({ __clearthru_msg }))
		} catch (err) {
			ws.close()
			throw err
		}
	}

	async function apiCreate(parentCtx, clsname, args) {
		var inst = new classes[clsname]()
		var instKey = randomId()
		await inst.__new(instKey, {...parentCtx}, args, apiEmit, apiCreate)
		instances[instKey] = inst
		return inst
	}

	async function apiRestore(instKey, ctx, clsname, args) {
		var inst = new classes[clsname]()
		await inst.__new(instKey, ctx, args, apiEmit, apiCreate)
		instances[instKey] = inst
		return inst
	}

	var staticFns = {
		restore: function (objs) {
			objs.map(obj => {
				var apiToken = encryptor.decrypt(obj.apiToken)
				if (!apiToken) {
					throw new Error("Invalid Token")
				}
				if (obj.instKey != apiToken.instKey || obj.name != apiToken.name) {
					throw new Error("Token Mismatch")
				}
				apiRestore(apiToken.instKey, apiToken.ctx, apiToken.name, apiToken.args)
			})
		},
		unlink: async function (instKey) {
			if (instances[instKey]) {
				await instances[instKey].__unlink()
				delete instances[instKey]
			}
		},
		bootstrap: function () {
			//return new bootstrap_class()
			return apiCreate({}, bootstrap_className, [])
		}
	}

	function clearthru_call(obj) {
		var { id, instKey, fnname, args } = obj
		var __clearthru_reply = { id }
		Promise.resolve()
		.then(function () {
			if (!instKey) {
				if (!staticFns[fnname]) {
					throw new Error("Bad instance/method name")
				}
				return staticFns[fnname].apply(this, args)
			} else {
				if (!instances[instKey] || !instances[instKey][fnname]) {
					throw new Error("Bad instance/method name")
				}
				return instances[instKey]._invoke(fnname, args)
			}
		})
		.then(function (ret) {
			__clearthru_reply.resolve = ret
			try {
				ws.send(JSON.stringify({ __clearthru_reply }))
			} catch (err) {
				ws.close()
			}
		})
		.catch(function (err) {
			//console.log("clearthru_call catch", err)
			__clearthru_reply.reject = err.message || err
			try {
				ws.send(JSON.stringify({ __clearthru_reply }))
			} catch (err) {
				ws.close()
			}
		})
	}

	ws.on('message', function (message) {
		Promise.resolve()
		.then(function () {
			var obj = JSON.parse(message)
			if (obj) {
				if (obj.__clearthru_call) {
					return clearthru_call(obj.__clearthru_call)
				}
			}
		})
		.catch(function (err) {
			console.log("ws.on message", err)
		})
	})

	ws.on('close', async function () {
		await Promise.all(Object.values(instances).map(inst => {
			return inst.__unlink()
		}))
		instances = null
		//console.log("close")
	})
}

exports.attach = function (server, integrityKey) {
	encryptor = require('simple-encryptor')(integrityKey);
	var wss = new WebSocket.Server({ server })
	wss.on('connection', on_connection)
}
