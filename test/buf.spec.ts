import { InputBuffer } from '../src/buf';

test('string without backslash', () => {
    let buf = new InputBuffer("abc");
    expect(buf.render()).toBe("abc");
});

test('string with single backslash', () => {
    let buf = new InputBuffer([0x5c, 0x61, 0x62, 0x63]);
    const ret_buf = Buffer.from([0x5c, 0x61, 0x62, 0x63]);
    expect(buf.render()).toBe(ret_buf.toString('ascii'));
});

test('string with double backslash', () => {
    let buf = new InputBuffer([0x5c, 0x5c, 0x61, 0x62, 0x63]);
    const ret_buf = Buffer.from([0x5c, 0x61, 0x62, 0x63]);
    expect(buf.render()).toBe(ret_buf.toString('ascii'));
});

test('string with triple backslash', () => {
    let buf = new InputBuffer([0x5c, 0x5c, 0x5c, 0x61, 0x62, 0x63]);
    const ret_buf = Buffer.from([0x5c, 0x5c, 0x61, 0x62, 0x63]);
    expect(buf.render()).toBe(ret_buf.toString('ascii'));
});

test('string with quartic backslash', () => {
    let buf = new InputBuffer([0x5c, 0x5c, 0x5c, 0x5c, 0x61, 0x62, 0x63]);
    const ret_buf = Buffer.from([0x5c, 0x5c, 0x61, 0x62, 0x63]);
    expect(buf.render()).toBe(ret_buf.toString('ascii'));
});

test('string with backslash-x hex unicode', () => {
    let buf = new InputBuffer("\\xfe");
    const ret_buf = Buffer.from([0xc3, 0xbe]);
    expect(Buffer.from(buf.render()).compare(ret_buf)).toBe(0);
});