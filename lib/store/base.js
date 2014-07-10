/*
* The Base Sessionify storage class. This acts like an interface and has to be extended by all other storage types.
* */

var base = function BaseStore(config) {
	this.config = {
		save: (typeof config == 'object' && typeof config.save == 'number') ? config.save : 120
	};
};

/*
* Returns the number of seconds between saves.
* */
base.prototype.getSaveInterval = function GetSaveInterval() {
	return this.config.save;
};

/*
* Initializes the store ald calls back with an error or null.
* */
base.prototype.init = function Init(callback) {
	throw new Error("Sessionify BaseStore: init() not implemented");
};

/*
* The function will receive as an argument the sessions structure. It then must save
* all of the data to the designated persistent store.
* */
base.prototype.save = function Save(data, callback) {
	throw new Error('Sessionify BaseStore: save() not implemented.');
};

/*
* The function will read all the data from the persistent store, and will callback
* with the given data.
* */
base.prototype.read = function Read(callback) {
	throw new Error('Sessionify BaseStore: read() not implemented.');
};

module.exports = base;