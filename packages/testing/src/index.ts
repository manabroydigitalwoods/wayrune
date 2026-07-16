export function assertDefined<T>(value: T | null | undefined, message = 'Expected value'): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

export async function expectReject(fn: () => Promise<unknown>, status?: number) {
  try {
    await fn();
    throw new Error('Expected rejection');
  } catch (err: unknown) {
    if (status && err && typeof err === 'object' && 'status' in err) {
      const s = (err as { status: number }).status;
      if (s !== status) throw new Error(`Expected status ${status}, got ${s}`);
    }
  }
}
