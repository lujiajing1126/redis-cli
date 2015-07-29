#!/usr/bin/env node
var redis = require('redis');
var Promise = require('bluebird');
var co = require('co');
var _ = require("lodash");
var readline = require('readline');
var util = require('util');
var rl = readline.createInterface(process.stdin,process.stdout);
var program = require('commander');

program.version('1.0.1')
	.usage("rdcli [OPTIONS] [cmd [arg [arg ...]]]")
	.option("-h, --host <host>",'Server hostname (default: 127.0.0.1).')
	.option("-p, --port <port>","Server port (default: 6379).",parseInt)
	.option("-s, --socker <socket>","Server socket (overrides hostname and port).")
	.parse(process.argv);

var host = program.host || "127.0.0.1";
var port = program.port || 6379;

var redisClient = redis.createClient(port,host);
Promise.promisifyAll(redisClient);

redisClient.on('ready',function(){
	rl.setPrompt(util.format("%s:%d> ",host,port));
	rl.prompt();          

	rl.on('line', function(line) {
		co(function* (){
			var command = line.trim();
			var commands = command.split(' ');
			var CMD = commands.shift().toLowerCase();
			var func = redisClient[CMD+"Async"];
			if(typeof func == "function") {
				var result = yield func.apply(redisClient,commands);
				if(_.isArray(result)) {
					_.each(result,function(item,index){
						console.log("%d) %s",index,item);
					});
				} else {
					console.log(result);
				}
			} else {
				console.log("(error) %s is not support",CMD);
			}  
			rl.prompt();
		}).catch(function(err){
			console.log("(error) %s",err.message);
			rl.prompt();
		});    
	}).on('close', function() {
		console.log('Abort!');
		redisClient.quit();
		process.exit(0);
	});
});

redisClient.on("error",function(err){
	console.log("(error) %s",err.message);
	redisClient.quit();
	process.exit(0);
});
