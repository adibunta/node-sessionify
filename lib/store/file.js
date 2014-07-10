/*
 * This is the file storage. It will store all the in-memory session to the file.
 * */
var BaseStore = require('./base.js'),
	fs = require('fs'),
	path = require('path'),
	util = require('util');


var store = function FileStore(config) {
	BaseStore.apply(this, arguments);
	this.config.path = (typeof config == 'object' && config != null && config.path) ? config.path : path.join(process.cwd(), 'session.db');
	this.__opened = false;
};
util.inherits(store, BaseStore);

/*
* Initializes the file descriptor.
* */
store.prototype.init = function Init(callback) {
	var self = this;
	fs.exists(this.config.path, function(bVal) {
		if(bVal) return callback(null);
		fs.writeFile(self.config.path, "", function(err) {
			callback(err);
		});
	});
};

/*
* Reads data from the file and returns it via callback.
* */
store.prototype.read = function Read(callback) {
	fs.readFile(this.config.path, {
		encoding: 'utf8'
	}, function(err, content) {
		if(err) return callback(err);
		if(content.length == 0) return callback(null, null);
		var lines = content.split("\n"),
			sessions = {},
			ids = [],
			now = new Date().getTime();
		for(var i=0; i < lines.length; i++) {
			try {
				var item = lines[i].split("#==");
				if(item.length != 4) continue;
				var sid = item[0],
					sess = JSON.parse(item[1]),
					cookie = JSON.parse(item[2]),
					expire = parseInt(item[3]);
				if(expire < now) continue;	// we skip expired ones.
				if(typeof sessions[sid] != 'undefined') continue;
				ids.push(sid);
				sessions[sid] = {
					session: sess,
					cookie: cookie,
					expire: expire
				};
			} catch(e) {
				continue;
			}
		}
		callback(null, ids, sessions);
	});
};

/*
* Stores the db to the file.
* */
store.prototype.save = function Save(ids, data, callback) {
	var content = "";
	if(ids.length == 0) return callback(null);
	for(var i=0; i < ids.length; i++) {
		var sid = ids[i];
		if(typeof data[sid] == 'undefined') continue;
		content += sid + "#==" + JSON.stringify(data[sid].session) + "#==" + JSON.stringify(data[sid].cookie) + "#==" + data[sid].expire + "\n";
	}
	fs.writeFile(this.config.path, content, {
		encoding: 'utf8'
	}, function(err) {
		callback(err);
	});
};

module.exports = store;