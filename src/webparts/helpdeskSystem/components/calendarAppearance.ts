import type { ICalendarProps } from '@fluentui/react';
export const calendarAppearance: ICalendarProps = {
  isMonthPickerVisible: false,
  showGoToToday: true,
  styles: { root: { width: 248, background: '#fff', borderRadius: 6 }, goTodayButton: { alignSelf: 'stretch', margin: '2px 12px 12px', background: '#f0f5fc', borderRadius: 4, color: '#1b385c', fontSize: 12, fontWeight: 600 } },
  calendarDayProps: { styles: {
    root: { width: 224, padding: 12 },
    monthAndYear: { color: '#1b385c', fontSize: 14, fontWeight: 600 },
    headerIconButton: { borderRadius: 4, color: '#526e93' },
    table: { borderCollapse: 'separate', borderSpacing: '0' },
    dayCell: { width: 32, height: 32, lineHeight: '32px' },
    dayButton: { width: 28, height: 28, lineHeight: '28px', borderRadius: 5, fontSize: 12 },
    daySelected: {
      background: '#fff0bb!important', borderRadius: '6px!important', color: '#735100',
      selectors: {
        '&::before': { borderRadius: 'inherit' },
        '&:hover, &.ms-CalendarDay-hoverStyle, &.ms-CalendarDay-pressedStyle': { background: '#fff0bb!important' }
      }
    },
    dayIsToday: { background: '#1b385c!important', color: '#fff!important', borderRadius: 5 }
  } }
};