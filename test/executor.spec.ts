import { RedisClient, ReplyError } from "redis";
import { BaseExecutor, Right, SubscribeExecutor, Result, Left, PatternSubscribeExecutor, RedirectError } from "../src/executor";
import { promisifyAll } from 'bluebird';
import {
    StartedTestContainer,
    GenericContainer,
    Wait
} from "testcontainers";

let container: StartedTestContainer;

jest.setTimeout(60000); // 1 minute

let redisClient : RedisClient

const delay = (ms: number) => {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

const prepareClient = (port: number): RedisClient => {
    let redisClient = new RedisClient({port: port, host: "127.0.0.1"});
    /**
     * Call unref() on the underlying socket connection to the Redis server, allowing the program to exit once no more commands are pending.
     * This is an experimental feature, as documented in the following site:
     * https://github.com/NodeRedis/node_redis#clientunref
     */
    redisClient.unref();
    // remove all listener to avoid async callback
    redisClient.removeAllListeners();
    promisifyAll(redisClient);
    return redisClient;
}

beforeAll(async () => {
    container = await new GenericContainer("redis:7.0.5")
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
        .start();
    
    redisClient = prepareClient(container.getMappedPort(6379));
    redisClient.flushall();
});

afterAll(async () => {
    redisClient.quit();
    await container.stop();
});

test("GET key before set", async () => {
    let executor = new BaseExecutor(redisClient, ["get", "key"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("(nil)");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("SET key", async () => {
    let executor = new BaseExecutor(redisClient, ["set", "key", "value"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("OK");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("GET key after set", async () => {
    let executor = new BaseExecutor(redisClient, ["get", "key"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("value");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("SUBSCRIBE channel", async () => {
    let subClient = prepareClient(container.getMappedPort(6379));
    let executor = new SubscribeExecutor(subClient, ["subscribe", "channel"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    let pushlishExec = new BaseExecutor(redisClient, ["publish", "channel", "value"]);
    await pushlishExec.run(() => {});
    // we have to wait for new messages coming in...
    await delay(1000);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("channel");
    subClient.quit();
});

test("PSUBSCRIBE channel", async () => {
    let psubClient = prepareClient(container.getMappedPort(6379));
    let executor = new PatternSubscribeExecutor(psubClient, ["psubscribe", "ch?nnel"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    let pushlishExec = new BaseExecutor(redisClient, ["publish", "channel", "value"]);
    await pushlishExec.run(() => {});
    // we have to wait for new messages coming in...
    await delay(1000);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("ch?nnel");
    psubClient.quit();
});

test("HSET and HGETALL", async () => {
    let executorHSET = new BaseExecutor(redisClient, ["HSET", "myhash", "field", "Hello"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executorHSET.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("(integer) 1");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
    let executorHGETALL = new BaseExecutor(redisClient, ["HGETALL", "myhash"]);
    await executorHGETALL.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(4);
    expect(mockCallback.mock.calls[2][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[2][0] as Right<string>).right).toStrictEqual(["1) \"field\"", "2) \"Hello\""]);
    expect(mockCallback.mock.calls[3][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[3][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("GET key in cluster and return RedirectError", async () => {
    jest.spyOn(redisClient, "get").mockImplementationOnce(() => {
        let err = new ReplyError("MOVED 10000 127.0.0.1:9900");
        err.code = "MOVED";
        throw err;
    });
    let executor = new BaseExecutor(redisClient, ["get", "key"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(1);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[0][0] as Left<Error>).left.name).toBe("RedirectError");
    expect((mockCallback.mock.calls[0][0] as Left<RedirectError>).left.slot).toBe(10000);
    expect((mockCallback.mock.calls[0][0] as Left<RedirectError>).left.hostAndPort).toBe("127.0.0.1:9900");
});

test("XADD and XRANGE", async () => {
    let executorXADD = new BaseExecutor(redisClient, ["XADD", "mystream", `1000-0`, "name", "Sara", "surname", "OConnor"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executorXADD.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("1000-0");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
    let executorXRANGE = new BaseExecutor(redisClient, ["XRANGE", "mystream", "-", "+"]);
    await executorXRANGE.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(4);
    expect(mockCallback.mock.calls[2][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[2][0] as Right<string>).right).toStrictEqual(["1) 1) 1000-0", "   2) 1) \"name\"", "      2) \"Sara\"", "      3) \"surname\"", "      4) \"OConnor\""]);
    expect(mockCallback.mock.calls[3][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[3][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("ZADD and ZRANGE", async () => {
    let executorZADD = new BaseExecutor(redisClient, ["ZADD", "myzset", "1", "one"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executorZADD.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("(integer) 1");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
    let executorZRANGE = new BaseExecutor(redisClient, ["ZRANGE", "myzset", "0", "-1", "WITHSCORES"]);
    await executorZRANGE.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(4);
    expect(mockCallback.mock.calls[2][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[2][0] as Right<string>).right).toStrictEqual(["1) one", "2) 1"]);
    expect(mockCallback.mock.calls[3][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[3][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("ZADD and ZSCAN", async () => {
    let executorZADD = new BaseExecutor(redisClient, ["ZADD", "yourzset", "1", "first"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executorZADD.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("(integer) 1");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
    executorZADD = new BaseExecutor(redisClient, ["ZADD", "yourzset", "2", "second"]);
    await executorZADD.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(4);
    expect(mockCallback.mock.calls[2][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[2][0] as Right<string>).right).toBe("(integer) 1");
    expect(mockCallback.mock.calls[3][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[3][0] as Left<Error>).left.name).toBe("RequestEnd");
    let executorZSCAN = new BaseExecutor(redisClient, ["ZSCAN", "yourzset", "0", "COUNT", "2"]);
    await executorZSCAN.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(6);
    expect(mockCallback.mock.calls[4][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[4][0] as Right<string>).right).toStrictEqual(["1) 0", "2) 1) first", "2) 2) 1", "2) 3) second", "2) 4) 2"]);
    expect(mockCallback.mock.calls[5][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[5][0] as Left<Error>).left.name).toBe("RequestEnd");
});
