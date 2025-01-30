export function isError(e: unknown): e is Error {
  return e instanceof Error || (typeof e === 'object' && e !== null && 'message' in e);
}
