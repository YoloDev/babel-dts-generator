export function foo({ 
  bar, 
  baz 
}?: {
  bar?: any,
  baz?: any
}): any;
export function bar({ 
  foo: { 
    bar
  }
}?: { 
  foo?: { 
    bar?: any 
  }
}): any;
