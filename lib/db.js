/*
* This is the database store that holds up all the sessions.
* */
var baseStore = require('./store/base.js'),
	util = require('util'),
	events = require('events');
var EXPIRE_SECONDS = 2;

var db = function Database(isMaster) {
	this.__data = {};
	this.__keys = [];	/* An array of session IDs to loop over. */
	this.store = null;	// the persistant storage.
	this.should_store = false;	/* this is set to true whenever the server is the master. */
	this.isMaster = isMaster;
};
util.inherits(db, events.EventEmitter);

/*
* Sets the db store in place.
* */
db.prototype.setStore = function SetStore(storeObj) {
	if(!(storeObj instanceof baseStore)) {
		throw new Error('Database storage is of an invalid type.');
	}
	this.store = storeObj;
	if(this.isMaster) this.should_store = true;
};

/*
* Initializes the database.
* */
db.prototype.init = function Initialize(callback) {
	var self = this;
	if(this.store != null && this.should_store) {
		this.store.init(function(err) {
			if(err) return callback(err);
			self.store.read(function(err, ids, sessions) {
				if(err) return callback(err);
				self.__setData(ids, sessions);
				if(self.isMaster) self.expire();
				setInterval(function() {
					self.save(function(err) {
						if(err) self.emit('error', err);
					});
				}, self.store.getSaveInterval() * 1000);
				callback();
			});
		});
	} else {
		if(self.isMaster) this.expire();
		return callback(null);
	}
};

/*
* Stores all the in-memory sessions to the permanent storage.
* */
db.prototype.save = function Save(_callback) {
	var callback = (typeof _callback == 'function' ? _callback : function(){});
	this.store.save(this.__keys, this.__data, callback);
};

/*
* Sets the given data structure in place. This is used only when there is a storage
* attached to the db.
* */
db.prototype.__setData = function SetData(ids, data) {
	if(typeof data != 'object' || data == null) return false;
	if(!(ids instanceof Array)) return false;
	this.__data = data;
	this.__keys = ids;
	return true;
};


/*
* Performs a GET request on a key
* */
db.prototype.get = function Get(key) {
	if(typeof this.__data[key] == 'undefined') return null;
	return this.__data[key];
};

/*
* Performs a SET request on a key. with its value.
* Whenever we SET a key in the database, its timer will reset. We're talking about the
* expire timer.
* */
db.prototype.set = function Set(key, session, cookie, maxAge, expire, _shouldEmit) {
	var isNew = false,
		shouldEmit = (typeof _shouldEmit == 'boolean' ? _shouldEmit : true);
	if(typeof this.__data[key] == 'undefined') {
		this.__data[key] = {
			session: session,
			cookie: cookie,
			expire: null
		};
		isNew = true;
	} else {
		if(this.__data[key].session != session) {
			this.__data[key].session = session;
			if(shouldEmit) this.emit('session_update', key, session);
		}
		this.__data[key].cookie = cookie;
	}
	if(typeof maxAge == 'number' && maxAge != 0) {
		this.__data[key].expire = new Date().getTime() + maxAge;
	} else if(typeof expire == 'number') {	// we have a timestamp.
		this.__data[key].expire = expire;
	}
	this.__data[key].ts_set = new Date().getTime();	// this is the set timestamp.
	if(isNew) {
		this.__keys.push(key);
		if(shouldEmit) this.emit('session_create', key, session, this.__data[key].expire);
	}
	return this;
};

/*
* Removes a given session ID from the store.
* */
db.prototype.del = function Del(key, _shouldEmit) {
	if(typeof this.__data[key] == 'undefined') return false;
	var shouldEmit = (typeof _shouldEmit == 'boolean' ? _shouldEmit : true);
	delete this.__data[key];
	for(var i=0; i < this.__keys.length; i++) {
		if(this.__keys[i] == key) {
			this.__keys.splice(i, 1);
			if(shouldEmit) this.emit('session_destroy', key);
			break;
		}
	}
	return true;
};

/*
* This function supervises all the session datas in the memory to expire them.
* */
db.prototype.expire = function Expire() {
	var self = this;
	setInterval(function() {
		var now = new Date().getTime();
		/* We now loop through all the keys to check for expiration. */
		var i = 0,
			expired = 0;
		//console.log('Keys in store: ' + self.__keys.length);
		//console.log(self.__data);
		while(i < self.__keys.length) {
			var id = self.__keys[i];
			if(typeof self.__data[id] == 'undefined') {
				self.__keys.splice(i, 1);
				continue;
			}
			/* We now check if we need to expire the current session data. */
			if(self.__data[id].expire != null && self.__data[id].expire < now) {
				self.del(id);
				expired++;
				continue;
			}
			i++;
		}
		if(expired != 0) console.log("Expired " + expired + " sessions.");
	}, EXPIRE_SECONDS * 1000);
};

module.exports = db;