/*
* This is a cluster class file. It maintains all the functionality behind
* the cluster mode.
* */
var events = require('events'),
	nssocket = require('nssocket'),
	util = require('util');

var cluster = function Cluster(serverObj) {
	this.server = serverObj;
	this.nodes = [];
	this.bind();
	var self = this;
	if(!this.server.isMaster && this.server.config.master != null) {
		setInterval(function() {
			console.log("Keys: " + self.server.db.__keys.length);
		}, 1000);
		this.connectToMaster();
	}
};
util.inherits(cluster, events.EventEmitter);

/*
* Connects to the given host/port as a node.
* */
cluster.prototype.connectToNode = function ConnectToNode(host, port, type, callback) {
	var socketObj = new nssocket.NsSocket(),
		self = this;
	socketObj._info = {
		host: host,
		port: port
	};
	socketObj.id = self.server.gid();
	socketObj.type = (typeof type == 'string' ? type : 'node');
	var onDisc = function OnDisconnect(e) {
		socketObj._connected = false;
		socketObj.destroy();
		socketObj.removeAllListeners(["cluster", 'sess.create']);
		console.log("Disconnected from " + socketObj._info.host + ":" + socketObj._info.port + " - " + socketObj.type);
		if(socketObj.type == 'master') {
			setTimeout(function() {
				self.connectToMaster(true);
			}, 100);
		}
	};
	socketObj.on('error', onDisc);//.on('close', onDisc);
	socketObj.data('auth', function(d) {
		if(!d || d.error) {
			self.emit('error', new Error("Authentication failed with sessionify node: " + d.message));
			self.master.destroy();
			return;
		}
		self.addNode(socketObj);
		socketObj._connected = true;
		console.log("Connected to: " + socketObj._info.host + ":" + socketObj._info.port + " - " + socketObj.type);
		/* Whenever we connect to the master node, we request a database clone. */
		if(typeof callback == 'function') callback(socketObj);
	});
	socketObj.connect(port, host, function() {
		socketObj.send('auth', {
			type: 'node',
			host: self.server.config.host,
			port: self.server.config.port,
			secret: self.server.config.secret
		});
	});
};

/*
* Connects the current node to the master node.
* */
cluster.prototype.connectToMaster = function ConnectToMaster(wasError) {
	var self = this;
	if(wasError) console.log("Reconnecting after error")
	this.connectToNode(this.server.config.master.host, this.server.config.master.port, 'master', function(socketObj) {
		socketObj.data(['cluster', 'copy'], function(payload) {
			try {
				var clone = JSON.parse(payload);
			} catch(e) {
				return self.emit('error', new Error("Could not parse master clone database."));
			}
			for(var i=0; i < clone.keys.length; i++) {
				var sid = clone.keys[i];
				if(typeof self.server.db.__keys[sid] == 'undefined') {
					self.server.db.__data[sid] = clone.data[sid];
					self.server.db.__keys.push(sid);
				}
			}
			socketObj.send(['cluster', 'ready']);
		});
		socketObj.send(['cluster', 'clone']);
	});
};

/*
* Configures the cluster.
* */
cluster.prototype.bind = function Configure() {
	var self = this;
	/*
	* What we do now is we capture all database related events.
	* */
	this.server.db.on('session_destroy', function(sid) {
		//console.log("Removing session: " + sid);
		self.broadcast(['cluster', 'sess.destroy'], sid);
	}).on('session_update', function(sid, session) {
		console.log("Updating session: " + sid);
		self.broadcast(['cluster', 'sess.update'], {
			id: sid,
			session: session,
			ts: new Date().getTime()
		});
	}).on('session_create', function(sid, session, expire_ts) {
		//console.log("Creating session: " + sid);
		self.broadcast(['cluster', 'sess.create'], {
			id: sid,
			session: session,
			expire: expire_ts,
			ts: new Date().getTime()
		});
	});
};

/*
* Broadcasts to all the connected node that a change has occurred.
* */
cluster.prototype.broadcast = function Broadcast(event, payload) {
	var _map = {};
	for(var i=0; i < this.nodes.length; i++) {
		if(!this.nodes[i]._connected) continue;
		if(typeof _map[this.nodes[i].id] != 'undefined') continue;
		_map[this.nodes[i].id] = true;
		this.nodes[i].send(event, payload);
	}
};

/*
* This function is executed whenever a node has just connected.
* */
cluster.prototype.addNode = function AddNode(socket, data) {
	var self = this;
	if(typeof data == 'object' && data != null) {
		socket._info = data;
	}
	this.nodes.push(socket);
	/*
	* Whenever a node connects, we bind the cluster events to it.
	* */
 	socket.data(['cluster', 'sess.create'], function(payload) {
		var oldSess = self.server.db.get(payload.id);
		/* We take care of some small concurrency settings.
		 * If we have a more recent version of the data, we ignore this update.
		 * */
 		if(oldSess != null && oldSess.ts_set > payload.ts) {
			return;
		}
		self.server.db.set(payload.id, payload.session, payload.cookie || null, null, payload.expire, false);
		//console.log("SESSION.CREATE", payload.id);
	});
	socket.data(['cluster', 'sess.update'], function(payload) {
		var oldSess = self.server.db.get(payload.id);
		/* We take care of some small concurrency settings.
		 * If we have a more recent version of the data, we ignore this update.
		 * */
		if(oldSess != null && oldSess.ts_set > payload.ts) {
			return;
		}
		self.server.db.set(payload.id, payload.session, payload.cookie || null, null, null, false);
		//console.log("SESSION.UPDATE", payload.id);
	});
	socket.data(['cluster', 'sess.destroy'], function(sid) {
		self.server.db.del(sid, false);
		//console.log("SESSION.DESTROY", sid);
	});

	/* Whenever a node requests a clone, we send back all the database. We assume
	 * that all the nodes's database is empty while requesting this, so we send the entire json */
	socket.data(['cluster', 'clone'], function() {
		var payload = {
			keys: self.server.db.__keys,
			data: self.server.db.__data
		};
		var toSend = JSON.stringify(payload)
		socket.send(['cluster', 'copy'], toSend);
	});

	socket.data(['cluster', 'node.add'], function(info) {
		if(info.host == self.server.config.host && info.port == self.server.config.port) return;	// we will not connect to ourselves.
		for(var i=0; i < self.nodes.length; i++) {
			if(self.nodes[i].host == info.host && self.nodes[i].port.toString() == info.port.toString()) return;
		}
		self.connectToNode(info.host, info.port, info.type, function() {
			self.server.broadcast('node.add', info);
		});
	});

	/*
	* Whenever a node is ready, if we're master, we are going to send it to all the connected
	* clients that a new node has connected.
	* */
	socket.data(['cluster', 'ready'], function() {
		if(typeof socket._info == 'object') {
			self.broadcast(['cluster', 'node.add'], socket._info);
		}
		for(var i=0; i < self.nodes.length; i++) {
			if(typeof self.nodes[i]._info != 'object') continue;
			socket.send(['cluster', 'node.add'], self.nodes[i]._info);
		}
		console.log("Node " + socket._info.host + ":" + socket._info.port + " - ready");
		self.server.broadcast('node.add', socket._info);
	});
};

/*
* Removes a node when it gets disconnected.
* */
cluster.prototype.removeNode = function RemoveNode(socket) {
	for(var i=0; i < this.nodes.length; i++) {
		if(this.nodes[i].id == socket.id) {
			this.nodes.splice(i, 1);
			return true;
		}
	}
	return false;
};

module.exports = cluster;