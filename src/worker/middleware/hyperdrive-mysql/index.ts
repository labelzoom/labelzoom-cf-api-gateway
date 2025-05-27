import type { HyperdriveVariables, Connection } from './hyperdrive-mysql'
export type { HyperdriveVariables, Connection }
export { hyperdriveMysql } from './hyperdrive-mysql'

declare module 'hono' {
    interface ContextVariableMap extends HyperdriveVariables { }
}
