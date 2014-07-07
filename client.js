var express = require('express');
var Sessionify = require('./index.js');

var clientObj = new Sessionify.Store(express, {
	secret: 'gica123',
	servers: [{
		host: '127.0.0.1',
		port: 18755
	}]
});


clientObj.on('error', function(err) {
	console.log("ERROR", err);
}).on('warn', function(msg) {
	console.log('WARN', msg);
})

console.log("Testing...");
clientObj.on('ready', function() {
	var MAX_SESSIONS = 100000,
		FAILS = 0,
		CURRENT = 0,
		TIMES = [],
		STARTED = new Date().getTime();

	var sendSession = function() {
		var sid = new Date().getTime().toString() + Math.random().toString(),
			data = {
				onestring: "eqw" + new Date().getTime(),
				gica: "Math.",
				trica: Math.random(),
				zaica: Math.random(),
				gigi: Math.random(),
				ryry: Math.random()
			};
		var now = new Date().getTime();
		clientObj.set(sid, data, function(wasOk) {
			if(!wasOk) FAILS++;
			CURRENT++;
			var took = new Date().getTime() - now;
			TIMES.push(took);
			if(CURRENT < MAX_SESSIONS) {
				sendSession();
			} else {
				onFinish();
			}
		});
	};
	var onFinish = function() {
		console.log("Test took: " + (new Date().getTime() - STARTED) + "ms.");
		console.log("SET Requests: " + MAX_SESSIONS);
		var avg = 0;
		for(var i=0; i < TIMES.length; i++) {
			avg += TIMES[i];
		}
		avg = Math.round(avg/TIMES.length);
		console.log("Average time: " + avg + "ms");
		clearTimeout(a);
	};
	sendSession();
	var a = setTimeout(function() {
		console.log('Sent ' + CURRENT);
	}, 1000);
});

return;

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
		maxAge: 24 * 60 * 60 * 1000
		//domain:
	},
	store: clientObj
}));
app.use(app.router);
app.get('/', function(req, res) {
	console.log("CONECTED:", req.session.name);
	req.session.name = "MATA";
	res.write("HI");
	console.log(req.session);
	res.end();
});
app.get('/update', function(req, res) {
	req.session.nume = Math.random();
	res.write("HO");
	res.end();
});

app.get('/1', function(req, res) {
	req.session.destroy();
	res.write("DONE");
	res.end();
});

app.listen(3128);

