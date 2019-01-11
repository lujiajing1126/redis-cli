const redis = require('redis');
const readline = require('readline');
const Promise = require('bluebird');
const util = require('util');
const splitargs = require('splitargs');
const colors = require('colors');
const InputBuffer = require('./buf');

const INT_PREFIX = "(integer)";

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
			process.exit(0, false);
		});

		this._redis_client.on("error", (err) => {
			console.log(colors.red("(error) %s"), err.message);

			// Return non-zero value for error.
			this._exit(-1);
		});
	}

	execute(commands) {
		const CMD = commands.shift().toLowerCase();
		let func = this._redis_client[`${CMD}Async`];
		if (typeof func !== "function") {
			func = this._redis_client[`send_commandAsync`];
			// recombine commands
			commands = [CMD, commands];
		}
		return func.bind(this._redis_client)(...commands)
			.then((result) => {
				if (Array.isArray(result)) {
					result.forEach((item, index) => {
						console.log("%d) %s", index + 1, item);
					});
				} else if (typeof result === 'object') {
					let count = 1;
					for (let key of Object.keys(result)) {
						console.log("%d) %s", count, key);
						console.log("%d) %s", count + 1, result[key]);
						count += 2;
					}
				} else {
					// number or string
					// default to print it as `string`
					console.log(Number.isInteger(result) ? `${INT_PREFIX} ${result}` : result);
				}
			}).catch((e) => {
				console.log(colors.red(`(error) ${e.message}`));
			});
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

			rl.on('line', (line) => {
				line = new InputBuffer(line).toString();
				try {
					let command = line.trim();
					if(command === "") {
						rl.prompt();
						return;
					}
					let commands = splitargs(command);
					if (commands.length !== 0) { // we have commands, so process, otherwise just a new prompt
						let CMD = commands.shift().toLowerCase();
						//`exit` and `clear` are not true commands, just part of REPL
						if (CMD === 'exit') {
							this._exit();
						} else if (CMD === 'clear') {
							console.log('\x1b[0f'); /* ANSI clear screen code */
							readline.cursorTo(process.stdout, 0, 0);
							readline.clearScreenDown(process.stdout);
						} else {
							this.execute([CMD, ...commands]).finally(() => {
								rl.prompt();
							});
						}
					}
				} catch (err) {
					console.log(colors.red(`(error) ${err.message}`));
					rl.prompt();
				}
			}).on('close', () => {
				console.log('\nAbort!');
				this._exit();
			});
		});
	}

	_exit(code = 0, exit = true) {
		if (exit) {
			return this._redis_client.quitAsync().then(() => process.exit(code));
		} else {
			process.exit(code);
		}
	}
}

exports.RedisClient = RedisClient