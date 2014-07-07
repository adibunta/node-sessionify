var net = require('net'),
	events = require('events'),
	util = require('util');

/*
* This is the connection pool repository. It is used by the sessionStore component
* to maintain an active list of connections.
* */

var Pool = function ConnectionPool(config) {
	this.connections = [];
	this.connect(config);
	this.__callbacks = {};
	this.__reconnects = {};
};
util.inherits(Pool, events.EventEmitter);
/*
* Establishes connections to the Sessionify server.
* */
Pool.prototype.connect = function Connect(config) {
	if(config.servers.length == 0) {
		var err = new Error("Configuration error: no servers were configured.");
		this.emit('error', err);
		return;
	}
	for(var i=0; i < config.servers.length; i++) {
		this.addServer(config.servers[i], config.secret);
	}
	return this;
};

/*
* Adds a server to the connection pool.
* */
Pool.prototype.addServer = function AddServer(config, secret, _id) {
	var self = this,
		clientObj = new net.Socket();
	clientObj.__id = _id || Math.random().toString();
	clientObj.__PENDING_COMMANDS = [];
	clientObj.__active = false;
	clientObj.setEncoding('utf8');
	clientObj.connect(config.port, config.host, function() {
		self.send('01', secret, function(wasOk, data) {
			if(!wasOk) {
				var err = new Error("Authentication failed on server: " + config.host + ": " + data);
				self.emit('error', err);
				return;
			}
			self.connections.push(clientObj);
			self.emit('connect', clientObj.__id);
			clientObj.__active = true;
			if(self.__reconnects[clientObj.__id]) delete self.__reconnects[clientObj.__id];
			if(clientObj.__PENDING_COMMANDS.length != 0) {
				for(var i=clientObj.__PENDING_COMMANDS.length-1; i >=0; i--) {
					self.send(null, clientObj.__PENDING_COMMANDS[i], null, clientObj);
				}
			}
		}, clientObj, false);
	}).on('data', function(data) {
		self.__parseData(data);
	}).on('error', function(e) {
		self.emit('error', e);
		if(typeof self.__reconnects[clientObj.__id] != 'undefined') delete self.__reconnects[clientObj.__id];
		reconnect();
	}).on('close', function() {
		self.emit('disconnect');
		reconnect();
	});
	var reconnect = function() {
		if(typeof self.__reconnects[clientObj.__id] != 'undefined') return;	// client is already reconnecting.
		self.__reconnects[clientObj.__id] = true;
		clientObj.__active = false;
		// We temporary remove it from the server list
		for(var i=0; i < self.connections.length; i++) {
			if(self.connections[i].__id == clientObj.__id) {
				self.connections.splice(i, 1);
				break;
			}
		}
		setTimeout(function() {
			self.addServer(config, secret, clientObj.__id);
		}, 200);
	}
};

/*
* Fetches a connection from the connection pool.
* */
Pool.prototype.getConnection = function GetConnection() {
	if(this.connections.length == 0) return null;
	return this.connections[0];
};

/*
* The function will generate a callback ID and send it to the server. This is a wrapper over
* any message request.
*
* Arguments:
* 	action - the numerical action id
* 	payload - the actual payload. This will be encoded.
* 	callback - the callback function to call when response is back.
* 	_connectionObj - optional, if specified, it will use this connection rather than a random pulling.
* 	_enforce - optional, defaults to false, should we push to the pending messages or not.
* NOTE:
* 	if action is NULL, then payload will be the entire string that will be sent to the server. We
* 		only use this internally.
* */
Pool.prototype.send = function SendData(action, payload, callback, _connectionObj, _enforce) {
	var callbackId = this.generateId(),
		connObj = (typeof _connectionObj != 'undefined' ? _connectionObj : this.getConnection());
	if(connObj == null) {
		var err = new Error("No connections are available.");
		this.emit('warn', err);
		return;
	}
	if(action == null && typeof payload == 'string') {
		var writeData = payload;
	} else {
		var writeData = action.toString() + ":" + callbackId + ":" + JSON.stringify(payload);
		this.__callbacks[callbackId] = callback;
	}
	if(!connObj.__active && typeof _enforce != 'boolean') {
		connObj.__PENDING_COMMANDS.push(writeData);
		return false;
	}
	connObj.write(writeData);
	return true;
};

/*
* The function will parse the response of the server.
* */
Pool.prototype.__parseData = function ParseResponseData(message) {
	try {
		var command = message[0] + message[1],
			callback_id = message.substr(3,16),
			wasError = message.substr(20,1),
			_payload = message.substr(22);
	} catch(e) {
		var err = new Error("Server data cannot be parsed.");
		err.details = 'The server responded with an invalid data set.';
		err.error = e;
		this.emit('error', err);
		return;
	}
	var callback = this.__callbacks[callback_id];
	if(typeof callback != 'function') {
		this.emit('warn', "Callback: " + callback_id + " was not previously registered for command: " + command);
		return;
	}
	callback(wasError == "1" ? false : true, _payload);
	delete this.__callbacks[callback_id];
};

/*
* The function will generate a unique 16-character callback ID
* */
Pool.prototype.generateId = function GenerateId() {
	var _p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890",
		r = "",
		strLen = _p.length,
		length = 16;
	for(var i=0; i< length; i++) {
		r += _p.charAt(Math.floor(Math.random() * strLen));
	}
	return r;
};

module.exports = Pool;