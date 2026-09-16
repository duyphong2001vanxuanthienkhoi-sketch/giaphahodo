import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, boCuc, matGiaDinh, beRong, khongDau, duongVeGoc, countBelow } from '../src/family.js';

/** Sơ đồ toàn cảnh xếp người bằng phép tính chứ không bằng bố cục của trình duyệt,
 * nên nó sai được theo những cách mà mắt chỉ thấy khi cây đã đủ đông: thẻ đè lên
 * thẻ, cha mẹ lệch khỏi đàn con, hai đời chung một tầng. Những thứ ấy kiểm bằng
 * số được, và phải kiểm bằng đúng dòng họ thật chứ không bằng ba người bịa ra. */

const roster = JSON.parse(readFileSync(new URL('../scripts/gia-pha.json', import.meta.url), 'utf8'));

/** Hồ sơ nhập liệu ghi quan hệ bằng tên; sơ đồ cần id, nên dựng lại cho giống
 * đúng cái mảng mà máy chủ trả về. */
function nhuTrongApp(list) {
  const id = new Map(list.map((p, i) => [p.name, 'p' + i]));
  return list.map((p, i) => ({
    id: 'p' + i,
    name: p.name,
    generation: p.generation,
    birth_order: p.birth_order || null,
    birth_year: p.birth_year || null,
    death_year: p.death_year || null,
    living: p.living ? 1 : 0,
    branch: p.branch || 'Chưa phân chi',
    lunar_day: p.lunar_day || 1,
    lunar_month: p.lunar_month || 1,
    parent_id: p.parent ? (id.get(p.parent) ?? null) : null,
    spouse_id: p.spouse ? (id.get(p.spouse) ?? null) : null,
    photo_id: null,
    biography: '',
  }));
}

const people = nhuTrongApp(roster.people || roster);
const tree = build(people);
const mats = matGiaDinh(tree);
const gocIds = tree.roots.map(r => r.id);

test('Cả họ đều có chỗ trên sơ đồ, không ai rơi ra ngoài', () => {
  assert.ok(people.length >= 20, `hồ sơ mẫu phải đủ đông mới kiểm được, đang có ${people.length}`);
  const { cho } = boCuc(mats, gocIds);
  const tren = new Set();
  for (const id of cho.keys()) for (const m of mats.get(id).members) tren.add(m.id);
  const thieu = people.filter(p => !tren.has(p.id)).map(p => p.name);
  assert.deepEqual(thieu, [], 'những người này không xuất hiện trên sơ đồ');
});

test('Không thẻ nào đè lên thẻ nào', () => {
  const { cho } = boCuc(mats, gocIds);
  const o = [...cho.entries()].map(([id, l]) => ({ id, ...l }));
  for (let i = 0; i < o.length; i++) for (let j = i + 1; j < o.length; j++) {
    const a = o[i], b = o[j];
    const deNgang = a.x < b.x + b.w && b.x < a.x + a.w;
    const deDoc = a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!(deNgang && deDoc),
      `${mats.get(a.id).members[0].name} đè lên ${mats.get(b.id).members[0].name}`);
  }
});

test('Người cùng đời nằm đúng một tầng, đời sau luôn ở dưới đời trước', () => {
  const { cho } = boCuc(mats, gocIds);
  const tangCuaDoi = new Map();
  for (const [id, l] of cho) {
    const d = mats.get(id).depth;
    if (tangCuaDoi.has(d)) assert.equal(tangCuaDoi.get(d), l.y, `đời ${d + 1} bị tách làm hai tầng`);
    else tangCuaDoi.set(d, l.y);
  }
  const doi = [...tangCuaDoi.keys()].sort((a, b) => a - b);
  for (let i = 1; i < doi.length; i++) {
    assert.ok(tangCuaDoi.get(doi[i]) > tangCuaDoi.get(doi[i - 1]), 'đời sau phải nằm dưới đời trước');
  }
});

test('Cha mẹ đứng đúng giữa tâm đàn con', () => {
  const { cho } = boCuc(mats, gocIds);
  for (const [id, g] of mats) {
    if (!g.children.length) continue;
    const con = g.children.map(c => cho.get(c)).filter(Boolean);
    if (!con.length) continue;
    const trai = Math.min(...con.map(l => l.x)), phai = Math.max(...con.map(l => l.x + l.w));
    const tamCon = (trai + phai) / 2, tamCha = cho.get(id).x + cho.get(id).w / 2;
    assert.ok(Math.abs(tamCon - tamCha) < 0.75,
      `${g.members[0].name} lệch ${Math.round(tamCon - tamCha)}px khỏi tâm đàn con`);
  }
});

