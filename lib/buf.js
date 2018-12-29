const BACK_SLASH = 0x5C;

class InputBuffer {
    constructor(input) {
        this._buf = input instanceof Buffer ? input : Buffer.from(input);
        this._replace();
    }

    _replace() {
        if (this._buf.indexOf(BACK_SLASH) < 0) {
            return;
        }
        let len = this._buf.length;
        for (let i = 0; i < len; i++) {
            if (this._buf[i] === BACK_SLASH && this._buf[i + 1] === BACK_SLASH) {
                this._buf = Buffer.concat([this._buf.slice(0, i), this._buf.slice(i + 1)]);
                len -= 1;
            }
        }
    }

    toString() {
        let ret = this._buf.toString().replace(/\\x([a-zA-Z\d]{2})/gi, (match, grp) => {
            return String.fromCodePoint(parseInt(grp, 16));
        });
        return ret;
    }
}

module.exports = InputBuffer;