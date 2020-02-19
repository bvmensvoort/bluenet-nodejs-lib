import {BluenetError, BluenetErrorType} from "../BluenetError";


export class DataStepper {

  buffer = null;
  position = 0;
  length = 0;


  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.length = buffer.length;
  }

  getUInt8() {
    let source = this._request(1);
    return source.readUInt8(0);
  }

  getUInt16() {
    let source = this._request(2);
    return source.readUInt16LE(0);
  }

  getBuffer(size: number) {
    return this._request(size);
  }

  _request(size: number) : Buffer {
    if (this.position + size <= this.length) {
      let start = this.position;
      this.position += size;
      return new Buffer(this.buffer.slice(start, this.position))
    }
    else {
      throw new BluenetError(BluenetErrorType.INVALID_DATA_LENGTH, "Tried to get more bytes from buffer than were available.")
    }
  }

}