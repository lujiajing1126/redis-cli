const redis = require('redis');
const readline = require('readline');
const Promise = require('bluebird');
const util = require('util');
const splitargs = require('splitargs');
const colors = require('colors');

class RedisClient {
	constructor(host, port, auth) {
		this._mode = "IP/HOST";
		this._host = host;
		this._port = port;
		if (port == undefined) {
			this._mode = "UNIXSOCKET";
			this._redis_client = redis.createClient(this._host);
		} else {
			this._redis_client = redis.createClient(this._port, this._host);
		}

		if (auth) {
			this._redis_client.auth(auth);
		}

		Promise.promisifyAll(this._redis_client);
		this._attachRedisEvent();
	}

	_attachRedisEvent() {
		this._redis_client.on("end", (err) => {
			// Exit application when Redis session is ended.
			process.exit(0);
		});

		this._redis_client.on("error", (err) => {
			console.log(colors.red("(error) %s"), err.message);
			this._redis_client.quit();

			// Return non-zero value for error.
			process.exit(-1);
		});
	}

	execute(commands) {
		const CMD = commands.shift().toLowerCase();
		const func = this._redis_client[`${CMD}Async`];
		if (typeof func == "function") {
			return func.bind(this._redis_client)(...commands)
				.then(function (result) {
					if (Array.isArray(result)) {
						result.forEach((item, index) => {
							console.log("%d) %s", index, item);
						});
					} else {
						console.log(result);
					}
				});
		} else {
			console.log(colors.red("(error) ERR unknown command `%s`, with args beginning with: %s"), CMD, commands[0] || "");
			return Promise.resolve();
		}
	}

	attachEvent() {
		const rl = readline.createInterface(process.stdin, process.stdout);
		this._redis_client.on('ready', () => {
			if (this.mode !== "UNIXSOCKET") {
				rl.setPrompt(`${this._host}:${this._port}> `);
			} else {
				rl.setPrompt(`${this._host}> `);
			}
			rl.prompt();

			rl.on('line', async (line) => {
				try {
					let command = line.trim();
					let commands = splitargs(command);
					if (commands.length !== 0) { // we have commands, so process, otherwise just a new prompt
						let CMD = commands.shift().toLowerCase();
						let func = this._redis_client[`${CMD}Async`];
						if (typeof func == "function") {
							let result = await func.bind(this._redis_client)(...commands);
							if (Array.isArray(result)) {
								result.each((item, index) => {
									console.log("%d) %s", index, item);
								});
							} else {
								console.log(result);
							}
						} else {
							console.log(colors.red(`(error) ${CMD} is not supported`));
						}
					}
					rl.prompt();
				} catch (err) {
					console.log(colors.red(`(error) ${err.message}`));
					rl.prompt();
				}
			}).on('close', () => {
				console.log('\nAbort!');
				this._redis_client.quit();
				process.exit(0);
			});
		});
	}
}

exports.RedisClient = RedisClient