export class Foo {
  constructor();
  foo(): number;
  bat(a?: number): number;
  self(): this;
  optional(param?: any): any;
  'bar-baz'(): any;
  'foo-bar'(): any;
  [s](): any;
  static alias(): typeof Foo;
}
