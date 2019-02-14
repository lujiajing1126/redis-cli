const RedisClient = require('../lib/redis').RedisClient;
const __PR__ = require('../lib/redis').__PR__;
const _log = global.console.log;
const colors = require('colors');
const readline = require('readline');
const createExecutor = require('../lib/executor')

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

describe('subscribe executor', () => {
    let pub = {};
    beforeAll(() => {
        pub = new RedisClient("127.0.0.1", 6379);
        pub.client.removeAllListeners();
    });
    it('subscribe to a channel', () => {
        const sub = createExecutor(redisClient, ['subscribe', 'channel0']);
        return sub.run().then(() => {
            expect(spy.next).toBeCalledWith('channel0');
        });
    })
})