export class TypedArrayManager {
  constructor(props) {
    this._pool = [];
    this.props = {overAlloc: 2, poolSize: 100};
    this.setProps(props);
  }

  setProps(props) {
    Object.assign(this.props, props);
  }

  allocate(
    typedArray,
    count,
    {size = 1, type, padding = 0, copy = false, initialize = false, maxCount}
  ) {
    const Type = type || (typedArray && typedArray.constructor) || Float32Array;

    const newSize = count * size + padding;
    if (ArrayBuffer.isView(typedArray)) {
      if (newSize <= typedArray.length) {
        return typedArray;
      }
      if (newSize * typedArray.BYTES_PER_ELEMENT <= typedArray.buffer.byteLength) {
        return new Type(typedArray.buffer, 0, newSize);
      }
    }

    let maxSize;
    if (maxCount) {
      maxSize = maxCount * size + padding;
    }

    const newArray = this._allocate(Type, newSize, initialize, maxSize);

    if (typedArray && copy) {
      newArray.set(typedArray);
    } else if (!initialize) {
      // Hack - always initialize the first 4 elements. NaNs crash the Attribute validation
      newArray.fill(0, 0, 4);
    }

    this._release(typedArray);
    return newArray;
  }

  release(typedArray) {
    this._release(typedArray);
  }

  _allocate(Type, size, initialize, maxSize) {
    // Allocate at least one element to ensure a valid buffer
    let sizeToAllocate = Math.max(Math.ceil(size * this.props.overAlloc), 1);
    // Don't over allocate after certain specified number of elements
    if (sizeToAllocate > maxSize) {
      sizeToAllocate = maxSize;
    }

    // Check if available in pool
    const pool = this._pool;
    const byteLength = Type.BYTES_PER_ELEMENT * sizeToAllocate;
    const i = pool.findIndex(b => b.byteLength >= byteLength);
    if (i >= 0) {
      // Create a new array using an existing buffer
      const array = new Type(pool.splice(i, 1)[0], 0, sizeToAllocate);
      if (initialize) {
        // Viewing a buffer with a different type may create NaNs
        array.fill(0);
      }
      return array;
    }
    return new Type(sizeToAllocate);
  }

  _release(typedArray) {
    if (!ArrayBuffer.isView(typedArray)) {
      return;
    }
    const pool = this._pool;
    const {buffer} = typedArray;
    // Save the buffer of the released array into the pool
    // Sort buffers by size
    // TODO - implement binary search?
    const {byteLength} = buffer;
    const i = pool.findIndex(b => b.byteLength >= byteLength);
    if (i < 0) {
      pool.push(buffer);
    } else if (i > 0 || pool.length < this.props.poolSize) {
      pool.splice(i, 0, buffer);
    }
    if (pool.length > this.props.poolSize) {
      // Drop the smallest one
      pool.shift();
    }
  }
}

export default new TypedArrayManager();
