/**
 * Integration tests for Redis-CLI
 */
const RedisClient = require('../lib/redis').RedisClient;
const __PR__ = require('../lib/redis').__PR__;
const _log = global.console.log;
const colors = require('colors');
const filter = require('rxjs/operators').filter;

let spy = {};

let redisClient = {};

beforeAll(() => {
    redisClient = new RedisClient("127.0.0.1", 6379);
    /**
     * Call unref() on the underlying socket connection to the Redis server, allowing the program to exit once no more commands are pending.
     * This is an experimental feature, as documented in the following site:
     * https://github.com/NodeRedis/node_redis#clientunref
     */
    redisClient.client.unref();
    // remove all listener to avoid async callback
    redisClient.client.removeAllListeners();
    // mock `console.log`
    spy.next = jest.spyOn(redisClient, 'next', 'set').mockImplementation(() => {});
    spy.exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    return redisClient.execute(['flushall']);
});

afterAll(() => {
    redisClient.client.quit();
    redisClient.rl.close();
    spy.next.mockRestore();
    spy.exit.mockRestore();
});

describe('key value getter/setter', () => {
    test('SET key/value returns string literal OK', () => {
        return redisClient.execute(["set", "key", "value"]).then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next.mock.calls[0][0]).toBe("OK");
        });
    });

    test('GET key returns previously set value', () => {
        return redisClient.execute(["get", "key"]).then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next.mock.calls[0][0]).toBe("value");
        });
    });

    test('GET key returns previously set value, not equality', () => {
        return redisClient.execute(["get", "key"]).then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next.mock.calls[0][0]).not.toBe("Value");
        });
    });

    test('INCR returns with integer counter', () => {
        return redisClient.execute(["set", "mykey", "10"]).then(() => {
            expect(spy.next.mock.calls[0][0]).toBe("OK");
            return redisClient.execute(["incr", "mykey"]).then(() => {
                expect(spy.next).toHaveBeenCalled();
                expect(spy.next).toHaveBeenLastCalledWith("(integer) 11");
            });
        });
    });
});

describe('hash getter/setter', () => {
    test('SET hash returning 1 means a new field in the hash and value was set', () => {
        return redisClient.execute(["hset", "myhash", "field1", "Hello"]).then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next.mock.calls[0][0]).toBe("(integer) 1");
        });
    });

    test('GET hash return set value', () => {
        return redisClient.execute(["hget", "myhash", "field1"]).then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next.mock.calls[0][0]).toBe("Hello");
        });
    });

    test('HGETALL displayed in rows', () => {
        return redisClient.execute(["hgetall", "myhash"]).then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next.mock.calls[0][0]).toEqual(["1) field1", "2) Hello"]);
        });
    })
});

describe('test third party modules', () => {
    test('without installing specific module', () => {
        return redisClient.execute(["FT.SEARCH", "permits", 'car', "LIMIT", "0", "0"]).then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next).toHaveBeenLastCalledWith(colors.red('(error) ERR unknown command `ft.search`, with args beginning with: `permits`, `car`, `LIMIT`, `0`, `0`, '));
        });
    });
});

describe('array return tests', () => {
    test('lpush returns integer', () => {
        return redisClient.execute(['LPUSH', 'alist', '1', '2', '3']).then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next.mock.calls[0][0]).toBe("(integer) 3");
        });
    });


    test('lrange returns ints setup', () => {
        return redisClient.execute(['LRANGE', 'alist', '0', '-1']).then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next.mock.calls[0][0]).toEqual(["1) 3", "2) 2", "3) 1"]);
        });
    });
});

describe('readline tests', () => {
    test('GET command input', () => {
        const input_handler = jest.spyOn(redisClient, '_handleInput').mockImplementation(() => {});
        return new Promise((resolve) => {
            redisClient.attachEvent().then((rl) => {
                rl.write("get unknownkey\n");
                setTimeout(() => {
                    expect(input_handler).toHaveBeenLastCalledWith("get unknownkey");
                    input_handler.mockRestore();
                    resolve();
                }, 1000);
            });
        });
    });

    test('Test `exit` Command', () => {
        const quit = jest.spyOn(redisClient.client, 'quit').mockImplementation(() => {});
        redisClient._handleInput("exit");
        expect(quit).toHaveBeenCalled();
        quit.mockRestore();
    });

    test('Test `clear` Command', () => {
        redisClient._handleInput("clear");
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe('\x1b[0f');
    });

    test('Test Normal Command', () => {
        return redisClient._handleInput("get unknownkey").then(() => {
            expect(spy.next).toHaveBeenCalled();
            expect(spy.next.mock.calls[0][0]).toBe('(nil)');
        });
    });

    test('Test Empty Command', () => {
        redisClient._handleInput("");
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe(__PR__);
    })
});