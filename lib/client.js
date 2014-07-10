/*
* This is the sessionify client.
* */
var events = require('events'),
	nssocket = require('nssocket'),
	util = require('util');


function SessionifyClient(connect, config) {
	var ConnectStore = connect.session.Store;

	/*
	* This is the Sessionify Client implementation.
	* */
	var client = function Client(_config) {
		if(typeof _config != 'object' || _config == null) var _config = {};
		this.config = {
			host: typeof _config.host == 'string' ? _config.host : '127.0.0.1',
			port: typeof _config.port == 'number' ? _config.port : 18555,
			secret: typeof _config.secret == 'string' ? _config.secret : '',
			maxAge: (typeof _config.maxAge == 'number' ? _config.maxAge : null)
		};
		this.master = null;
		this.nodes = [];	// An array of nodes we can also use.
		this._callbacks = {};
		events.EventEmitter.call(this);
		ConnectStore.call(this, _config);
		this.connect();
	};
	util.inherits(client, events.EventEmitter);
	util.inherits(client, ConnectStore);

	/*
	* We write the 3 functions that express's session uses: get, set, destroy
	* */
	client.prototype.get = function GetSession(sid, callback) {
		this.send('get', sid, function(wasOk, data) {
			data = JSON.parse(data);
			if(!wasOk) {
				var err = new Error(data.message);
				return callback(err, null);
			}
			if(data == null) return callback(null, null);
			try {
				var sessObj = JSON.parse(data.session);
				if(typeof sessObj['cookie'] == 'undefined' && typeof data['cookie'] != 'undefined' && data['cookie'] != null) {
					sessObj['cookie'] = JSON.parse(data.cookie);
				} else {
					sessObj['cookie'] = {};
				}
				callback(null, sessObj);
			} catch(e) {
				console.log(e);
				var err = new Error("Could not parse session information.");
				err.details = e;
				return callback(err, null);
			}
		});
	};

	/*
	* Performs a SET operation.
	* */
	client.prototype.set = function SetSession(sid, data, callback) {
		var cookieData = data['cookie'],
			maxAge = (typeof cookieData == 'object' && cookieData != null && typeof cookieData.originalMaxAge == 'number') ? cookieData.originalMaxAge : this.config.maxAge,
			sessionData = JSON.parse(JSON.stringify(data));	// we do this because we want to destroy the cookie key from the session.
		delete sessionData['cookie'];
		var payload = {
			id: sid,
			age: maxAge,
			session: JSON.stringify(sessionData),
			cookie: JSON.stringify(cookieData)
		};
		this.send('set', payload, function(wasOk, data) {
			if(!wasOk) {
				var err = new Error(data.message);
				return callback(err, null);
			}
			callback(null);
		});
	};

	/*
	* Performs a DESTROY operation.
	* */
	client.prototype.destroy = function DestroySession(sid, callback) {
		this.send('destroy', sid, function(wasOk, data) {
			if(!wasOk) {
				var err = new Error(data.message);
				return callback && callback(err);
			}
		});
		callback && callback(null);
	};

	/*
	* Adds a node server to connect to.
	* */
	client.prototype.addNode = function AddNode(info) {
		var self = this;
		var socketObj = new nssocket.NsSocket();
		socketObj.id = this.gid();
		socketObj._info = info;
		var onDisc = function OnDisconnect() {
			socketObj._connected = false;
			self.removeNode(socketObj);
			console.log("Disconnected from node: " + socketObj._info.host + ":" + socketObj._info.port);
			socketObj.destroy();
		};
		socketObj.on('error', onDisc);//.on('close', onDisc);
		socketObj.data('auth', function(d) {
			if(!d || d.error) {
				self.emit('error', new Error("Authentication failed with sessionify node: " + d.message));
				socketObj.destroy();
				return;
			}
			socketObj._connected = true;
			self.bind(socketObj);
			self.nodes.push(socketObj);
			console.log("Connected to node: " + info.host + ":" + info.port);
		});
		socketObj.connect(info.port, info.host, function() {
			socketObj.send('auth', {
				type: 'client',
				host: self.config.host,
				port: self.config.port,
				secret: self.config.secret
			});
		});
	};

	/*
	* Removes a node from the list
	* */
	client.prototype.removeNode = function RemoveNode(socketObj) {
		var wasFound = false;
		for(var i=0; i < this.nodes.length; i++) {
			if(this.nodes[i].id == socketObj.id) {
				this.nodes.splice(i, 1);
				wasFound = true;
				break;
			}
		}
		return wasFound;
	};

	/*
	 * Connects the client to the master
	 * */
	client.prototype.connect = function Connect() {
		var self = this;
		this.master = new nssocket.NsSocket();
		this.master._info = {
			host: this.config.host,
			port: this.config.port
		};
		this.master.on('error', function(e) {
			self.master._connected = false;
			self.master.destroy();
			setTimeout(function() {
				self.connect();
			}, 100);
		}).on('close', function() {
			self.master._connected = false;
			self.master.destroy();
			setTimeout(function() {
				self.connect();
			}, 100);
		}).data('auth', function(d) {
			if(!d || d.error) {
				self.emit('error', new Error("Authentication failed with master sessionify: " + d.message));
				self.master.destroy();
				return;
			}
			self.master._connected = true;
			self.bind();
		});
		this.master.connect(this.config.port, this.config.host, function() {
			console.log("Connected to master: " + self.config.host + ":" + self.config.port);
			self.master.send('auth', {
				type: 'client',
				host: self.config.host,
				port: self.config.port,
				secret: self.config.secret
			});
		});
	};

	/*
	 * Binds the socket client.
	 * */
	client.prototype.bind = function Bind(_socket) {
		var self = this,
			socketObj = (typeof _socket == 'undefined' ? this.master : _socket);

		socketObj.data(['cb', '*'], function(data) {
			var callback_id = this.event[2];
			if(typeof self._callbacks[callback_id] != 'function') {
				return self.emit('warn', 'Callback ' + callback_id + ' was not previously registered.');
			}
			if(typeof data != 'object' || data == null) {
				var err = new Error('Invalid data received from server');
				err.details = data;
				return self.emit('error', err);
			}
			var wasError = (typeof data.error == 'boolean' && data.error == true ? true : false),
				payload = (typeof data.payload == 'undefined' ? null : data.payload);
			if(wasError) {
				payload = new Error(data.message | "An error occurred.");
			}
			if(payload == null) {
				payload = {
					cookie: {}
				}
			}
			self._callbacks[callback_id](!wasError, payload);
			delete self._callbacks[callback_id];
		});
		if(typeof _socket == 'undefined') {
			/* Whenever the master node tells us that additional nodes are available, we add and connect to them. */
			socketObj.data(['node.add'], function(node) {
				for(var i=0; i < self.nodes.length; i++) {
					if (self.nodes[i]._info.host == node.host && self.nodes[i]._info.port.toString() == node.port.toString()) {
						return;
					}
				}
				self.addNode(node);
			});
		}
	};

	/*
	* Returns a socket to send event/data to. It will cycle through the nodes and the master
	* server.
	* */
	client.prototype.getSocket = function GetSocket() {
		if(this.nodes.length == 0) {
			if(this.master._connected == false) return null;
			return this.master;
		}
		/* If master is down, we get a random node. */
		if(this.master._connected == false || true) {
			for(var i=0; i < this.nodes.length; i++) {
				if(!this.nodes[i]._connected) continue;
				return this.nodes[i];
			}
			return null;
		}
		return this.master;
	};

	/*
	* Helper function: sends a command to the server and registers the callback.
	* */
	client.prototype.send = function Send(event, data, callback) {
		var cbid = this.gid();
		this._callbacks[cbid] = callback;
		var serverObj = this.getSocket();
		if(serverObj == null) {
			return callback(false, new Error("Sessionify has no active connections."));
		}
		console.log("Sending to: " + serverObj._info.host + ":" + serverObj._info.port);
		serverObj.send(['client', event, cbid], data);
	};

	/*
	 * Helper function: Generates a callback ID
	 * */
	client.prototype.gid = function GenerateId() {
		var _p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890",
			r = "",
			strLen = _p.length;
		for(var i=0; i< 16; i++) {
			r += _p.charAt(Math.floor(Math.random() * strLen));
		}
		return r;
	};

	var obj = new client(config);
	return obj;
}

module.exports = SessionifyClient;