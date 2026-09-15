import test from 'node:test';
import assert from 'node:assert/strict';
import { lunarDate, occurrences, todayInVietnam, vietnamClock, addDays, monthGrid } from '../shared/lunar.js';
const ancestor={id:'test',name:'Người thân',lunar_day:1,lunar_month:6,leap_policy:'regular',short_month_policy:'last-day'};
test('Tết, Trung thu và lịch Việt Nam khác lịch Trung Quốc năm 1985',()=>{
  assert.deepEqual(lunarDate('2026-02-17'),{day:1,month:1,year:2026,leap:false});
  assert.deepEqual(lunarDate('2026-09-25'),{day:15,month:8,year:2026,leap:false});
  assert.deepEqual(lunarDate('1985-01-21'),{day:1,month:1,year:1985,leap:false});
});
test('Lặp hàng năm theo âm lịch thay vì cố định ngày dương',()=>{
  const p={...ancestor,lunar_day:15,lunar_month:8};
  assert.equal(occurrences([p],'2025-01-01','2025-12-31')[0].date,'2025-10-06');
  assert.equal(occurrences([p],'2026-01-01','2026-12-31')[0].date,'2026-09-25');
});
test('Ba quy ước cho tháng 6 nhuận năm 2025',()=>{
  const dates=policy=>occurrences([{...ancestor,leap_policy:policy}],'2025-01-01','2025-12-31').map(e=>e.date);
  assert.deepEqual(dates('regular'),['2025-06-25']);
  assert.deepEqual(dates('prefer-leap'),['2025-07-25']);
  assert.deepEqual(dates('both'),['2025-06-25','2025-07-25']);
  assert.equal(occurrences([{...ancestor,leap_policy:'prefer-leap'}],'2026-01-01','2026-12-31').length,1);
});
test('Ngày 30 của tháng thiếu chuyển về 29 hoặc bỏ qua',()=>{
  const p={...ancestor,lunar_day:30,lunar_month:2};
  const fallback=occurrences([p],'2025-01-01','2025-12-31');
  assert.equal(fallback.length,1);assert.equal(fallback[0].lunar.day,29);assert.equal(fallback[0].shifted,true);
  assert.equal(occurrences([{...p,short_month_policy:'skip'}],'2025-01-01','2025-12-31').length,0);
});
test('Ranh giới ngày và giờ gửi dùng UTC+7',()=>{
  assert.equal(todayInVietnam(new Date('2026-09-14T17:01:00Z')),'2026-09-15');
  assert.equal(vietnamClock(new Date('2026-09-15T00:00:00Z')),420);
  assert.equal(addDays('2028-02-28',1),'2028-02-29');
  assert.equal(monthGrid(2026,9)[0].date,'2026-08-31');
  assert.throws(()=>lunarDate('2026-02-31'));
});
