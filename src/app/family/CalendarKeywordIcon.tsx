import { CALENDAR_ICON_PATHS, type CalendarIconName } from '@/lib/calendar-icon-paths';
import { calendarIconRule } from '@/lib/calendar-icon-mapping';

export const CalendarSymbol = memo(function CalendarSymbol({ name, size = 22 }: { name: CalendarIconName; size?: number }) {
  const icon = CALENDAR_ICON_PATHS[name];
  return <svg className="family-calendar-symbol" viewBox={icon.viewBox} width={size} height={size}
    fill="currentColor" focusable="false" aria-hidden="true">
    {icon.paths.map((path, i) => <path key={i} d={path} />)}
  </svg>;
});

function CalendarKeywordIcon({ event, size = 22 }: {
  event: { title: string; category?: string }; size?: number;
}) {
  return <CalendarSymbol name={calendarIconRule(event)?.icon ?? 'calendar-days'} size={size} />;
}
import { memo } from 'react';

export default memo(CalendarKeywordIcon, (previous, next) => previous.size === next.size
  && previous.event.title === next.event.title && previous.event.category === next.event.category);
