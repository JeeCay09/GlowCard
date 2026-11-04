import type { ReactiveController, ReactiveControllerHost } from 'lit';

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;

/**
 * Tells taps and long presses apart. Bind the handlers in a template:
 * `@pointerdown=${p.down} @pointerup=${p.up} @pointercancel=${p.cancel} @pointermove=${p.move}`.
 */
export class PressController implements ReactiveController {
  private timer?: number;
  private start?: { x: number; y: number };
  private held = false;

  constructor(
    host: ReactiveControllerHost,
    private readonly onTap: () => void,
    private readonly onHold: () => void,
  ) {
    host.addController(this);
  }

  hostDisconnected(): void {
    this.cancel();
  }

  down = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    this.start = { x: ev.clientX, y: ev.clientY };
    this.held = false;
    this.timer = window.setTimeout(() => {
      this.held = true;
      this.onHold();
    }, HOLD_MS);
  };

  move = (ev: PointerEvent): void => {
    if (!this.start) return;
    if (Math.hypot(ev.clientX - this.start.x, ev.clientY - this.start.y) > MOVE_TOLERANCE)
      this.cancel();
  };

  up = (): void => {
    if (!this.start) return;
    window.clearTimeout(this.timer);
    if (!this.held) this.onTap();
    this.start = undefined;
  };

  cancel = (): void => {
    window.clearTimeout(this.timer);
    this.start = undefined;
  };
}
