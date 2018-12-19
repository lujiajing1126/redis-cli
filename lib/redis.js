var redis = require('redis');
var readline = require('readline');
var Promise = require('bluebird');
var util = require('util');
var _ = require("lodash");
var colors = require('colors');

var redisClient = function(host, port, auth) {
	this._mode = "IP/HOST";
	this._host = host;
	this._port = port;
	if(port == undefined) {
		this._mode = "UNIXSOCKET";
		this._redis_client = redis.createClient(this._host);
	} else {
		this._redis_client = redis.createClient(this._port,this._host);
	}

	if (auth) {
		this._redis_client.auth(auth);
	}

	Promise.promisifyAll(this._redis_client);
	this._attachRedisEvent();
};

redisClient.prototype._attachRedisEvent = function() {
	var self = this;
	self._redis_client.on("end",function(err){
		// Exit application when Redis session is ended.
		process.exit(0);
	});	

	self._redis_client.on("error",function(err){
		console.log(colors.red("(error) %s"),err.message);
		self._redis_client.quit();

		// Return non-zero value for error.
		process.exit(-1);
	});
}

redisClient.prototype.execute = function(commands) {
	var self = this;
	var CMD = commands.shift().toLowerCase();
	var func = self._redis_client[CMD+"Async"];
	if(typeof func == "function") {
		return func.apply(self._redis_client,commands)
		.then(function(result){
			if(_.isArray(result)) {
				_.each(result,function(item,index){
					console.log("%d) %s",index,item);
				});
			} else {
				console.log(result);
			}			
		});
	} else {
		console.log(colors.red("(error) ERR unknown command `%s`, with args beginning with: %s"),CMD, commands[0] || "");
		return Promise.resolve();
	}  
};

redisClient.prototype.attachEvent = function() {
	var self = this;
	var rl = readline.createInterface(process.stdin,process.stdout);
	self._redis_client.on('ready',function(){
		if(self.mode != "UNIXSOCKET") {
			rl.setPrompt(util.format("%s:%d> ",self._host,self._port));
		} else {
			rl.setPrompt(util.format("%s> ",self._host));
		}
		rl.prompt();

		rl.on('line', async (line) => {
			try {
				var command = line.trim();
				var commands = command.split(/\s+/);
				var CMD = commands.shift().toLowerCase();
				var func = self._redis_client[`${CMD}Async`];
				if(typeof func == "function") {
					var result = await func.call(self._redis_client, ...commands);
					if(_.isArray(result)) {
						_.each(result,function(item,index){
							console.log("%d) %s",index,item);
						});
					} else {
						console.log(result);
					}
				} else {
					console.log(colors.red("(error) %s is not support"),CMD);
				}
				rl.prompt();
			} catch(err) {
				console.log(colors.red("(error) %s"),err.message);
				rl.prompt();
			}
		}).on('close', function() {
			console.log('\nAbort!');
			self._redis_client.quit();
			process.exit(0);
		});
	});
}

module.exports = function(host, port, auth) {
	return new redisClient(host, port, auth);
};