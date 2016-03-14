export * from 'a';
export * from 'spec/b';
export {
  _bar as baz
} from 'a';
export {
  baz as bafoo
} from 'spec/b';
export {
  foobar,
  _foobaz as foofoo
};
