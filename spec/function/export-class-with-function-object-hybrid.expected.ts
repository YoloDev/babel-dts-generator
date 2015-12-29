  export interface INext {
    (): Promise;
    cancel(result: any): Promise;
    reject(result: any): Promise;
    complete(result: any): Promise;
  }
  export class foo {
    run(instruction: number, next: INext): void;
  }
