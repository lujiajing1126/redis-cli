/**
 * Integration tests for Redis-CLI
 */
import { GUIRedisClient, __PR__ } from '../src/redis';
import { red, yellow, green } from 'colors';
const readline = require('readline');
const _log = global.console.log;
import {
    StartedTestContainer,
    GenericContainer,
    Wait
} from "testcontainers";

let spy = {
    next: undefined,
    exit: undefined
};

let gui: GUIRedisClient;
let container: StartedTestContainer;

jest.setTimeout(60000); // 1 minute

beforeAll(async () => {
    container = await new GenericContainer("redis:7.0.5")
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
        .start();

    gui = new GUIRedisClient({ port: container.getMappedPort(6379), host: "127.0.0.1", cluster: false, tls: false })
    spy.next = jest.spyOn(gui, 'next', 'set').mockImplementation(() => { });
    spy.exit = jest.spyOn(process, 'exit').mockImplementation();
    await gui.execute(['flushall'], () => { });
});

afterAll(async () => {
    gui.shutdown();
    spy.next.mockRestore();
    await container.stop();
    spy.exit.mockRestore();
});

describe('key value getter/setter', () => {
    it('SET key/value returns string literal OK', async () => {
        await gui.execute(["set", "key", "value"], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe(green("OK"));
    });

    it('GET key returns previously set value', async () => {
        await gui.execute(["get", "key"], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe(green("value"));
    });

    it('GET key returns previously set value, not equality', async () => {
        await gui.execute(["get", "key"], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).not.toBe("Value");
    });

    it('INCR returns with integer counter', async () => {
        await gui.execute(["set", "mykey", "10"], gui.responseCallback);
        expect(spy.next.mock.calls[0][0]).toBe(green("OK"));
        await gui.execute(["incr", "mykey"], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[2][0]).toBe(green("(integer) 11"));
    });
});

describe('hash getter/setter', () => {
    it('SET hash returning 1 means a new field in the hash and value was set', async () => {
        await gui.execute(["hset", "myhash2", "field1", "Hello"], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe(green("(integer) 1"));
    });

    it('GET hash return set value', async () => {
        await gui.execute(["hget", "myhash2", "field1"], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe(green("Hello"));
    });

    it('HGETALL displayed in rows', async () => {
        await gui.execute(["hgetall", "myhash2"], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toStrictEqual([green("1) \"field1\""), green("2) \"Hello\"")]);
    });
});

describe('test third party modules', () => {
    it('without installing specific module', async () => {
        await gui.execute(["FT.SEARCH", "permits", 'car', "LIMIT", "0", "0"], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe(red('(error) ERR unknown command `ft.search`, with args beginning with: `permits`, `car`, `LIMIT`, `0`, `0`, '));
    });
});

describe('array return tests', () => {
    it('lpush returns integer', async () => {
        await gui.execute(['LPUSH', 'alist', '1', '2', '3'], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe(green("(integer) 3"));
    });


    it('lrange returns ints setup', async () => {
        await gui.execute(['LRANGE', 'alist', '0', '-1'], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toStrictEqual([green("1) 3"), green("2) 2"), green("3) 1")]);
    });
});

describe('readline tests', () => {
    it('GET command input', async () => {
        const inputHandler = jest.spyOn(gui, 'handleInput').mockImplementation();
        return await new Promise((resolve) => {
            gui.attachEvent();
            gui.GUIInterface.write("get unknownkey\n");
            setTimeout(() => {
                expect(inputHandler).toHaveBeenLastCalledWith("get unknownkey");
                inputHandler.mockRestore();
                resolve(null);
            }, 1000);
        });
    });

    it('Test `exit` Command', () => {
        const quit = jest.spyOn(gui.defaultClient, 'quit').mockImplementation();
        gui.handleInput("exit");
        expect(quit).toHaveBeenCalled();
        quit.mockRestore();
    });

    it('Test `clear` Command', () => {
        const cursorTo = jest.spyOn(readline, 'cursorTo').mockImplementation();
        const clearScreenDown = jest.spyOn(readline, 'clearScreenDown').mockImplementation();
        gui.handleInput("clear");
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next).toHaveBeenCalledWith('\x1b[0f');
        expect(cursorTo).toHaveBeenCalled();
        expect(clearScreenDown).toHaveBeenCalled();
        cursorTo.mockRestore();
        clearScreenDown.mockRestore();
    });

    it('Test Normal Command', async () => {
        await gui.handleInput("get unknownkey");
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe(green('(nil)'));
    });

    it('Test Empty Command', () => {
        gui.handleInput("");
        expect(spy.next).toBeCalledTimes(1);
        expect(spy.next).toHaveBeenCalledWith(__PR__);
    });
});
