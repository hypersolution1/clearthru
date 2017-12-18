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
			__clearapi: {
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

	function clearthru_instances(insts) {
		Object.values(insts).map(inst => {
			instances[inst.instKey] = new classes[inst.name](inst.ctx, inst.instKey)
		})			
		cb({resolve:1})
	}

    ws.on('message', function (message) {
        console.log('received:', message)
        Promise.resolve()
        .then(function () {
        	var obj = JSON.parse(message)
        	if(obj) {
        		if(obj.__clearthru_instances) {
        			return clearthru_instances(obj.__clearthru_instances.insts)
        		}
        	}
        })
		.catch(function (err) {
			console.log("ws.on message", err)
		})
    })

	client.on('clearthru_call', function(instKey, fnname, args, cb) {
		Promise.resolve()
		.then(function () {
			if(!instKey) {
				return new bootstrap_class()
			} else {
				if(!instances[instKey] || !instances[instKey][fnname]) {
					throw new Error("Bad instance/method name")
				}
				//return instances[instKey][fnname].apply(instances[instKey], args)
				return instances[instKey].invoke(fnname, args)
			}
		})
		.then(function (ret) {
			scanForInstances(ret)
			cb({resolve:ret})
		})
		.catch(function (err) {
			console.log(err)
			cb({reject:err.message || err})
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
    /*
    wss.on('connection', function (ws, req) {

        ws.on('message', function (message) {
            console.log('received: %s', message)
        })

        ws.send('something')
    })*/
}
