import type { IStyle } from '@fluentui/react';

export const darkActionColors = { fill: '#91bfff', text: '#10233b', hover: '#b5d5ff', nativeChecked: '#3377c1', outline: '#98aec9' };
const primary = '.ms-Button--primary:not(:disabled), button[type="submit"]:not(:disabled), .email-send-test:not(:disabled), button[data-dp-primary-action="true"]:not(:disabled)';
// Scoped to DeskPilot's ThemeProvider and its Fluent Layers, never the SharePoint host.
export const darkControlSelectors: Record<string, IStyle> = {
  'button[aria-label="Open self-service help"]': { backgroundColor: '#2463c7 !important', color: '#ffffff !important', border: '1px solid #6da7ff', boxShadow: '0 4px 20px rgba(0,0,0,.3)' },
  'button[aria-label="Open self-service help"]:hover': { backgroundColor: '#2c6dd5 !important' },
  'button[aria-label="Open self-service help"] .ms-Icon': { color: '#ffffff !important' },
  '.ms-MessageBar': { backgroundColor: '#243e5c !important', color: '#f1f5fb !important', border: '1px solid #789bbf' },
  '.ms-MessageBar .ms-MessageBar-innerText, .ms-MessageBar .ms-MessageBar-text': { color: '#f1f5fb !important' },
  '.ms-MessageBar .ms-MessageBar-icon, .ms-MessageBar .ms-MessageBar-dismissal .ms-Button-icon, .ms-MessageBar .ms-MessageBar-expand .ms-Button-icon': { color: '#b8d8ff !important' },
  '.ms-MessageBar a, .ms-MessageBar .ms-Link': { color: '#b8d8ff !important', textDecoration: 'underline' },
  [primary]: { backgroundColor: darkActionColors.fill+' !important', borderColor: darkActionColors.fill+' !important', color: darkActionColors.text+' !important' },
  '.ms-Button--primary:not(:disabled):hover, button[type="submit"]:not(:disabled):hover, .email-send-test:not(:disabled):hover, button[data-dp-primary-action="true"]:not(:disabled):hover': { backgroundColor: darkActionColors.hover+' !important', borderColor: darkActionColors.hover+' !important' },
  '.ms-Button--primary:not(:disabled) .ms-Button-label, .ms-Button--primary:not(:disabled) .ms-Button-icon, .ms-Button--primary:not(:disabled) .ms-Button-menuIcon, button[type="submit"]:not(:disabled) .ms-Button-label, button[type="submit"]:not(:disabled) .ms-Button-icon, button[data-dp-primary-action="true"]:not(:disabled) .ms-Button-label, button[data-dp-primary-action="true"]:not(:disabled) .ms-Button-icon': { color: darkActionColors.text+' !important' },
  '.ms-Button--primary:disabled': { backgroundColor: '#2c3d53 !important', borderColor: '#405872 !important', color: '#a7b5c8 !important' },
  '.ms-Checkbox-checkbox': { backgroundColor: '#17283e !important', borderColor: darkActionColors.outline+' !important' },
  '.ms-Checkbox.is-checked .ms-Checkbox-checkbox, .ms-Checkbox.is-indeterminate .ms-Checkbox-checkbox': { backgroundColor: darkActionColors.nativeChecked+' !important', borderColor: darkActionColors.fill+' !important' },
  '.ms-Checkbox.is-checked .ms-Checkbox-checkmark': { color: '#ffffff !important' },
  '.ms-Checkbox.is-indeterminate .ms-Checkbox-checkbox:after': { backgroundColor: '#ffffff !important' },
  'input[type="checkbox"]': { borderColor: darkActionColors.outline+' !important', accentColor: darkActionColors.fill },
  'input[type="checkbox"]:checked, input[type="checkbox"]:indeterminate': { backgroundColor: darkActionColors.nativeChecked+' !important', borderColor: darkActionColors.fill+' !important' },
  '.ms-ChoiceField-field:before': { borderColor: darkActionColors.outline+' !important' },
  '.ms-ChoiceField-field.is-checked:before': { borderColor: darkActionColors.fill+' !important' },
  '.ms-ChoiceField-field.is-checked:after': { backgroundColor: darkActionColors.fill+' !important', borderColor: darkActionColors.fill+' !important' },
  '.ms-Toggle.is-enabled .ms-Toggle-background': { backgroundColor: '#405872 !important', borderColor: darkActionColors.outline+' !important' },
  '.ms-Toggle.is-enabled .ms-Toggle-thumb': { backgroundColor: '#edf4ff !important' },
  '.ms-Toggle.is-enabled.is-checked .ms-Toggle-background': { backgroundColor: darkActionColors.fill+' !important', borderColor: darkActionColors.fill+' !important' },
  '.ms-Toggle.is-enabled.is-checked .ms-Toggle-thumb': { backgroundColor: darkActionColors.text+' !important' },
  'button[aria-label="Change ticket status"]': { backgroundColor: darkActionColors.fill+' !important', color: darkActionColors.text+' !important' },
  'button[aria-label="Change ticket status"] .ms-Button-menuIcon': { color: darkActionColors.text+' !important' }
};

// Keep the severity visible against navy surfaces without using pale alert backgrounds.
[
  { types: ['warning', 'severeWarning'], background: '#493b23', accent: '#ffd37a' },
  { types: ['error', 'blocked'], background: '#4b2d3c', accent: '#ffb6bd' },
  { types: ['success'], background: '#1d443f', accent: '#8de0c1' }
].forEach(({ types, background, accent }) => {
  types.forEach(type => {
    const selector = '.ms-MessageBar.ms-MessageBar--' + type;
    darkControlSelectors[selector] = { backgroundColor: background + ' !important', borderColor: accent + ' !important' };
    darkControlSelectors[selector + ' .ms-MessageBar-icon'] = { color: accent + ' !important' };
  });
});
