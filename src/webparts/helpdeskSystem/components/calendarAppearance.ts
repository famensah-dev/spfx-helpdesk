import type { ICalendarProps } from '@fluentui/react';
export const calendarAppearance: ICalendarProps = {
  isMonthPickerVisible: false,
  showGoToToday: true,
  styles: { root: { width: 248, background: "var(--dp-bg-fff, #fff)", borderRadius: 6 }, goTodayButton: { alignSelf: 'stretch', margin: '2px 12px 12px', background: "var(--dp-bg-f0f5fc, #f0f5fc)", borderRadius: 4, color: "var(--dp-fg-1b385c, #1b385c)", fontSize: 12, fontWeight: 600 } },
  calendarDayProps: { styles: {
    root: { width: 224, padding: 12 },
    monthAndYear: { color: "var(--dp-fg-1b385c, #1b385c)", fontSize: 14, fontWeight: 600 },
    headerIconButton: { borderRadius: 4, color: "var(--dp-fg-526e93, #526e93)" },
    table: { borderCollapse: 'separate', borderSpacing: '0' },
    dayCell: { width: 32, height: 32, lineHeight: '32px' },
    dayButton: { width: 28, height: 28, lineHeight: '28px', borderRadius: 5, fontSize: 12 },
    daySelected: {
      background: "var(--dp-bg-fff0bb, #fff0bb)!important", borderRadius: '6px!important', color: "var(--dp-fg-735100, #735100)",
      selectors: {
        '&::before': { borderRadius: 'inherit' },
        '&:hover, &.ms-CalendarDay-hoverStyle, &.ms-CalendarDay-pressedStyle': { background: "var(--dp-bg-fff0bb, #fff0bb)!important" }
      }
    },
    dayIsToday: { background: "var(--dp-bg-1b385c, #1b385c)!important", color: "var(--dp-fg-fff, #fff)!important", borderRadius: 5 }
  } }
};