const colors = require('colors');
const util = require('util');

const BLOCKING_CMDS = ["subscribe", "monitor", "psubscribe"];

class Executor {

    constructor(client, commands) {
        this._client = client;
        this.commands = commands;

        const CMD = this.commands.shift().toLowerCase();
        this.blockingMode = BLOCKING_CMDS.includes(CMD);

        this._executor = this._client.client[`${CMD}Async`];

        if (typeof this._executor !== "function") {
            this._executor = this._client.client[`send_commandAsync`];
            // recombine commands
            this.commands = [CMD, this.commands];
        }
    }

    writeResult(result) {
        if (Array.isArray(result)) {
            this._client.next = result.map((item, index) => {
                return util.format("%d) %s", index + 1, item);
            });
        } else if (result === null) {
            this._client.next = "(nil)";
        } else if (typeof result === 'object') {
            this._client.next = Object.entries(result).flat().map((item, index) => {
                return util.format("%d) %s", index + 1, item);
            });
        } else {
            // number or string
            // default to print it as `string`
            this._client.next = util.format(Number.isInteger(result) ? `${INT_PREFIX} ${result}` : result);
        }
    }

    run() {
        return this._executor.bind(this._client.client)(...this.commands)
            .then((result) => {
                this.writeResult(result);
                return this.blockingMode;
            }).catch((e) => {
                this._client.next = colors.red(`(error) ${e.message}`);
            });
    }

    shutdown() {
        // do nothing
    }
}

class SubscribeExecutor extends Executor {
    constructor(client, commands) {
        super(client, commands);
    }

    run() {
        this._client.client.on("subscribe", (channel, count) => {});

        this._client.client.on("message", (channel, message) => {
            this.writeResult(message);
        });
        return super.run();
    }

    shutdown() {
        this._client.client.unsubscribe();
    }
}

class MonitorExecutor extends Executor {
    constructor(client, commands) {
        super(client, commands);
    }

    run() {
        this._client.client.on("monitor", (time, args, raw_reply) => {
            console.log(raw_reply);
        });
        return super.run();
    }

    shutdown() {

    }
}

module.exports = function (client, commands) {
    if (commands[0].toLowerCase() === 'subscribe') {
        return new SubscribeExecutor(client, commands);
    } else if (commands[0].toLowerCase() === 'monitor') {
        return new MonitorExecutor(client, commands);
    } else {
        return new Executor(client, commands);
    }
}