var WebSocket = require('ws')

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
		return Promise.resolve()
	}
	invoke(fn, args) {
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
	getCtx() {
		return this.ctx
	}
	getInstKey() {
		return this.instKey
	}
	toJSON() {
		return {
			__clearthru_api: {
				name: this.constructor.name,
				fns: Object.getOwnPropertyNames(Object.getPrototypeOf(this)).filter(fn => ((fn != "constructor") && (fn != "_init")) ),
				ctx: this.ctx,
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
	console.log("connected")
	
	var instances = {}

	function scanForInstances(obj) {
	    if ((typeof obj === "object") && (obj !== null)) {
	    	if(obj instanceof ClearThruAPI) {
	    		if(!instances[obj.getInstKey()]) {
	    			instances[obj.getInstKey()] = obj
	    		}
	    	}
		    Object.keys(obj).forEach(function (key) {
	       		scanForInstances(obj[key])
		    })
	    }
	}

	var staticFns = {
		restore: function (insts) {
			Object.values(insts).map(inst => {
				instances[inst.instKey] = new classes[inst.name](inst.ctx, inst.instKey)
			})	
		},
		bootstrap: function () {
			return new bootstrap_class()
		}
	}

	function clearthru_call(obj) {
		var {id, instKey, fnname, args} = obj
		var __clearthru_reply = {id}
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
				return instances[instKey].invoke(fnname, args)
			}
		})
		.then(function (ret) {
			scanForInstances(ret)
			__clearthru_reply.resolve = ret
			try {
				ws.send(JSON.stringify({__clearthru_reply}))
			} catch (err) {
				ws.close()
			}
		})
		.catch(function (err) {
			console.log(err)
			__clearthru_reply.reject = err.message || err
			try {
				ws.send(JSON.stringify({__clearthru_reply}))
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
		console.log("close")
	})
}

exports.attach = function (server) {
    var wss = new WebSocket.Server({ server })
    wss.on('connection', on_connection)
}
