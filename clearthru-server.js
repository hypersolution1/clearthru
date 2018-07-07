var WebSocket = require('ws')
var encryptor

function rndStr() {
  return ""+Math.random().toString(36).substr(2)
}

var ClearThruAPI = exports.API = class {
	constructor(ctx, instKey) {
		this.ctx = ctx
		this.instKey = instKey || rndStr()
		this.initAsync = Promise.resolve()
		.then(() => {
			return this._init()
		})
		.then(() => {
			this.initAsync = null
		})
		.catch((err) => {
			this.initAsync = err
		})
	}
	_init() {
	}
	_unlink() {
	}
	__unlink() {
		this._marked_unlink = true
		this._ws = null
		return this._unlink()
	}
	_invoke(fn, args) {
		if(this._marked_unlink) {
			throw new Error("Instance Unlinked")
		}
		if(this.initAsync instanceof Promise) {
			this.initAsync = this.initAsync.then(() => {
				if(this.initAsync) {
					throw this.initAsync 
				}
				return this[fn].apply(this, args)
			})
			return this.initAsync
		} else if(this.initAsync) {
			throw this.initAsync
		}
		return this[fn].apply(this, args)
	}
	_registerWS(ws) {
		this._ws = ws
	}
	emit(event, data) {
		if(this._marked_unlink) {
			throw new Error("Instance Unlinked")
		}
		if(this._ws) {
			try {
				var __clearthru_msg = {
					instKey: this.instKey,
					event,
					data
				}
				this._ws.send(JSON.stringify({ __clearthru_msg }))
			} catch (err) {
				this._ws.close()
				throw err
			}
		}
	}
	getCtx() {
		return this.ctx
	}
	getInstKey() {
		return this.instKey
	}
	toJSON() {
		if(this._marked_unlink) {
			throw new Error("Instance Unlinked")
		}
		return {
			__clearthru_api: {
				name: this.constructor.name,
				fns: Object.getOwnPropertyNames(Object.getPrototypeOf(this)).filter(fn => ((fn != "constructor") && (fn[0] != "_")) ),
				ctxToken: encryptor.encrypt({ ctx: this.ctx }),
				instKey: this.instKey
			}
		}
	}
}

var classes = {}
var bootstrap_class

var register = exports.register = function (cls) {
	if(!(cls.prototype instanceof ClearThruAPI)) {
		throw new Error("Class must extends clearthru.API")
	}
	classes[cls.name] = cls
}

exports.bootstrap = function (cls) {
	register(cls)
	bootstrap_class = cls
}

//*****************************************************************************

function on_connection(ws) {
	//console.log("connected")
	
	var instances = {}

	function scanForInstances(obj) {
	    if ((typeof obj === "object") && (obj !== null)) {
	    	if(obj instanceof ClearThruAPI) {
	    		if(!instances[obj.getInstKey()]) {
						instances[obj.getInstKey()] = obj
						obj._registerWS(ws)
	    		}
	    	} else {
					Object.keys(obj).forEach(function (key) {
						scanForInstances(obj[key])
				 })
				}
	    }
	}

	var staticFns = {
		restore: function (objs) {
			objs.map(obj => {
				var ctxToken = encryptor.decrypt(obj.ctxToken)
				if(!ctxToken) {
					throw new Error("invalid Token")
				}
				instances[obj.instKey] = new classes[obj.name](ctxToken.ctx, obj.instKey)
				instances[obj.instKey]._registerWS(ws)
			})	
		},
		unlink: async function (instKey) {
			if(instances[instKey]) {
				await instances[instKey].__unlink()
				delete instances[instKey]
			}
		},
		bootstrap: function () {
			return new bootstrap_class()
		}
	}

	function clearthru_call(obj) {
		var {id, instKey, fnname, args} = obj
		var __clearthru_reply = { id }
		Promise.resolve()
		.then(function () {
			if(!instKey) {
				if(!staticFns[fnname]) {
					throw new Error("Bad instance/method name")
				}
				return staticFns[fnname].apply(this, args)
			} else {
				if(!instances[instKey] || !instances[instKey][fnname]) {
					throw new Error("Bad instance/method name")
				}
				return instances[instKey]._invoke(fnname, args)
			}
		})
		.then(function (ret) {
			scanForInstances(ret)
			__clearthru_reply.resolve = ret
			try {
				ws.send(JSON.stringify({ __clearthru_reply }))
			} catch (err) {
				ws.close()
			}
		})
		.catch(function (err) {
			console.log(err)
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
			if(obj) {
				if(obj.__clearthru_call) {
					return clearthru_call(obj.__clearthru_call)
				}
			}
		})
		.catch(function (err) {
			console.log("ws.on message", err)
		})
	})

	ws.on('close', function () {
		instances = {}
		//console.log("close")
	})
}

exports.attach = function (server, integrityKey) {
	encryptor = require('simple-encryptor')(integrityKey);
	var wss = new WebSocket.Server({ server })
	wss.on('connection', on_connection)
}
