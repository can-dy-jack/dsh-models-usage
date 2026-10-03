/**
 * The host's shared React, reached through the ModuleLoader `require`.
 *
 * `initReact` runs once at the top of the module factory; every UI module then
 * imports `React`/`h` from here — live bindings, so they resolve after init.
 */

export interface ReactLike {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
  Fragment: unknown
  useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void]
  useEffect(fn: () => void | (() => void), deps?: unknown[]): void
  useRef<T>(initial: T): { current: T }
}

export let React: ReactLike
export let h: ReactLike['createElement']

export function initReact(api: ReactLike): void {
  React = api
  h = api.createElement
}

/**
 * Loose JSX contract for the classic (`React.createElement`) transform.
 * The host's React types are not shipped to plugins, so elements and
 * intrinsic attributes are intentionally permissive; custom components
 * still type-check their own props.
 */
declare global {
  namespace JSX {
    type Element = unknown
    interface IntrinsicElements {
      [name: string]: Record<string, unknown>
    }
    interface IntrinsicAttributes {
      key?: unknown
    }
    interface ElementChildrenAttribute {
      children: unknown
    }
  }
}