test('Gập một nhánh thì cây hẹp lại, mở ra thì rộng như cũ', () => {
  const rong = boCuc(mats, gocIds).worldW;
  const coCon = [...mats.values()].find(g => g.children.length && g.depth > 0);
  assert.ok(coCon, 'hồ sơ mẫu phải có ít nhất một nhánh con để gập');
  const gapLai = boCuc(mats, gocIds, new Set([coCon.id]));
  assert.ok(gapLai.worldW <= rong, 'gập nhánh mà cây lại rộng ra');
  for (const con of coCon.children) assert.ok(!gapLai.cho.has(con), 'người trong nhánh đã gập vẫn còn trên sơ đồ');
  assert.equal(boCuc(mats, gocIds).worldW, rong, 'mở lại phải về đúng bề rộng cũ');
});

test('Thẻ đủ rộng cho một cặp vợ chồng, và vợ chồng nằm chung một thẻ', () => {
  for (const g of mats.values()) {
    assert.ok(g.members.length <= 2, `${g.members[0].name} có ${g.members.length} người trong một mắt`);
    if (g.members.length === 2) assert.ok(beRong(g) >= 224, 'thẻ đôi phải rộng hơn thẻ đơn');
  }
});

test('Đường về gốc dừng đúng ở gốc, kể cả khi lần từ người cưới vào', () => {
  for (const g of mats.values()) {
    for (const nguoi of g.members) {
      const duong = duongVeGoc(nguoi.id, tree);
      assert.ok(duong.has(g.id), `${nguoi.name} không nhận ra mắt của chính mình`);
      assert.ok(gocIds.some(id => duong.has(id)), `${nguoi.name} không lần được về tới gốc`);
      assert.ok(duong.size <= mats.size, 'đường về gốc đi vòng');
    }
  }
});

test('Đếm người trong nhánh đếm hết cả con cháu chắt', () => {
  const goc = tree.roots[0];
  const conCháu = countBelow(goc, tree);
  const matDuoiGoc = [...mats.values()].filter(g => g.depth > 0).length;
  assert.equal(conCháu, matDuoiGoc, 'số nhánh dưới gốc không khớp với số mắt dưới gốc');
});

test('Tìm tên không cần gõ dấu', () => {
  const co = ten => people.some(p => khongDau(p.name).includes(khongDau(ten)));
  assert.ok(khongDau('Đỗ Văn Hải'), 'khongDau không được trả về chuỗi rỗng');
  assert.equal(khongDau('Đỗ Văn Hải'), 'do van hai');
  assert.equal(khongDau('Nguyễn Thị Bình'), 'nguyen thi binh');
  const dau = people[0].name;
  assert.ok(co(khongDau(dau)), `gõ "${khongDau(dau)}" phải tìm ra "${dau}"`);
});

test('Ở mắt gốc, người giữ nhánh là người con cháu nối vào, không phải người xếp trước theo vần', () => {
  // Cặp trên cùng của một dòng họ không ai có cha mẹ trong sổ — gia phả truy tới đó
  // là hết. Nếu chỉ xét "ai có cha mẹ" thì hai người hoà nhau, và tên nào xếp trước
  // theo vần sẽ chiếm mắt, khiến cụ ông nhà mình bị ghi là "vợ/chồng" của cụ bà.
  const ho = [
    { id: 'ba', name: 'Cụ bà', generation: 1, living: 0, parent_id: null, spouse_id: 'ong' },
    { id: 'ong', name: 'Đỗ Văn Ông', generation: 1, living: 0, parent_id: null, spouse_id: 'ba' },
    { id: 'con', name: 'Đỗ Văn Con', generation: 2, living: 1, parent_id: 'ong', spouse_id: null },
  ];
  const t = build(ho);
  assert.equal(t.roots.length, 1, 'một cặp thì chỉ dựng một mắt gốc');
  assert.equal(t.roots[0].name, 'Đỗ Văn Ông', 'người được ghi là cha của con cháu phải giữ mắt gốc');
  assert.equal(t.partnerOf.get('ong')?.name, 'Cụ bà', 'người kia ghép bên cạnh');
  assert.equal(t.childrenOf(t.roots[0]).length, 1, 'con vẫn treo dưới đúng mắt ấy');

  // Còn khi một người có cha mẹ trong họ thì căn cứ ấy vẫn thắng, dù tên xếp sau.
  const cuoiVao = [
    { id: 'cha', name: 'Đỗ Văn Cha', generation: 1, living: 0, parent_id: null, spouse_id: null },
    { id: 'z', name: 'Đỗ Văn Z', generation: 2, living: 1, parent_id: 'cha', spouse_id: 'a' },
    { id: 'a', name: 'An Thị A', generation: 2, living: 1, parent_id: null, spouse_id: 'z' },
  ];
  const t2 = build(cuoiVao);
  assert.equal(t2.childrenOf(t2.roots[0])[0].name, 'Đỗ Văn Z', 'người có cha mẹ trong họ giữ nhánh');
  assert.equal(t2.partnerOf.get('z')?.name, 'An Thị A', 'người cưới vào ghép bên cạnh');
});
