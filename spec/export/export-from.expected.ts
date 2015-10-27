export * from 'a';
export * from 'spec/b';
export {
  foo,
  bar as baz
} from 'a';
export {
  bar,
  baz as bafoo
} from 'spec/b';
export {
  foobar,
  foobaz as foofoo
};
