import type { HyperdriveVariables, Connection } from './hyperdrive'
export type { HyperdriveVariables, Connection }
export { hyperdrive } from './hyperdrive'

declare module '../..' {
    interface ContextVariableMap extends HyperdriveVariables { }
}
