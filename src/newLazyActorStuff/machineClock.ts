import { Clock } from 'xstate5/dist/declarations/src/system'

// Default clock for xstate that will be mocked to a simluated clock in a test environment
export const machineClock: Clock = {
  clearTimeout: (id) => clearTimeout(id),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
}

// Placeholder for a function that increments the simulated clock
export const incrementMachineClock = async (_ms: number) => {
  await Promise.resolve()
}
