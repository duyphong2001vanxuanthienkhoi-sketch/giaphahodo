import { useMemo, useState } from 'react';
import { ChevronRight, Users, Minimize2, Maximize2, ImagePlus } from 'lucide-react';
import { Avatar } from './components.jsx';
import { pad } from '../shared/lunar.js';

/** Sơ đồ gia phả: cả người còn sống lẫn người đã khuất, vì gia phả là của cả họ chứ
 * không riêng phần tưởng nhớ.
 *
 * Cây dựng theo chiều dọc, đời sau thụt vào, chứ không trải ngang: ba đời và chín
 * nhánh con thì một cây trải ngang không thể vừa màn hình điện thoại, mà cả họ thì
 * xem bằng điện thoại. Vợ chồng đứng cạnh nhau thành một mắt, và con cái của ai
 * trong hai người cũng đều treo dưới mắt đó. */
export default function FamilyTree({ people, onOpen, onPhoto = null, dangTai = null }) {
  const tree = useMemo(() => build(people), [people]);
  // null là mặc định (mở tới đời cháu), false là chỉ mở đời đầu để nhìn cả họ trong một
  // màn hình, true là mở hết. Đổi `lan` thì các nhánh phải quên trạng thái đang giữ,
  // nên chúng được gắn khoá mới để dựng lại từ đầu.
  const [lan, setLan] = useState(null), [khoa, setKhoa] = useState(0);
  const spread = value => { setLan(value); setKhoa(n => n + 1); };
  if (!tree.roots.length) return null;
  const thuGon = lan === false;
  return <div className="family-tree">
    <div className="tree-tools">
      <button onClick={() => spread(thuGon ? true : false)}>
        {thuGon ? <><Maximize2/>Mở cả cây</> : <><Minimize2/>Thu gọn cả cây</>}
      </button>
    </div>
    <div role="tree" aria-label="Sơ đồ gia phả">
      {tree.roots.map(node => <Branch key={`${node.id}:${khoa}`} node={node} tree={tree} depth={0} lan={lan} onOpen={onOpen} onPhoto={onPhoto} dangTai={dangTai}/>)}
    </div>
  </div>;
}

function build(people) {
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
  const partnerOf = new Map(), married = new Set();
  for (const person of order) {
    if (married.has(person.id)) continue;
    const spouse = person.spouse_id ? byId.get(person.spouse_id) : null;
    if (!spouse || married.has(spouse.id)) continue;
    const primary = !hasParent(person) && hasParent(spouse) ? spouse : person;
    partnerOf.set(primary.id, primary === person ? spouse : person);
    married.add(primary === person ? spouse.id : person.id);
  }

  const nodes = order.filter(p => !married.has(p.id));
  const childrenOf = node => {
    const parents = new Set([node.id, partnerOf.get(node.id)?.id].filter(Boolean));
    return nodes.filter(p => p.parent_id && parents.has(p.parent_id));
  };
  const roots = nodes.filter(p => !hasParent(p) && !hasParent(partnerOf.get(p.id)));
  return { roots, partnerOf, childrenOf };
}

/** Đếm cả con, cháu, chắt của một nhánh — con số này là thứ giúp người xem quyết định
 * có mở nhánh ra hay không, nên phải đếm hết chứ không chỉ đếm đời kế tiếp. */
function countBelow(node, tree) {
  const children = tree.childrenOf(node);
  return children.reduce((total, child) => total + 1 + countBelow(child, tree), 0);
}

function Branch({ node, tree, depth, lan, onOpen, onPhoto, dangTai }) {
  const children = tree.childrenOf(node);
  // Mặc định mở hai đời đầu; sâu hơn thì gập lại để cả cây còn nhìn được một lượt.
  // "Thu gọn cả cây" chỉ để lại đời đầu, nên cả họ nằm gọn trong một màn hình.
  const [open, setOpen] = useState(lan === null ? depth < 2 : lan === false ? depth < 1 : true);
  const partner = tree.partnerOf.get(node.id);
  const below = children.length ? countBelow(node, tree) : 0;
  return <div className={`tree-branch depth-${Math.min(depth, 4)}`} role="treeitem" aria-expanded={children.length ? open : undefined}>
    <div className="tree-row">
      {children.length
        ? <button className={`tree-toggle ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}
            aria-label={`${open ? 'Thu gọn' : 'Mở'} nhánh ${node.name}, ${below} người`}><ChevronRight/></button>
        : <span className="tree-toggle empty" aria-hidden="true"/>}
      {/* Vợ chồng nằm trong một khung có chung đường viền, ngăn nhau bằng một nét mảnh:
          hai ô rời nhau thì mắt đọc ra hai người, một khung thì đọc ra một cặp. */}
      <div className={`tree-couple ${partner ? 'paired' : ''}`}>
        <Chip person={node} onOpen={onOpen} onPhoto={onPhoto} dangTai={dangTai===node.id}/>
        {partner && <Chip person={partner} onOpen={onOpen} onPhoto={onPhoto} dangTai={dangTai===partner.id} married/>}
      </div>
    </div>
    {children.length > 0 && !open && <button className="tree-more" onClick={() => setOpen(true)}>
      <Users/>{below} người trong nhánh này
    </button>}
    {children.length > 0 && open && <div className="tree-children">
      {children.map(child => <Branch key={child.id} node={child} tree={tree} depth={depth + 1} lan={lan} onOpen={onOpen} onPhoto={onPhoto} dangTai={dangTai}/>)}
    </div>}
  </div>;
}

/** Dòng phụ dưới tên nói đúng một điều quan trọng nhất về người đó: người đã khuất thì
 * là ngày giỗ, người còn sống thì là năm sinh. Chữ "vợ/chồng" cho người cưới vào, vì
 * hai ô đứng cạnh nhau thôi thì chưa đủ để biết đó là vợ chồng hay hai anh em. */
function Chip({ person, onOpen, onPhoto, dangTai, married = false }) {
  const years = person.birth_year && person.death_year ? `${person.birth_year} – ${person.death_year}`
    : person.birth_year ? `sinh ${person.birth_year}` : '';
  const facts = person.living ? [years || 'còn sống'] : [years, `giỗ ${pad(person.lunar_day)}/${pad(person.lunar_month)} âm`];
  const note = [married ? 'vợ/chồng' : '', ...facts].filter(Boolean).join(' · ');
  const mat = <Avatar name={person.name} photoId={person.photo_id}/>;
  // Hai mươi bốn người là hai mươi bốn lần mở trang riêng nếu chỉ tải ảnh được ở đó.
  // Chạm thẳng vào vòng mặt trên cây là chọn được ảnh, không rời khỏi sơ đồ.
  return <div className={`tree-chip ${person.living ? 'living' : 'departed'} ${married ? 'married-in' : ''}`}>
    {onPhoto
      ? <label className={`tree-face pickable ${dangTai ? 'dang-tai' : ''}`} title={`Thêm ảnh cho ${person.name}`}>
          {mat}
          <span className="tree-face-hint" aria-hidden="true"><ImagePlus/></span>
          <input type="file" accept="image/*" hidden disabled={dangTai}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(person, f); }}/>
          <span className="visually-hidden">Thêm ảnh cho {person.name}</span>
        </label>
      : <span className="tree-face">{mat}</span>}
    <button className="tree-open" onClick={() => onOpen(person)} title={person.name}>
      <span className="tree-chip-text"><strong>{person.name}</strong><small>{dangTai ? 'đang tải ảnh…' : note}</small></span>
    </button>
  </div>;
}
