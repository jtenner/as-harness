export interface Runtime {
  name: string;
  mutateCompilerArguments(compilerArguments: string[]): void;
}
