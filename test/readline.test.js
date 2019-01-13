jest.mock('readline');
const readline = require('readline');

const RedisClient = require('../lib/redis').RedisClient;

const mockRl = {
    pause: function () {},
    resume: function () {},
    close: function () {},
    on: function () {},
    removeListener: function () {},
    output: {
        mute: function () {},
        unmute: function () {},
        end: function () {},
        write: function () {}
    },
    addEventListener: function (name, handler) {
        if (!mockRl._listeners[name]) {
            mockRl._listeners[name] = [];
        }
        mockRl._listeners[name].push(handler);
    },
    removeEventListener: function () {},
    setPrompt: function () {},
    _listeners: {}
};

beforeAll(() => {
    redisClient = new RedisClient("127.0.0.1", 6379);
    /**
     * Call unref() on the underlying socket connection to the Redis server, allowing the program to exit once no more commands are pending.
     * This is an experimental feature, as documented in the following site:
     * https://github.com/NodeRedis/node_redis#clientunref
     */
    redisClient._redis_client.unref();
    // remove all listener to avoid async callback
    redisClient._redis_client.removeAllListeners();
    return redisClient.execute(['flushall']);
});

afterAll(() => {
    redisClient._redis_client.quit();
});

describe("readline tests", () => {
    beforeEach(() => {
        readline.createInterface.mockReturnValue(mockRl);
    });

    it('exit test', () => {
        redisClient.attachEvent();
    });
})