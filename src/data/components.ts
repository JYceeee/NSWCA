import type { ColorRef, FieldValue } from '../types'
import type { TokenKey } from './tokens'

export type FieldDef =
  | { key: string; label: string; desc?: string; type: 'color'; default: ColorRef }
  | { key: string; label: string; desc?: string; type: 'number'; default: number; min?: number; max?: number; unit?: string }
  | { key: string; label: string; desc?: string; type: 'textStyle'; default: string }
  | { key: string; label: string; desc?: string; type: 'optNumber'; default: null; min?: number; max?: number; unit?: string }
  | { key: string; label: string; desc?: string; type: 'select'; default: string; options: { value: string; label: string }[] }
  | { key: string; label: string; desc?: string; type: 'text'; default: string }

export interface FieldGroup {
  label?: string
  fields: FieldDef[]
}

export interface ComponentDef {
  id: string
  name: string
  description: string
  kind: 'button' | 'pill' | 'card' | 'section' | 'darkBand' | 'link' | 'sidebar' | 'formField'
  groups: FieldGroup[]
}

const t = (token: TokenKey, alpha = 100): ColorRef => ({ token, alpha })

const color = (key: string, label: string, def: ColorRef, desc?: string): FieldDef => ({ key, label, desc, type: 'color', default: def })
const num = (key: string, label: string, def: number, unit = 'px', max = 64, desc?: string): FieldDef => ({ key, label, desc, type: 'number', default: def, min: 0, max, unit })
const textStyle = (key: string, label: string, def: string, desc?: string): FieldDef => ({ key, label, desc, type: 'textStyle', default: def })
const optNum = (key: string, label: string, desc: string, unit = 'px'): FieldDef => ({ key, label, desc, type: 'optNumber', default: null, min: 0, max: 900, unit })
const text = (key: string, label: string, def: string, desc?: string): FieldDef => ({ key, label, desc, type: 'text', default: def })

function textGroup(style: string, label = 'Text used'): FieldGroup {
  return {
    label,
    fields: [
      textStyle('textStyle', 'Text style', style, 'Picked from Typography'),
      optNum('sizeOverride', 'Size override', 'Leave empty to use the text style size'),
      optNum('weightOverride', 'Weight override', 'Leave empty to use the text style weight', ''),
    ],
  }
}

interface ButtonColors {
  bg: ColorRef; text: ColorRef; border: ColorRef
  hoverBg: ColorRef; hoverText: ColorRef; hoverBorder: ColorRef
  pressedBg: ColorRef
}

function button(id: string, name: string, description: string, label: string, c: ButtonColors): ComponentDef {
  return {
    id, name, description, kind: 'button',
    groups: [
      { label: 'Default', fields: [color('bg', 'Background', c.bg), color('text', 'Text', c.text), color('border', 'Border', c.border)] },
      { label: 'Hover', fields: [color('hoverBg', 'Background', c.hoverBg), color('hoverText', 'Text', c.hoverText), color('hoverBorder', 'Border', c.hoverBorder)] },
      { label: 'Pressed', fields: [color('pressedBg', 'Background', c.pressedBg)] },
      { label: 'Disabled', fields: [color('disabledBg', 'Background', t('panel')), color('disabledText', 'Text', t('subtle'))] },
      {
        label: 'Shape',
        fields: [num('radius', 'Corner radius', 8), num('borderWidth', 'Border width', 1, 'px', 6), num('paddingY', 'Padding (vertical)', 9, 'px', 32), num('paddingX', 'Padding (horizontal)', 16, 'px', 48)],
      },
      textGroup('button'),
      { label: 'Sample', fields: [text('label', 'Sample label', label)] },
    ],
  }
}

