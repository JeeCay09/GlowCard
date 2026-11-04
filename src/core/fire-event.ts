/** Dispatches a composed, bubbling event like the Home Assistant frontend does. */
export function fireEvent<T>(node: EventTarget, type: string, detail?: T): void {
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}
