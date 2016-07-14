const s = Symbol('s');

export class Foo {
  constructor() {

  }

  foo(): number {

  }

  bat(a?: number): number {

  }

  self(): this {

  }

  optional(param) {

  }

  ['bar-baz']() {

  }

  'foo-bar'() {

  }

  [s]() {

  }

  static alias(): typeof Foo {

  }
}
