const BACK_SLASH = 0x5C;

export class InputBuffer {
    private buf: Buffer

    constructor(input: Buffer | string | number[]) {
        this.buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
        this.replace();
    }

    replace(): void {
        if (!this.buf.includes(BACK_SLASH)) {
            return;
        }
        let len = this.buf.length;
        for (let i = 0; i < len; i++) {
            if (this.buf[i] === BACK_SLASH && this.buf[i + 1] === BACK_SLASH) {
                this.buf = Buffer.concat([this.buf.slice(0, i), this.buf.slice(i + 1)]);
                len -= 1;
            }
        }
    }

    render(): string {
        return this.buf.toString().replace(/\\x([a-zA-Z\d]{2})/gi, (_match, grp) => {
            return String.fromCodePoint(parseInt(grp, 16));
        });
    }
}