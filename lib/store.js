var events = require('events'),
	util = require('util'),
	ConnectionPool = require('./pool.js');

var ACTION = {
	GET: '02',
	SET: '03',
	DESTROY: '04'
};

module.exports = function SessionStore(connect, config) {
	var ConnectStore = connect.session.Store;
	/*
	 * This is the Sessionify class definition for Node client session stores.
	 * */
	var Store = function SessionStore(options) {
		this.config = {
			servers: [],
			secret: '',
			maxAge: options.maxAge || 86400000
		};
		if(typeof config == 'object' && config != null) {
			this.configure(config);
		}
		this.pool = new ConnectionPool(this.config);
		var self = this;
		this.pool.on('error', function(e) {
			self.emit('error', e);
		}).on('warn', function(e) {
			self.emit('warn', e);
		}).once('connect', function(e) {
			self.emit('ready');
		});
		ConnectStore.call(this, options);
	};
	util.inherits(Store, events.EventEmitter);
	util.inherits(Store, ConnectStore);

	/*
	 * Configures the Session store.
	 * */
	Store.prototype.configure = function Configure(data) {
		if(typeof data != 'object' || data == null || data instanceof Array) return this;
		if(typeof data.secret == 'string') this.config.secret = data.secret;
		if(data.servers instanceof Array) {
			for(var i=0; i < data.servers.length; i++) {
				if(typeof data.servers[i].host == 'string' && typeof data.servers[i].port == 'number') {
					this.config.servers.push({
						host: data.servers[i].host,
						port: data.servers[i].port
					});
				}
			}
		}
		return this;
	};

	/*
	 * The 3 functions that we have to expose for express's Session Storage: get, set, destroy
	 * */

	/*
	 * Returns a session by its ID.
	 * */
	Store.prototype.get = function GetSession(id, callback) {
		this.pool.send(ACTION.GET, id, function(wasOk, payload) {
			if(!wasOk) {
				var error = new Error("STORE_GET");
				error.details = payload;
				error.message = 'Cannot get data for session: ' + id;
				return callback(error, null);
			}
			if(payload == "null") {
				return callback(null, null);
			}
			/* We now parse the connect-cookie */
			var connectCookie = "";
			for(var i=0; i < payload.length-2; i++) {
				if(payload[i] == '#' && payload[i+1] == '=' && payload[i+2] == '=') {
					connectCookie = payload.substr(i+3);
					payload = payload.substr(0, i);
					break;
				}
			}
			try {
				var session = JSON.parse(payload),
					cookie = JSON.parse(connectCookie);
				if(typeof session['cookie'] == 'undefined') session['cookie'] = cookie;
			} catch(e) {
				var error = new Error("STORE_GET_JSON");
				error.details = e;
				error.message = "Cannot parse session data.";
				return callback(error, null);
			}
			callback(null, session);
		});
	};

	/*
	 * Sets a session in place.
	 * The following format is sent:
	 * <id>#==<maxAge>:<JSON.payload>#==<JSON.cookie>
 	 * Note: we want to send out the cookie information and the session data in 2 separate
 	 * variables, so that the server will be able to know when the session data was actually changed
 	 * to broadcast in the cluster.
	 * */
	Store.prototype.set = function SetSession(id, data, callback) {
		var payload = id + "#==",// + data.cookie.originalMaxAge,
			cookieData = data['cookie'];
		delete data['cookie'];
		if(typeof data.cookie == 'object' && data.cookie != null && typeof data.cookie.originalMaxAge == 'number') {
			payload += data.cookie.originalMaxAge;
		} else {
			payload += this.config.maxAge;
		}
		payload += ":" + JSON.stringify(data) + "#==" + JSON.stringify(cookieData);
		this.pool.send(ACTION.SET, payload, function(wasOk, response) {
			if(!wasOk) {
				var error = new Error("STORE_SET");
				error.details = response;
				error.message = 'Cannot set data for session: ' + id;
				return callback && callback(error, null);
			}
			callback && callback(null);
		});
	};

	/*
	 * Destroy a given session by ids id.
	 * */
	Store.prototype.destroy = function DestroySession(id, callback) {
		this.pool.send(ACTION.DESTROY, id, function(wasOk, response) {
			if(!wasOk) {
				var error = new Error("STORE_DESTROY");
				error.details = response;
				error.message = 'Cannot destroy session: ' + id;
				return callback && callback(error, null);
			}
			callback && callback(null);
		});
	};

	return new Store(config);
};