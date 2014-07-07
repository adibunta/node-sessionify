/*
* This is the database store that holds up all the sessions.
* */
var EXPIRE_SECONDS = 2;
var db = function Database(_config) {
	this.__data = {};
	this.__keys = [];	/* An array of session IDs to loop over. */
	this.config = {
	};
	this.expire();
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
db.prototype.set = function Set(key, value, cookie, maxAge) {
	if(typeof this.__data[key] == 'undefined') {
		this.__data[key] = {
			content: value,
			cookie: cookie,
			expire: null
		};
		//console.log('new sess')
		// TODO: a new session, we need to broadcast to cluster.
	} else {
		if(this.__data[key].content != value) {
			// TODO: session data updated, we need to broadcast to cluster.
			console.log('upd sess')
			this.__data[key].content = value;
		}
		this.__data[key].cookie = cookie;
	}

	if(typeof maxAge == 'number' && maxAge != 0) {
		this.__data[key].expire = new Date().getTime() + maxAge;
	}
	this.__keys.push(key);
	return this;
};

/*
* Removes a given session ID from the store.
* */
db.prototype.del = function Del(key) {
	if(typeof this.__data[key] == 'undefined') return false;
	delete this.__data[key];
	for(var i=0; i < this.__keys.length; i++) {
		if(this.__keys[i] == key) {
			this.__keys.splice(i, 1);
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
		var i = 0;
		console.log('Keys in store: ' + self.__keys.length);
		return;
		while(i < self.__keys.length) {
			var id = self.__keys[i];
			if(typeof self.__data[id] == 'undefined') {
				self.__keys.splice(i, 1);
				continue;
			}
			/* We now check if we need to expire the current session data. */
			if(self.__data[id].expire != null && self.__data[id].expire < now) {
				self.del(id);
				continue;
			}
			i++;
		}
	}, EXPIRE_SECONDS * 1000);
};

module.exports = db;