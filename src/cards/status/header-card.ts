import { css, html, nothing } from 'lit';
import { GlowCardBase, type GlowCardConfig } from '../../core/base-card';
import { registerCard } from '../../core/register';
import { configForm, fontField } from '../../core/editor';
import { fireEvent } from '../../core/fire-event';
import { language } from '../../core/localize';
import type { HomeAssistant } from '../../types/hass';
import { paletteColor, segmentView, refId, type EntityRef } from './status-logic';
import { avatar } from './status-base';
import { st } from './status-i18n';
import { avatarStyles, statusTokens } from './status-styles';

export interface HeaderCardConfig extends GlowCardConfig {
  /** person.* entities shown as avatars on the right. */
  persons?: EntityRef[];
  /** Name in the greeting; default: the signed-in user's first name. */
  name?: string;
  /** Own greeting text instead of "Guten Morgen, …". */
  greeting?: string;
}

/** "Guten Morgen" (5–11), "Guten Tag" (11–17), "Guten Abend" (17–22), "Gute Nacht". */
export function greetingFor(hass: HomeAssistant | undefined, date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 11) return st(hass, 'good_morning');
  if (h >= 11 && h < 17) return st(hass, 'good_day');
  if (h >= 17 && h < 22) return st(hass, 'good_evening');
  return st(hass, 'good_night');
}

/** "Beide zu Hause", "Alle zu Hause", "Gilbert zu Hause", "2 von 3 zu Hause" … */
export function presenceText(hass: HomeAssistant, ids: string[], names: string[]): string {
  const home = ids.map((id) => hass.states[id]?.state === 'home');
  const k = home.filter(Boolean).length;
  const n = ids.length;
  if (k === 0) return st(hass, 'nobody_home');
  if (k === n && n === 2) return st(hass, 'both_home');
  if (k === n && n > 2) return st(hass, 'all_home');
  if (k === 1) return st(hass, 'one_home', { name: names[home.indexOf(true)] });
  return st(hass, 'some_home', { k, n });
}

/** Header from the GlowChips board: greeting, date and time, people with presence ring. */
export class GlowHeaderCard extends GlowCardBase<HeaderCardConfig> {
  private clock?: number;

  static getConfigForm() {
    return configForm(
      [
        { name: 'persons', selector: { entity: { domain: ['person'], multiple: true } } },
        { name: 'greeting_name', selector: { text: {} } },
        fontField,
      ],
      { greeting_name: 'greeting_name_helper' },
    );
  }

  /** No people are picked for the user. */
  static getStubConfig(): Partial<HeaderCardConfig> {
    return {};
  }

  /** No tap / hold actions on the header. */
  static gestureSpec(): undefined {
    return undefined;
  }

  setConfig(config: HeaderCardConfig): void {
    // The editor field is called greeting_name so it does not clash with the card name.
    const c = { ...config } as HeaderCardConfig & { greeting_name?: string };
    if (c.greeting_name !== undefined) {
      c.name = c.greeting_name || undefined;
      delete c.greeting_name;
    }
    super.setConfig(c);
  }

  protected validateConfig(config: HeaderCardConfig): void {
    if (config.persons !== undefined && !Array.isArray(config.persons)) {
      throw new Error('"persons" must be a list of person entities');
    }
  }

  protected watchedEntities(): string[] {
    return (this.config?.persons ?? []).map(refId);
  }

  getCardSize(): number {
    return 1;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.clock = window.setInterval(() => this.requestUpdate(), 20_000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.clock);
  }

  private get userName(): string {
    const n = this.config?.name ?? this.hass?.user?.name ?? '';
    return this.config?.name ? n : (n.split(' ')[0] ?? '');
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const hass = this.hass;
    const now = new Date();
    const lang = language(hass);
    const date = new Intl.DateTimeFormat(lang, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now);
    const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(now);
    const name = this.userName;
    const greeting =
      this.config.greeting ??
      (name ? `${greetingFor(hass, now)}, ${name}` : greetingFor(hass, now));
    const refs = this.config.persons ?? [];
    const green = paletteColor('green', this.dark);
    const people = refs.map((r) =>
      segmentView(
        hass,
        {
          type: 'person',
          entity: refId(r),
          name: typeof r === 'string' ? undefined : r.name,
        },
        this.dark,
      ),
    );
    return html`<div class="header">
      <div class="left">
        <span class="greeting">${greeting}</span>
        <span class="date">${date} · ${time}</span>
      </div>
      ${
        refs.length
          ? html`<div class="right">
              <span class="presence">
                ${presenceText(
                  hass,
                  refs.map(refId),
                  people.map((p) => p.chipText),
                )}
              </span>
              <div class="people">
                ${people.map(
                  (p, i) =>
                    html`<button
                      class="person"
                      aria-label=${`${p.chipText}, ${p.chipSub ?? ''}`}
                      @click=${() => fireEvent(this, 'hass-more-info', { entityId: refId(refs[i]) })}
                    >
                      ${avatar(p, 40, 15, green, i > 0)}
                    </button>`,
                )}
              </div>
            </div>`
          : nothing
      }
    </div>`;
  }

  static styles = [
    ...GlowCardBase.styles,
    statusTokens,
    avatarStyles,
    css`
      :host {
        display: block;
        font-family: var(--glow-font);
        color: var(--glow-text);
      }
      .header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: flex-end;
        gap: 12px 16px;
      }
      .left {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .greeting {
        font-size: 30px;
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.1;
      }
      .date {
        font-size: 14px;
        font-weight: 600;
        color: var(--glow-muted);
      }
      .right {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .presence {
        font-size: 13px;
        font-weight: 600;
        color: var(--glow-muted);
      }
      .people {
        display: flex;
      }
      .person {
        all: unset;
        display: flex;
        cursor: pointer;
        border-radius: 999px;
      }
      .person:focus-visible {
        outline: 2px solid var(--glow-muted);
        outline-offset: 2px;
      }
      @media (max-width: 480px) {
        .greeting {
          font-size: 26px;
        }
      }
    `,
  ];
}

registerCard(
  {
    type: 'glowcard-header',
    name: 'GlowCard Header',
    description: 'Greeting with date and time, people with a green ring when at home',
  },
  GlowHeaderCard,
);
