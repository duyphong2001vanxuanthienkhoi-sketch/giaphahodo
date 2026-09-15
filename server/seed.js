import { randomUUID } from 'node:crypto';
import { transaction } from './db.js';
import { addDays,lunarDate,todayInVietnam } from '../shared/lunar.js';

export async function seedDemo(db,role='admin') {
  if(!await db.get("SELECT id FROM families WHERE id='demo-family'")) await db.transaction(async tx => {
    await tx.run('INSERT INTO families(id,name,home) VALUES(?,?,?)', 'demo-family','Dòng họ Nguyễn','Nhà thờ họ Nguyễn · Quảng Ninh');
    const adminId=randomUUID(),memberId=randomUUID();
    await tx.run('INSERT INTO users(id,family_id,email,name,role) VALUES(?,?,?,?,?)', adminId,'demo-family','minhha@example.test','Nguyễn Minh Hà','admin');
    await tx.run('INSERT INTO users(id,family_id,email,name,role) VALUES(?,?,?,?,?)', memberId,'demo-family','thuan@example.test','Nguyễn Thu An','member');
    const seed=[
      {name:'Cụ Nguyễn Văn An',generation:3,birth:1921,death:1998,offset:3,biography:'Cụ là người gìn giữ nếp nhà, luôn dạy con cháu sống tử tế và nhớ về cội nguồn. Mỗi dịp sum họp, lời căn dặn của cụ vẫn được nhắc lại qua nhiều thế hệ.',note:'Gia đình chuẩn bị hương hoa và cùng có mặt trước 9 giờ.'},
      {name:'Cụ Trần Thị Hòa',generation:3,birth:1924,death:2005,offset:8,biography:'Trong ký ức của con cháu, cụ luôn gắn với căn bếp ấm, những bữa cơm sum vầy và sự ân cần dành cho từng người trong nhà.',note:'Thắp hương tại nhà thờ họ.'},
      {name:'Ông Nguyễn Văn Bình',generation:4,birth:1948,death:2019,offset:16,biography:'Ông yêu những cuốn sách cũ và thường kể cho con cháu nghe chuyện về quê hương. Những trang ghi chép của ông được gia đình giữ lại như một phần ký ức chung.',note:''},
      {name:'Bà Nguyễn Thị Lan',generation:4,birth:1950,death:2021,offset:42,biography:'Bà sống gần gũi, giản dị và luôn dành thời gian chăm lo cho gia đình. Con cháu vẫn nhớ khu vườn nhỏ và những buổi chiều ngồi bên bà.',note:''},
      {name:'Ông Nguyễn Văn Đức',generation:4,birth:1955,death:2022,offset:75,biography:'Ông thường nhắc con cháu dù đi xa vẫn giữ liên lạc với gia đình, cùng trở về trong những ngày quan trọng.',note:''},
    ];
    let parentId;
    for(const [i,p] of seed.entries()) {
      const id=randomUUID(),lunar=lunarDate(addDays(todayInVietnam(),p.offset));
      await tx.run('INSERT INTO ancestors(id,family_id,name,generation,branch,birth_year,death_year,parent_id,lunar_day,lunar_month,leap_policy,location,biography,note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id,'demo-family',p.name,p.generation,i===4?'Chi hai':'Chi trưởng',p.birth,p.death,i>=2?parentId:null,lunar.day,lunar.month,'regular','Nhà thờ họ Nguyễn',p.biography,p.note,adminId);
      if(i===0)parentId=id;
    }
  });
  return await db.get('SELECT * FROM users WHERE family_id=? AND role=? AND active=1 ORDER BY created_at LIMIT 1', 'demo-family',role);
}
