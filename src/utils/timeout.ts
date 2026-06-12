export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} zaman asimina ugradi (${Math.round(ms / 1000)}s)`)), ms);
    }),
  ]);
}
