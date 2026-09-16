/** Dựng quan hệ trong họ thành cây, một lần cho cả hai cách xem.
 *
 * Cây dọc theo nhánh và sơ đồ toàn cảnh nhìn khác nhau nhưng hiểu gia đình y hệt
 * nhau, nên phép dựng phải nằm ở đúng một chỗ: sửa cách hiểu quan hệ thì cả hai
 * cùng đổi, không có chuyện một bên nói ông A có bốn con còn bên kia nói năm. */

export function build(people) {
  const byId = new Map(people.map(p => [p.id, p]));
  const hasParent = p => !!(p && p.parent_id && byId.has(p.parent_id));
  // Anh chị em xếp theo thứ tự sinh trong nhà. Nhiều người chỉ biết năm sinh chứ không
  // biết ngày, và một số chưa biết gì cả, nên thứ tự sinh là căn cứ đầu tiên; ai chưa
  // có thì xuống cuối rồi mới xét tới năm sinh và tên.
  const order = [...people].sort((a, b) => a.generation - b.generation
    || (a.birth_order || 99) - (b.birth_order || 99)
    || (a.birth_year || 9999) - (b.birth_year || 9999)
    || a.name.localeCompare(b.name, 'vi'));

  // Người đứng ở vị trí của mình trên cây là người có gốc trong họ; vợ hoặc chồng
  // cưới vào thì ghép bên cạnh chứ không chiếm một nhánh riêng.
  //
  // Hai căn cứ, xét theo thứ tự: ai có cha mẹ trong họ thì người ấy có gốc; nếu cả
  // hai đều không có — thường là cặp trên cùng, đời mà gia phả không truy được nữa
  // — thì nhìn xuống đời sau, ai được ghi là cha mẹ của lũ con thì người ấy giữ
  // nhánh. Thiếu căn cứ thứ hai này thì ở mắt gốc, tên nào xếp trước theo vần sẽ
  // chiếm chỗ, và cụ ông nhà mình có thể bị ghi là "vợ/chồng" của cụ bà cưới vào.
  const laChaMe = new Set(people.map(p => p.parent_id).filter(Boolean));
  const partnerOf = new Map(), married = new Set();
  for (const person of order) {
    if (married.has(person.id)) continue;
    const spouse = person.spouse_id ? byId.get(person.spouse_id) : null;
    if (!spouse || married.has(spouse.id)) continue;
    const goc = (a, b) => (hasParent(a) !== hasParent(b) ? hasParent(a)
      : laChaMe.has(a.id) !== laChaMe.has(b.id) ? laChaMe.has(a.id)
      : true);
    const primary = goc(person, spouse) ? person : spouse;
    partnerOf.set(primary.id, primary === person ? spouse : person);
    married.add(primary === person ? spouse.id : person.id);
  }

  const nodes = order.filter(p => !married.has(p.id));
  const childrenOf = node => {
    const parents = new Set([node.id, partnerOf.get(node.id)?.id].filter(Boolean));
    return nodes.filter(p => p.parent_id && parents.has(p.parent_id));
  };
  const roots = nodes.filter(p => !hasParent(p) && !hasParent(partnerOf.get(p.id)));
  return { roots, partnerOf, childrenOf, byId, nodes };
}

/** Đếm cả con, cháu, chắt của một nhánh — con số này là thứ giúp người xem quyết định
 * có mở nhánh ra hay không, nên phải đếm hết chứ không chỉ đếm đời kế tiếp. */
export function countBelow(node, tree) {
  return tree.childrenOf(node).reduce((total, child) => total + 1 + countBelow(child, tree), 0);
}

/** Bỏ dấu để tìm tên: gõ "an nhien" phải ra "Đỗ An Nhiên", vì không ai chịu bật
 * bộ gõ tiếng Việt lên chỉ để tìm một cái tên. */
export const khongDau = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

/** Ai là mắt đứng của một người: chính họ nếu có gốc trong họ, còn vợ/chồng cưới
 * vào thì là người bạn đời có gốc. Cần bảng này để lần ngược từ một người bất kỳ
 * về tới gốc, vì `parent_id` có thể trỏ vào người cưới vào. */
export function duongVeGoc(id, tree) {
  const ra = new Set();
  const dung = new Map();
  for (const n of tree.nodes) {
    dung.set(n.id, n.id);
    const ban = tree.partnerOf.get(n.id);
    if (ban) dung.set(ban.id, n.id);
  }
  let hien = dung.get(id);
  while (hien) {
    if (ra.has(hien)) break;                 // dữ liệu vòng tròn thì dừng, đừng treo trình duyệt
    ra.add(hien);
    const nguoi = tree.byId.get(hien);
    hien = nguoi?.parent_id ? dung.get(nguoi.parent_id) : null;
  }
  return ra;
}

