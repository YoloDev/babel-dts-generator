/**
  * comment one
  */
export * from 'a';


// comment three
export const foo = 7;

/**
 * comment four
 * @param optionsOrTarget Options for how the deprected decorator should function at runtime.
 */
export function decoratedFoo(optionsOrTarget?: DeprecatedOptions, maybeKey?: string, maybeDescriptor?: Object): any {};


/**
* Enables applying decorators, particularly for use when there is no syntax support in the language, such as with ES5 and ES2016.
* @param rest The decorators to apply.
*/
export function decorators(...rest: Function[]): DecoratorApplicator {}