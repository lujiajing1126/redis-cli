import { splitargs } from "../src/splitargs";

describe('splitargs', () => {
    test.each([
        ['set foo bar', ['set', 'foo', 'bar']],
        ['set "foo bar"', ['set', 'foo bar']],
        ['set "foo bar\\" baz"', ['set', 'foo bar" baz']],
        ['set \\  bar', ['set', '\\', 'bar']],
        ['  set    foo  \r \n  bar  \v ', ['set', 'foo', 'bar']],
        ['"set" "foo" "bar"', ['set', 'foo', 'bar']],
    ])('should return result correctly', (input: string, expected: string[]) => {
        const actual = splitargs(input);

        expect(actual).toStrictEqual(expected);
    });

    test.each([
        ['set foo "bar'],
        ['set foo "bar"dsf'],
        ["set foo 'bar"],
    ])('should throw', (input: string) => {

        expect(() => splitargs(input)).toThrowError();
    });
});
