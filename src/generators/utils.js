export function id(v) {
  return v;
}

export function factory(cls) {
  function Factory(...args) { // eslint-disable-line consistent-return
    if (!(this instanceof Factory)) { // eslint-disable-line no-invalid-this
      return new Factory(...args);
    }

    cls.apply(this, args);
  }

  Factory.prototype = Object.create(cls.prototype);
  return Factory;
}
