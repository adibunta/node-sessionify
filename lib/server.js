var net = require('net'),
	events = require('events'),
	util = require('util'),
	DataBase = require('./db.js');

/* We maintain an enum of actions. */
var ACTION = {
	AUTHENTICATE: '01',
	GET: '02',
	SET: '03',
	DESTROY: '04'
};
/*
* The server file takes care of the tcp connections.
* */

var Server = function Server(config) {
	this.__connection = null;
	this.config = {
		host: '0.0.0.0',
		port: 18755,
		secret: ''
	};
	if(typeof config == 'object' && config != null) {
		this.configure(config);
	}
	this.__db = new DataBase(this.config);
};
util.inherits(Server, events.EventEmitter);
/*
* Sets all the configurations in place.
* */
Server.prototype.configure = function Configure(data) {
	if(typeof data != 'object' || data == null || data instanceof Array) return this;
	if(typeof data.host == 'string') this.config.host = data.host;
	if(typeof data.port == 'number' && data.port >= 0) this.config.port = data.port;
	if(typeof data.secret == 'string') this.config.secret = data.secret;
	return this;
};

/*
* Handles incoming data from a given sessionify store.
* The message payload is as follows:
*	<command_id>:<callback_id>:<payload>
*	  The command_id will ALWAYS be made of 2 characters.
*	  The callback_id will ALWAYS be made of 16 characters.
*
* The following commands are available:
* 01 - the authentication command. It will check the secret key.
*
* */
Server.prototype.__parseData = function ParseClientData(socket, message) {
	if(message.length <= 2) return;
	if(message[2] != ':') return;
	var command = message[0] + message[1],
		callback_id = message.substr(3,16),
		_payload = message.substr(20);
	try {
		var payload = JSON.parse(_payload);
	} catch(e) {
		return;
	}
	var actionFunction = null;
	switch(command) {
		case ACTION.AUTHENTICATE:
			actionFunction = '__authSocket';
			break;
		case ACTION.GET:
			actionFunction = '__getSession';
			break;
		case ACTION.SET:
			actionFunction = '__setSession';
			break;
		case ACTION.DESTROY:
			actionFunction = '__destroySession';
			break;
		default:
			return;
	}
	this[actionFunction](socket, payload, callback_id);
};

/*
* The following function will respond to a given socket, to a given action and a given callback id
* wasError will default to false
* */
Server.prototype.send = function Send(socketObj, callbackId, action, payload, _wasError) {
	var wasError = (typeof _wasError == 'boolean' ? _wasError : false);
	socketObj.write(action.toString() + ":" + callbackId + ":" + (wasError ? "1" : "0") + ":" + payload);
};

/*
* Binds the TCP server and starts listening on the given port.
* */
Server.prototype.listen = function Listen(callback) {
	var self = this,
		cbCalled = false;
	/* We capture all the socket events for processing. */
	this.__connection = net.createServer(function(socket) {
		if(self.config.secret != '') {
			socket.__AUTH = false;
		} else {
			socket.__AUTH = true;
		}
		socket.setEncoding('utf8');
		socket.on('data', function(d) {
			self.__parseData(socket, d);
		}).on('error', function(err) {

		}).on('close', function() {

		}).on('timeout', function() {

		});
	});
	this.__connection.listen(this.config.port, this.config.host, function() {
		if(cbCalled) return;
		cbCalled = true;
		if(typeof callback == 'function') callback(null);
	});
	this.__connection.on('error', function(e) {
		if(!cbCalled) {
			cbCalled = true;
			callback(e);
			return;
		}
		self.emit('error', e);
	});
};




/*
 * The following functionality takes care of the authentication process.
 * */
Server.prototype.__authSocket = function AuthenticateSocket(socketObj, key, callback_id) {
	if(socketObj.__AUTH) {
		this.send(socketObj, callback_id, ACTION.AUTHENTICATE, "null");
		return;
	}
	if(this.config.secret != key) {
		this.send(socketObj, callback_id, ACTION.AUTHENTICATE, '"Invalid secret key"', true);
		return;
	}
	socketObj.__AUTH = true;
	this.send(socketObj, callback_id, ACTION.AUTHENTICATE, "null");
};

/*
* The following function will RETURN A SESSION data.
* Actual payload: <JSON.payload>#==<JSON.cookie>
* */
Server.prototype.__getSession = function GetSession(socketObj, id, callback_id) {
	var data = this.__db.get(id),	// it contains: content, cookie
		payload = null;
	if(data != null) {
		payload = data.content + "#==" + data.cookie;
	}
	this.send(socketObj, callback_id, ACTION.GET, payload);
};

/*
* The following function will CREATE/UPDATE A SESSION and its data
*
* Payload rule:
* <id>#==<maxAge>:<JSON.payload>#==<JSON.connectCookie>
* */
Server.prototype.__setSession = function SetSession(socketObj, payload, callback_id) {
	try {
		var sessionId = payload.substr(0, payload.indexOf("#==")),
			tmp = payload.substr(sessionId.length + 3);
		// We now build up the maxAge
		for(var i=0; i < tmp.length; i++) {
			if(tmp[i] == ':') break;
		}
		var maxAge = parseInt(tmp.substr(0, i));
		var sessionData = tmp.substr(i+1);
	} catch(e) {
		var err = new Error("SET_SESSION_DATA");
		err.message = 'Set Session received an invalid data: ' + payload;
		err.details = e;
		this.emit('error', err);
		return;
	}
	/* We now get the connect cookie data */
	var connectCookie = "";
	for(var i=0; i < sessionData.length-2; i++) {
		if(sessionData[i] == '#' && sessionData[i+1] == '=' && sessionData[i+2] == '=') {
			connectCookie = sessionData.substr(i+3);
			sessionData = sessionData.substr(0, i);
			break;
		}
	}
	this.__db.set(sessionId, sessionData, connectCookie, maxAge);
	this.send(socketObj, callback_id, ACTION.SET, null);
};

/*
* The function will destroy a given session by its id, removing it from the database store.
* */
Server.prototype.__destroySession = function DestroySession(socketObj, id, callback_id) {
	this.__db.del(id);
	this.send(socketObj, callback_id, ACTION.DESTROY, null);
};


module.exports = Server;