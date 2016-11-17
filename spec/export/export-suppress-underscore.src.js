export * from 'a';
export * from './b';
export { _onefoo } from 'c';
export { _foo, _bar as baz } from 'a';
export { _bar, baz as bafoo } from './b';
export { foobar, _foobaz as foofoo };
export var _variable: number = 1;
export let _scoped: number = 2;
export const _constant: number = 3;

export const _foo2: string = 'foo',
  _bar2: string = 'bar';

export class _foofoo {

}

export class foobat {
  _first = 0;
  _third() {
    return 7;
  }
  second = 0;
}

interface _foofootwo {

}
