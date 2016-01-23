declare module spec {
  export class Foo {
    constructor();
    foo(): number;
    'bar-baz'(): any;
    'foo-bar'(): any;
    [s](): any;
  }
}