  export interface INext {
    cancel(result: any): Promise;
    reject(result: any): Promise;
    complete(result: any): Promise;
    (): Promise;
  }
  export class Foo {
    run(instruction: number, next: INext): void;
  }
