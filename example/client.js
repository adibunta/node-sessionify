var express = require('express');
var Sessionify = require('./../index.js');

var clientObj = new Sessionify.Client(express, {
	host: '127.0.0.1',
	maxAge: 6000
});


var app = express();
app.use(express.errorHandler());
app.use(express.compress());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser("secret123"));
app.use(express.session({
	key: 'sid',
	secret: 'secret123',
	cookie: {
		secure: false,
		maxAge: 6000//24 * 60 * 60 * 1000
		//domain:
	},
	store: clientObj
}));
app.use(app.router);
app.get('/', function(req, res) {
	var name = req.session.name || "Guest " + Math.random();
	req.session.name = Math.random();
	res.write("Hello, " + name);
	return res.end();
});
app.get('/destroy', function(req, res) {
	req.session.destroy();
	res.write("Destroied");
	return res.end();
});

app.get('/benchmark', function(req, res) {
	var count = 0,
		errors = 0,
		total = 1000000,
		now = new Date().getTime();
	var doCreate = function DoCreate() {
		clientObj.set(clientObj.gid(), {
			key: Math.random(),
			two: Math.random(),
			cookie: {
				originalMaxAge: 60000
			}
		}, function(err) {
			if(err) {
				errors++;
			}
			count++;
			if(count >= total) return onComplete();
			doCreate();
		});
	};
	var onComplete = function OnComplete() {
		console.log("Took: " + (new Date().getTime() - now));
		console.log("Errors: " + errors)
	};
	doCreate();
	res.write("Benchmark");
	return res.end();
});

app.listen(3128);