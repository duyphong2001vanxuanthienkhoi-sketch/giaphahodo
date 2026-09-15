import { occurrences, observanceEvents, birthdayEvents, spanEvents } from '../shared/lunar.js';

const escape = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const stamp = (at = new Date()) => at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const compact = iso => iso.replaceAll('-', '');
const nextDay = iso => {const date = new Date(iso + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10);};
const fold = line => {let out = '', bytes = 0; for (const char of line) {const size = Buffer.byteLength(char); if (bytes + size > 73) {out += '\r\n '; bytes = 1;} out += char; bytes += size;} return out;};

/** An all-day VEVENT starts at local midnight, so an alert N days before at HH:MM
 * is one signed offset from DTSTART. An ICS duration cannot mix signs. */
export function alarmTrigger(daysBefore, hour, minute) {
  const offset = hour * 60 + minute - daysBefore * 1440;
  const sign = offset < 0 ? '-' : '';
  let rest = Math.abs(offset);
  const days = Math.floor(rest / 1440); rest -= days * 1440;
  const hours = Math.floor(rest / 60), minutes = rest - hours * 60;
  const time = hours || minutes || !days ? `T${hours ? hours + 'H' : ''}${minutes || !hours ? minutes + 'M' : ''}` : '';
  return `${sign}P${days ? days + 'D' : ''}${time}`;
}

function alarms(event, reminder) {
  if (!reminder?.enabled) return [];
  return reminder.days.flatMap(day => ['BEGIN:VALARM', 'ACTION:DISPLAY',
    `TRIGGER;RELATED=START:${alarmTrigger(day, reminder.hour, reminder.minute)}`,
    `DESCRIPTION:${escape(`${day === 0 ? 'Hôm nay' : `Còn ${day} ngày`}: ${event.title}`)}`, 'END:VALARM']);
}

export function buildCalendar({ familyName, ancestors, observanceKeys = [], from, to, reminder = null, exportedAt = new Date() }) {
  const memorials = spanEvents(from, to, (a, b) => occurrences(ancestors, a, b)).map(e => ({...e,
    uid: `${e.id}-${e.date}@coi`, title: `Ngày giỗ ${e.name}`, category: 'Ngày giỗ', sequence: e.revision || 1,
    description: `${e.lunar_day}/${e.lunar_month} âm lịch${e.lunar.leap ? ' (tháng nhuận)' : ''}.${e.shifted ? ' Tháng này có 29 ngày; gia đình làm giỗ vào ngày cuối tháng.' : ''}${e.note ? '\n' + e.note : ''}`}));
  const observed = spanEvents(from, to, (a, b) => observanceEvents(observanceKeys, a, b)).map(e => ({...e,
    uid: `obs-${e.obsKey}-${e.date}@coi`, title: e.name, category: 'Việc họ', sequence: 1, location: '',
    description: `${e.lunar_day}/${e.lunar_month} âm lịch.`}));
  const birthdays = spanEvents(from, to, (a, b) => birthdayEvents(ancestors, a, b)).map(e => ({...e,
    uid: `bd-${e.id}-${e.date}@coi`, title: `Sinh nhật ${e.name}`, category: 'Sinh nhật', sequence: e.revision || 1, location: '',
    description: `Tròn ${e.turning} tuổi.`}));
  const events = [...memorials, ...observed, ...birthdays].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'vi'));
  const now = stamp(exportedAt);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Coi//Lich ngay gio//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape('Ngày giỗ · ' + familyName)}`,
    `X-WR-CALDESC:${escape(`Lịch ngày giỗ và việc họ của ${familyName}, tính theo âm lịch Việt Nam.`)}`,
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H'];
  for (const event of events) lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${now}`, `LAST-MODIFIED:${now}`,
    `SEQUENCE:${event.sequence}`, `DTSTART;VALUE=DATE:${compact(event.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(event.date))}`,
    `SUMMARY:${escape(event.title)}`, `DESCRIPTION:${escape(event.description)}`, `LOCATION:${escape(event.location)}`,
    `CATEGORIES:${escape(event.category)}`, 'TRANSP:TRANSPARENT', ...alarms(event, reminder), 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
