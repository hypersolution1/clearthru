
function rndStr() {
    return ""+Math.random().toString(36).substr(2)
}

var ClearThruAPI = exports.API = class {
	constructor(ctx, instKey) {
		this.ctx = ctx
		this.instKey = instKey || rndStr()
		this.initPromise = this.init().then(() => {
			this.initPromise = null
		})
	}
	_init() {
		return Promise.resolve()
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

function on_connection(client) {
	console.log("connected")
	
	var instances = {}

	function scanForInstances(obj) {
	    if (typeof(obj) === 'object') {
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

	client.on('clearthru_instances', function(insts, cb) {
		Promise.resolve()
		.then(() => {
			return Promise.all(Object.values(insts).map(inst => {
				instances[inst.instKey] = new classes[inst.name]()
				return instances[inst.instKey](inst.ctx, inst.instKey)
			}))
		})
		.then(function () { 
			cb({resolve:1})
		})
		.catch(function () {
			instances = {}
			cb({reject:1})
		})
	})

	client.on('clearthru_call', function(instKey, fnname, args, cb) {
		Promise.resolve()
		.then(function () {
			if(!instKey) {
				return new bootstrap_class()
			} else {
				if(!instances[instKey] || !instances[instKey][fnname]) {
					cb({reject:"Bad instance/method name"})	
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
			cb({reject:err.message || err})
		})
	})


	client.on('disconnect', function () {
		instances = {}
		console.log("disconnect")
	})
}

exports.attach = function (server) {
	var io = require('socket.io')(server, {
		parser: require('socket.io-msgpack-parser')
	})
	io.on('connection', on_connection)
}

