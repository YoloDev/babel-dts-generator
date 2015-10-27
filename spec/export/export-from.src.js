export * from 'a';
export * from './b';
export { foo, bar as baz } from 'a';
export { bar, baz as bafoo } from './b';
export { foobar, foobaz as foofoo };