function pill(id: string, name: string, description: string, label: string, bg: ColorRef, fg: ColorRef): ComponentDef {
  return {
    id, name, description, kind: 'pill',
    groups: [
      { label: 'Colours', fields: [color('bg', 'Background', bg), color('text', 'Text', fg), color('border', 'Border', bg)] },
      { label: 'Shape', fields: [num('radius', 'Corner radius', 999, 'px', 999), num('borderWidth', 'Border width', 1, 'px', 4), num('paddingX', 'Padding (horizontal)', 12, 'px', 32), num('paddingY', 'Padding (vertical)', 4, 'px', 16)] },
      textGroup('pill'),
      { label: 'Sample', fields: [text('label', 'Sample label', label)] },
    ],
  }
}

export const COMPONENTS: ComponentDef[] = [
  button('btnPrimary', 'Primary button', 'Main actions (Save, Add, Apply).', 'Primary', {
    bg: t('primary'), text: t('on-primary'), border: t('primary'),
    hoverBg: t('primary-hover'), hoverText: t('on-primary'), hoverBorder: t('primary-hover'),
    pressedBg: t('primary-hover'),
  }),
  button('btnSecondary', 'Secondary button', 'Second-level actions (Manage, Export).', 'Secondary', {
    bg: t('secondary'), text: t('on-secondary'), border: t('secondary'),
    hoverBg: t('secondary-hover'), hoverText: t('on-secondary'), hoverBorder: t('secondary-hover'),
    pressedBg: t('secondary-hover'),
  }),
  button('btnSoft', 'Soft button', 'Low-emphasis actions (Cancel, Filters).', 'Soft', {
    bg: t('secondary-tint'), text: t('secondary'), border: t('secondary-tint'),
    hoverBg: t('border'), hoverText: t('secondary'), hoverBorder: t('border'),
    pressedBg: t('border-strong'),
  }),
  button('btnDanger', 'Danger button', 'Destructive actions (Delete, Remove).', 'Delete', {
    bg: t('card'), text: t('danger'), border: t('danger-tint'),
    hoverBg: t('danger-tint'), hoverText: t('danger'), hoverBorder: t('danger'),
    pressedBg: t('danger-tint'),
  }),
  pill('pillNeutral', 'Neutral pill', 'Default tags and counts.', 'Pill', t('panel'), t('muted')),
  pill('pillSuccess', 'Success pill', 'Positive states (Confirmed, Paid).', 'Confirmed', t('success-tint'), t('success')),
  pill('pillWarning', 'Warning pill', 'In-between states (Pending, In progress).', 'Pending', t('warning-tint'), t('warning')),
  pill('pillDanger', 'Danger pill', 'Problem states (Disputed, Error).', 'Disputed', t('danger-tint'), t('danger')),
  {
    id: 'card', name: 'Card', description: 'White content cards.', kind: 'card',
    groups: [
      { label: 'Colours', fields: [color('bg', 'Background', t('card')), color('border', 'Border', t('border-light')), color('title', 'Title text', t('heading')), color('text', 'Body text', t('text')), color('number', 'Card number', t('heading'))] },
      {
        label: 'Shape',
        fields: [
          num('radius', 'Corner radius', 14), num('borderWidth', 'Border width', 1, 'px', 6), num('padding', 'Padding', 18, 'px', 48),
          { key: 'shadow', label: 'Shadow', type: 'select', default: 'sm', options: [
            { value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' },
          ] },
        ],
      },
      textGroup('h3', 'Title text style'),
    ],
  },
  {
    id: 'section', name: 'Section', description: 'Grouping panel that holds cards or pills.', kind: 'section',
    groups: [
      { label: 'Colours', fields: [color('bg', 'Background', t('panel')), color('border', 'Border', t('border'))] },
      { label: 'Shape', fields: [num('radius', 'Corner radius', 12), num('borderWidth', 'Border width', 1, 'px', 6), num('padding', 'Padding', 14, 'px', 48)] },
    ],
  },
  {
    id: 'darkBand', name: 'Dark band', description: 'Dark strip with a highlighted number and active nav.', kind: 'darkBand',
    groups: [
      { label: 'Colours', fields: [color('bg', 'Background', t('dark')), color('number', 'Card number', t('primary')), color('text', 'Card text', t('on-dark')), color('activeBg', 'Active nav background', t('dark-active-bg')), color('activeText', 'Active nav text', t('dark-active-text'))] },
      { label: 'Text used', fields: [textStyle('numberStyle', 'Number style', 'cardNumber'), textStyle('textStyle', 'Text style', 'cardText')] },
      { label: 'Shape', fields: [num('activeRadius', 'Active nav radius', 6), num('padding', 'Padding', 24, 'px', 64)] },
      { label: 'Sample', fields: [text('number', 'Number', '#3'), text('label', 'Label', 'Club ranking')] },
    ],
  },
  {
    id: 'link', name: 'Link', description: 'Text links.', kind: 'link',
    groups: [
      { label: 'Colours', fields: [color('color', 'Link colour', t('link')), color('hoverColor', 'Hover colour', t('primary-hover'))] },
      {
        label: 'Decoration',
        fields: [{ key: 'underline', label: 'Underline', type: 'select', default: 'hover', options: [
          { value: 'none', label: 'Never' }, { value: 'hover', label: 'On hover' }, { value: 'always', label: 'Always' },
        ] }],
      },
      textGroup('link'),
    ],
  },
  {
    id: 'sidebar', name: 'Sidebar', description: 'The dark menu on the left (and the Settings menu).', kind: 'sidebar',
    groups: [
      {
        fields: [
          color('bg', 'Background', t('dark'), 'The sidebar itself'),
          color('title', 'Title text', t('on-dark'), '"Club Management" heading'),
          color('menuText', 'Menu text', t('on-dark', 78), 'Menu items'),
          color('selectedText', 'Selected menu text', t('on-dark'), 'The page you are on'),
          color('smallText', 'Small text', t('subtle'), 'Sub-title, arrows, "Logged in as"'),
          color('hover', 'Hover highlight', t('on-dark', 6), 'Menu item under the mouse'),
          color('selected', 'Selected highlight', t('on-dark', 10), 'Background of the page you are on'),
          color('divider', 'Divider lines', t('on-dark', 12), 'Lines above and below the menu'),
          color('dot', 'Menu dot', t('on-dark', 30), 'Small dot before each menu item'),
          color('selectedDot', 'Selected menu dot', t('primary'), 'Dot of the page you are on'),
        ],
      },
    ],
  },
]

COMPONENTS.push({
  id: 'formField', name: 'Form field', description: 'Labelled inputs and dropdowns, e.g. the Profile form.', kind: 'formField',
  groups: [
    { label: 'Label', fields: [color('label', 'Label text', t('heading')), color('required', 'Required star', t('danger'))] },
    {
      label: 'Input',
      fields: [color('inputBg', 'Background', t('panel')), color('inputText', 'Text', t('heading')), color('placeholder', 'Placeholder', t('subtle')), color('inputBorder', 'Border', t('panel'))],
    },
    { label: 'Dropdown', fields: [color('selectBg', 'Background', t('card')), color('selectBorder', 'Border', t('muted'))] },
    { label: 'States', fields: [color('focusBorder', 'Focus border', t('secondary')), color('error', 'Error', t('danger'))] },
    { label: 'Text used', fields: [textStyle('labelStyle', 'Label style', 'h3'), textStyle('inputStyle', 'Input text style', 'p1')] },
    {
      label: 'Shape',
      fields: [
        num('radius', 'Corner radius', 0),
        num('borderWidth', 'Input border width', 1, 'px', 6),
        num('selectBorderWidth', 'Dropdown border width', 3, 'px', 6),
        num('paddingY', 'Padding (vertical)', 14, 'px', 32),
        num('paddingX', 'Padding (horizontal)', 14, 'px', 48),
      ],
    },
  ],
})

export const COMPONENT_MAP: Record<string, ComponentDef> = Object.fromEntries(COMPONENTS.map((c) => [c.id, c]))

export function fieldDef(componentId: string, key: string): FieldDef | undefined {
  return COMPONENT_MAP[componentId]?.groups.flatMap((g) => g.fields).find((f) => f.key === key)
}

export function schemaDefault(componentId: string, key: string): FieldValue {
  return fieldDef(componentId, key)?.default ?? null
}
