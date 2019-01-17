const redis = require('redis');
const readline = require('readline');
const Promise = require('bluebird');
const util = require('util');
const splitargs = require('splitargs');
const colors = require('colors');
const InputBuffer = require('./buf');
const Subject = require('rxjs').Subject;
require('core-js/features/array/flat');
require('core-js/features/object/entries');

const INT_PREFIX = "(integer)";

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

		this._subject = new Subject();
		this._subject.subscribe({
			next: (v) => {
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
		});
	}

	_attachRedisEvent() {
		this._redis_client.on("end", (err) => {
			// Exit application when Redis session is ended.
			this.next = __NORMAL_EXIT__;
		});

		this._redis_client.on("error", (err) => {
			this.next = colors.red(`(error) ${err.message}`);

			// Return non-zero value for error.
			this.next = __ABNORMAL_EXIT__;
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
					this.next = result.map((item, index) => {
						return util.format("%d) %s", index + 1, item);
					});
				} else if (result === null) {
					this.next = "(nil)";
				} else if (typeof result === 'object') {
					this.next = Object.entries(result).flat().map((item, index) => {
						return util.format("%d) %s", index + 1, item);
					});
				} else {
					// number or string
					// default to print it as `string`
					this.next = util.format(Number.isInteger(result) ? `${INT_PREFIX} ${result}` : result);
				}
			}).catch((e) => {
				this.next = colors.red(`(error) ${e.message}`);
			});
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
					this._redis_client.quit();
				} else if (CMD === 'clear') {
					this.next = '\x1b[0f'; /* ANSI clear screen code */
					readline.cursorTo(process.stdout, 0, 0);
					readline.clearScreenDown(process.stdout);
					this.next = __PR__;
				} else {
					return this.execute([CMD, ...commands]).then(() => {
						this.next = __PR__;
					});
				}
			}
		} catch (err) {
			this.next = colors.red(`(error) ${err.message}`);
			this.next = __PR__;
		}
	}

	set next(v) {
		this._subject.next(v);
	}

	get client() {
		return this._redis_client;
	}
}

exports.RedisClient = RedisClient
exports.__PR__ = __PR__