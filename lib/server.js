/*
 * This is the sessionify server class that maintains the database as well as the connections with all the other sessionify clients.
 * */
var events = require('events'),
	nssocket = require('nssocket'),
	util = require('util'),
	Cluster = require('./cluster.js'),
	Database = require('./db.js');

var Server = function Server(_config) {
	if(typeof _config != 'object' || _config == null) _config = {};
	this.config = {
		host: typeof _config.host == 'string' ? _config.port : process.env.NODE_HOST || '127.0.0.1',
		port: typeof _config.port == 'number' ? _config.port : parseInt(process.env.NODE_PORT) || 18755,
		secret: typeof  _config.secret == 'string' ? _config.secret : "",
		master: null
	};
	this.isMaster = true;
	if(typeof _config.master == 'object' && _config.master != null) {
		if(typeof _config.master.host != 'string' || typeof _config.master.port != 'number') throw new Error("Invalid master configuration for host or port.");
		this.config.master = {
			host: _config.master.host,
			port: _config.master.port
		};
		this.isMaster = false;
	}
	this.clients = [];
	this.connection = null;
	this.db = new Database(this.isMaster);
	this.cluster = new Cluster(this);
};

util.inherits(Server, events.EventEmitter);

/*
* Broadcasts an event to all the connected valid clients.
* */
Server.prototype.broadcast = function Broadcast(event, data) {
	for(var i=0; i < this.clients.length; i++) {
		if(!this.clients[i]._connected) continue;
		this.clients[i].send(event, data);
	}
};

/*
* Starts the server, binds the connection and listens for clients.
* */
Server.prototype.listen = function Listen(callback) {
	var self = this;
	this.connection = nssocket.createServer(function(socket) {
		socket.id = self.gid();
		var onError = function OnError(e) {
			socket._connected = false;
			if(socket.type == 'node') {
				self.cluster.removeNode(socket);
			}
			if(socket.type == 'client') {
				for(var i=0; i < self.clients.length; i++) {
					if(self.clients[i].id == socket.id) {
						self.clients.splice(i, 1);
						break;
					}
				}
			}
			socket.destroy();
		};
		socket.on('error', onError);//.on('close', onError);
		self.bindSocket(socket);
	});
	this.connection.on('error', function(e) {
		console.log("ERROR", e);
	});
	this.db.init(function() {
		self.connection.listen(self.config.port, self.config.host, callback);
	});
};

/*
* Binds the socket's events
* */
Server.prototype.bindSocket = function BindSocket(socketObj) {
	var self = this;
	/* We attach an error/success function on the socket. */
	socketObj.error = function SendError(event, message) {
		this.send(event, {
			error: true,
			message: message
		});
	};
	socketObj.success = function SendSuccess(event, data) {
		this.send(event, {
			error: false,
			payload: data
		});
	};
	socketObj.callback = function SendCallback(callback_id, wasOk, payload) {
		this.send(['cb', callback_id], {
			error: !wasOk,
			payload: payload
		});
	};
	socketObj.data('auth', function(d) {
		if(!d || typeof d.host != 'string' || typeof d.port != 'number') {
			return socketObj.error('auth', "Invalid host or port.");
		}
		if(self.config.secret != '' && self.config.secret != d.secret) {
			return socketObj.error('auth', 'Invalid secret key.');
		}
		/*
		 * We bind all the client events.
		 * */
		if(typeof d.type != 'string') return;
		socketObj.__AUTH = true;
		socketObj.type = d.type;
		socketObj._connected = true;
		var payload = {};
		socketObj.success('auth', payload);
		if(d.type == 'client') {
			self.bindClient(socketObj);
			self.clients.push(socketObj);
			/* We also send him all the connected nodes */
			for(var i=0; i < self.cluster.nodes.length; i++) {
				if(typeof self.cluster.nodes[i]._info == 'undefined') continue;
				socketObj.send('node.add', self.cluster.nodes[i]._info);
			}
		}
		if(d.type == 'node') {
			self.cluster.addNode(socketObj, d);
		}
	});
 };

/*
* We now bind all the events that we can receive from a client.
* */
Server.prototype.bindClient = function BindClient(socketObj) {
	var self = this;
	/* We capture the GET session request. */
	socketObj.data(['client', 'get', '*'], function(session_id) {
		var callback = this.event[3];	// the cb id
		var data = self.db.get(session_id),
			payload = null;
		if(data != null) {
			payload = {
				session: data.session,
				cookie: data.cookie
			};
		}
		payload = JSON.stringify(payload);
		socketObj.callback(callback, true, payload);
	});

	/* We capture the SET session request */
	socketObj.data(['client', 'set', '*'], function(payload) {
		var callback = this.event[3],
			sid = payload.id,
			age = payload.age,
			cookie = payload.cookie,
			sess = payload.session;
		self.db.set(sid, sess, cookie, age);
		socketObj.callback(callback, true, null);
	});

	/* We capture the DESTROY session request. */
	socketObj.data(['client', 'destroy', '*'], function(session_id) {
		var callback = this.event[3];
		self.db.del(session_id);
		socketObj.callback(callback, true, null);
	});
};


/*
* Generates a unique id string.
* */
Server.prototype.gid = function GenerateId() {
	var _p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890",
		r = "",
		strLen = _p.length;
	for(var i=0; i< 16; i++) {
		r += _p.charAt(Math.floor(Math.random() * strLen));
	}
	return r;
};

module.exports = Server;