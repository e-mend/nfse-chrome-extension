/**
 * Layout preferences shared between the settings UI and the app shell.
 *
 * The container width is stored as a raw CSS length (e.g. `'1200px'` or
 * `'100%'`) in the `settings` collection and applied as the `max-width` of the
 * top-level `.bnf-wrap` element.
 */

/** Matches the `.bnf-wrap` default in global.css. */
export const DEFAULT_CONTAINER_WIDTH = '1200px';

/** Sentinel value used by the settings dropdown to reveal the custom input. */
export const CUSTOM_CONTAINER_WIDTH = '__custom__';

export interface ContainerWidthPreset {
  label: string;
  value: string;
}

export const CONTAINER_WIDTH_PRESETS: ContainerWidthPreset[] = [
  { label: 'Compacto (960px)', value: '960px' },
  { label: 'Normal (1200px)', value: '1200px' },
  { label: 'Largo (1600px)', value: '1600px' },
  { label: 'Extra largo (1920px)', value: '1920px' },
  { label: 'Cheio (tela toda)', value: '100%' },
];
