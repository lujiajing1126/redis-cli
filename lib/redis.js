const redis = require('redis');
const readline = require('readline');
const Promise = require('bluebird');
const splitargs = require('splitargs');
const colors = require('colors');
const InputBuffer = require('./buf');
const createExecutor = require('./executor');
require('core-js/features/array/flat');
require('core-js/features/object/entries');

class PromptResult {}
class ExitResult {
	constructor(code) {
		this.code = code;
	}
}

const __PR__ = new PromptResult();
const __NORMAL_EXIT__ = new ExitResult(0);
const __ABNORMAL_EXIT__ = new ExitResult(-1);

class RedisClient {
	constructor(host, port, auth) {
		this._mode = "IP/HOST";
		this._host = host;
		this._port = port;
		this._clusters = {};
		// the key of _cache is key stored in the redis,
		// while the value is the cached `host:port`
		this._cache = {};
		if (port == undefined) {
			this._mode = "UNIXSOCKET";
			this._clusters[this._host] = RedisClient.createClientWithUnixDomain(this._host);
		} else {
			this._clusters[`${this._host}:${this._port}`] = RedisClient.createClientWithHostAndPort(this._host, this._port);
		}

		if (auth) {
			this.defaultClient.auth(auth);
		}

		this._attachRedisEvent(this.defaultClient);
		this._initReadline();
	}

	_initReadline() {
		this.rl = readline.createInterface(process.stdin, process.stdout);
		if (this.mode !== "UNIXSOCKET") {
			this.rl.setPrompt(`${this._host}:${this._port}> `);
		} else {
			this.rl.setPrompt(`${this._host}> `);
		}
		this.rl.prompt();
	}

	_attachRedisEvent(client) {
		client.on("end", (err) => {
			// Exit application when Redis session is ended.
			this.next = __NORMAL_EXIT__;
		});

		client.on("error", (err) => {
			this.next = colors.red(`(error) ${err.message}`);

			// Return non-zero value for error.
			this.next = __ABNORMAL_EXIT__;
		});
	}

	execute(commands) {
		this.executor = createExecutor(this, commands);
		return this.executor.run();
	}

	attachEvent() {
		this.rl.on('line', (line) => {
			this._handleInput(line);
		}).on('close', () => {
			// trigger when `SIGINT` received
			this.next = '\nAbort!';
			this.next = __NORMAL_EXIT__;
		});
	}

	_handleInput(line) {
		line = new InputBuffer(line).toString();
		try {
			let command = line.trim();
			if (command === "") {
				this.next = __PR__;
				return;
			}
			let commands = splitargs(command);
			if (commands.length !== 0) { // we have commands, so process, otherwise just a new prompt
				let CMD = commands.shift().toLowerCase();
				//`exit` and `clear` are not true commands, just part of REPL
				if (CMD === 'exit') {
					// all connections will be closed after `RedisClient` quit
					// and an `end` event will be emitted to exit process.
					if (this.executor) this.executor.shutdown();
					this._redis_client.quit();
				} else if (CMD === 'clear') {
					this.next = '\x1b[0f'; /* ANSI clear screen code */
					readline.cursorTo(process.stdout, 0, 0);
					readline.clearScreenDown(process.stdout);
					this.next = __PR__;
				} else {
					return this.execute([CMD, ...commands]).then((blocking) => {
						if (!blocking) this.next = __PR__;
					});
				}
			}
		} catch (err) {
			this.next = colors.red(`(error) ${err.message}`);
			this.next = __PR__;
		}
	}

	set next(v) {
		if (typeof v === 'string') {
			console.log(v);
		} else if (Array.isArray(v)) {
			console.log(v.join("\n"));
		} else if (v instanceof PromptResult) {
			this.rl.prompt();
		} else if (v instanceof ExitResult) {
			process.exit(v.code);
		}
	}

	get defaultClient() {
		return this._mode === "IP/HOST" ? this._clusters[`${this._host}:${this._port}`] : this._clusters[`this._host`];
	}

	static createClientWithHostAndPort(host, port) {
		let client = redis.createClient(port, host);
		Promise.promisifyAll(client);
		return client;
	}

	static createClientWithUnixDomain(unixSocket) {
		let client = redis.createClient(unixSocket);
		Promise.promisifyAll(client);
		return client;
	}

	getOrCreateClient(key, server) {
		if (server !== undefined) {
			if (this._clusters[server]) {
				if (key !== undefined) this._cache[key] = server;
				return this._clusters[server];
			}
			let client = RedisClient.createClientWithHostAndPort(...server.split(":"));
			if (key !== undefined) {
				this._cache[key] = server;
				this._clusters[server] = client;
			}
			return client;
		}

		if (key !== undefined) {
			let cachedNodeName = this._cache[key];
			if (cachedNodeName !== undefined) return this._clusters[cachedNodeName];
		}

		return this.defaultClient;
	}
}

exports.RedisClient = RedisClient
exports.__PR__ = __PR__