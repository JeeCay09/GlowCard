/** Defines an internal element once (the bundle may be loaded twice). */
export function defineOnce(name: string, element: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, element);
}
