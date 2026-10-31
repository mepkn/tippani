// The app's typecheck pulls backend files in through the generated API types and
// has no Node types, so read process.env without naming the global directly.
export function env(): Record<string, string | undefined> {
  return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
}
