import type { HyperdriveVariables, Connection } from './hyperdrive'
export type { HyperdriveVariables, Connection }
export { hyperdrive } from './hyperdrive'

declare module 'hono' {
    interface ContextVariableMap extends HyperdriveVariables { }
}