/* ===== Bố cục sơ đồ toàn cảnh ==========================================
   Tách khỏi component vì đây là hình học thuần: cùng một họ thì phải ra cùng
   một bố cục, và thứ kiểm được bằng phép tính thì không nên phải mở trình
   duyệt ra nhìn mới biết đúng hay sai. Số đo lấy của bộ Đỗ Gia Motion v2. */

export const CAO_HANG = 164;   // khoảng cách giữa hai đời
export const LE = 38;          // lề quanh cây
export const KHE_GOC = 56;     // khoảng cách giữa hai gốc, khi họ có nhiều hơn một gốc

export const beRong = g => (g.depth === 0 ? (g.members.length === 2 ? 240 : 170) : (g.members.length === 2 ? 224 : 152));
export const beCao = g => (g.depth === 0 ? 114 : 104);
export const khe = g => (g.depth === 0 ? 30 : g.depth === 1 ? 20 : 12);

/** Mỗi "mắt" là một gia đình: người có gốc trong họ, vợ hoặc chồng của người
 * ấy, và đàn con treo bên dưới. Khoá của mắt là id người có gốc. */
export function matGiaDinh(tree) {
  const map = new Map();
  const di = (node, cha, depth) => {
    const ban = tree.partnerOf.get(node.id) || null;
    const con = tree.childrenOf(node);
    map.set(node.id, { id: node.id, parent: cha, depth, members: ban ? [node, ban] : [node], children: con.map(c => c.id) });
    con.forEach(c => di(c, node.id, depth + 1));
  };
  tree.roots.forEach(r => di(r, null, 0));
  return map;
}

/** Xếp một nhánh, toạ độ tính từ mép trái của chính nhánh ấy.
 *
 * Cách ngây thơ — lấy bề rộng nhánh bằng tổng bề rộng đàn con rồi đặt cha mẹ vào
 * giữa khối — chỉ đúng khi các nhánh con rộng bằng nhau. Nhà nào có một người con
 * đông con cháu và một người con không có ai thì khối lệch hẳn sang một bên, mà
 * cha mẹ vẫn đứng giữa khối, thành ra đứng chệch khỏi đàn con của mình.
 *
 * Nên làm ngược lại: xếp đàn con trước, rồi đặt cha mẹ vào đúng trung điểm giữa
 * tâm thẻ người con đầu và tâm thẻ người con út — đó là chỗ làm hai đường nối
 * ngoài cùng đối xứng nhau. Bề rộng của nhánh mới là thứ tính sau cùng, bằng đúng
 * chỗ mà cha mẹ và đàn con thật sự chiếm. */
function xepNhanh(mats, id, gap) {
  const g = mats.get(id), w = beRong(g), h = beCao(g), y = LE + g.depth * CAO_HANG;
  const con = gap.has(id) ? [] : g.children;
  if (!con.length) return { rong: w, tam: w / 2, o: [{ id, x: 0, y, w, h }] };

  const nhanh = con.map(c => xepNhanh(mats, c, gap));
  const k = khe(g);
  const lech = [];
  let x = 0;
  for (const n of nhanh) { lech.push(x); x += n.rong + k; }
  const rongCon = x - k;

  const tamDau = lech[0] + nhanh[0].tam;
  const tamCuoi = lech[nhanh.length - 1] + nhanh[nhanh.length - 1].tam;
  let chaX = (tamDau + tamCuoi) / 2 - w / 2;
  // Cha mẹ rộng hơn cả đàn con thì thẻ thò ra ngoài bên trái; đẩy đàn con sang
  // cho vừa, chứ không kéo cha mẹ về — kéo về là lại lệch tâm.
  const dich = chaX < 0 ? -chaX : 0;
  if (dich) chaX = 0;

  const o = [{ id, x: chaX, y, w, h }];
  nhanh.forEach((n, i) => { for (const m of n.o) o.push({ ...m, x: m.x + lech[i] + dich }); });
  return { rong: Math.max(chaX + w, dich + rongCon), tam: chaX + w / 2, o };
}

/** Xếp cả họ. Nhánh đang gập thì con cháu không chiếm chỗ nữa, nên cả cây tự co
 * lại quanh chỗ trống. */
export function boCuc(mats, gocIds, gap = new Set()) {
  const cho = new Map();
  let trai = LE;
  for (const id of gocIds) {
    const n = xepNhanh(mats, id, gap);
    for (const m of n.o) cho.set(m.id, { x: m.x + trai, y: m.y, w: m.w, h: m.h });
    trai += n.rong + KHE_GOC;
  }
  const o = [...cho.values()];
  const worldW = o.length ? Math.max(...o.map(l => l.x + l.w)) + LE : 400;
  const worldH = o.length ? Math.max(...o.map(l => l.y + l.h)) + 40 : 300;
  const doiCo = [...new Set([...cho.keys()].map(id => mats.get(id).depth))].sort((a, b) => a - b);
  return { cho, worldW, worldH, doiCo };
}
