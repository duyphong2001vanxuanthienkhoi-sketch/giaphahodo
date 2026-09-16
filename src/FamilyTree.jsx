import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Users, Minimize2, Maximize2, ImagePlus } from 'lucide-react';
import { Avatar } from './components.jsx';
import { build, countBelow, duongVeGoc } from './family.js';
import { doCho, chayVe } from './motion.js';
import { pad } from '../shared/lunar.js';

/** Sơ đồ gia phả theo nhánh: cả người còn sống lẫn người đã khuất, vì gia phả là
 * của cả họ chứ không riêng phần tưởng nhớ.
 *
 * Cây dựng theo chiều dọc, đời sau thụt vào, chứ không trải ngang: ba đời và chín
 * nhánh con thì một cây trải ngang không thể vừa màn hình điện thoại, mà cả họ thì
 * xem bằng điện thoại. Vợ chồng đứng cạnh nhau thành một mắt, và con cái của ai
 * trong hai người cũng đều treo dưới mắt đó.
 *
 * Trạng thái đóng/mở của từng nhánh nằm ở đây chứ không nằm trong từng nhánh, vì
 * mở một nhánh làm cả đàn em phía dưới nhảy chỗ; muốn kéo chúng về chỗ cũ rồi thả
 * ra cho mượt thì phải có một chỗ nhìn thấy cả cây cùng lúc. */
export default function FamilyTree({ people, onOpen, onPhoto = null, dangTai = null }) {
  const tree = useMemo(() => build(people), [people]);

  // Danh sách phẳng mọi mắt kèm độ sâu — cần để quyết định mặc định mở tới đâu
  // mà không phải đi lại cả cây mỗi lần dựng.
  const sau = useMemo(() => {
    const map = new Map();
    const di = (node, d) => { map.set(node.id, d); tree.childrenOf(node).forEach(c => di(c, d + 1)); };
    tree.roots.forEach(r => di(r, 0));
    return map;
  }, [tree]);

  const macDinh = useCallback(toi => {
    const ra = new Set();
    for (const [id, d] of sau) if (d < toi) ra.add(id);
    return ra;
  }, [sau]);

  const [moRa, setMoRa] = useState(() => macDinh(2));
  const [sang, setSang] = useState(null);       // người đang rê tới, để soi đường về gốc
  const hopRef = useRef(null), choCu = useRef(null);

  /** Đo trước, đổi, rồi kéo mọi nhánh về chỗ cũ và thả ra. Không có bước này thì
   * mở một nhánh là cả nửa trang bên dưới nhảy một phát, mắt mất dấu người đang xem. */
  const doiCho = useCallback(viec => {
    choCu.current = doCho(hopRef.current);
    viec();
  }, []);

  useLayoutEffect(() => {
    if (!choCu.current) return;
    chayVe(hopRef.current, choCu.current);
    choCu.current = null;
  });

  const doiNhanh = useCallback(id => doiCho(() => setMoRa(cu => {
    const moi = new Set(cu);
    moi.has(id) ? moi.delete(id) : moi.add(id);
    return moi;
  })), [doiCho]);

  const trai = useMemo(() => (sang ? duongVeGoc(sang, tree) : null), [sang, tree]);

  if (!tree.roots.length) return null;
  const thuGon = moRa.size <= tree.roots.length;

  return <div className="family-tree" ref={hopRef}>
    <div className="tree-tools">
      <button onClick={() => doiCho(() => setMoRa(macDinh(thuGon ? 99 : 1)))}>
        {thuGon ? <><Maximize2/>Mở cả cây</> : <><Minimize2/>Thu gọn cả cây</>}
      </button>
    </div>
    <div role="tree" aria-label="Sơ đồ gia phả">
      {tree.roots.map((node, i) => <Branch key={node.id} node={node} tree={tree} depth={0} thu={i}
        moRa={moRa} doiNhanh={doiNhanh} trai={trai} soi={setSang}
        onOpen={onOpen} onPhoto={onPhoto} dangTai={dangTai}/>)}
    </div>
  </div>;
}

function Branch({ node, tree, depth, thu, moRa, doiNhanh, trai, soi, onOpen, onPhoto, dangTai }) {
  const children = tree.childrenOf(node);
  const open = moRa.has(node.id);
  const partner = tree.partnerOf.get(node.id);
  const below = children.length ? countBelow(node, tree) : 0;
  const treTre = Math.min(depth * 0.05 + thu * 0.04, 0.34);
  const tren = trai?.has(node.id);
  return <div className={`tree-branch depth-${Math.min(depth, 4)} ${tren ? 'to-tien' : ''} ${tren && depth > 0 ? 'mach' : ''}`}
    data-flip={node.id} role="treeitem" aria-expanded={children.length ? open : undefined}
    style={{ '--mo-tre': `${treTre}s` }}>
    <div className="tree-row">
      {children.length
        ? <button className={`tree-toggle ${open ? 'open' : ''}`} onClick={() => doiNhanh(node.id)} aria-expanded={open}
            aria-label={`${open ? 'Thu gọn' : 'Mở'} nhánh ${node.name}, ${below} người`}><ChevronRight/></button>
        : <span className="tree-toggle empty" aria-hidden="true"/>}
      {/* Vợ chồng nằm trong một khung có chung đường viền, ngăn nhau bằng một nét mảnh:
          hai ô rời nhau thì mắt đọc ra hai người, một khung thì đọc ra một cặp. */}
      <div className={`tree-couple ${partner ? 'paired' : ''}`}>
        <Chip person={node} onOpen={onOpen} onPhoto={onPhoto} dangTai={dangTai===node.id} soi={soi}/>
        {partner && <Chip person={partner} onOpen={onOpen} onPhoto={onPhoto} dangTai={dangTai===partner.id} soi={soi} married/>}
      </div>
    </div>
    {children.length > 0 && !open && <button className="tree-more" onClick={() => doiNhanh(node.id)}>
      <Users/>{below} người trong nhánh này
    </button>}
    {children.length > 0 && open && <div className="tree-children">
      {children.map((child, i) => <Branch key={child.id} node={child} tree={tree} depth={depth + 1} thu={i}
        moRa={moRa} doiNhanh={doiNhanh} trai={trai} soi={soi}
        onOpen={onOpen} onPhoto={onPhoto} dangTai={dangTai}/>)}
    </div>}
  </div>;
}

/** Dòng phụ dưới tên nói đúng một điều quan trọng nhất về người đó: người đã khuất thì
 * là ngày giỗ, người còn sống thì là năm sinh. Chữ "vợ/chồng" cho người cưới vào, vì
 * hai ô đứng cạnh nhau thôi thì chưa đủ để biết đó là vợ chồng hay hai anh em. */
function Chip({ person, onOpen, onPhoto, dangTai, soi, married = false }) {
  const years = person.birth_year && person.death_year ? `${person.birth_year} – ${person.death_year}`
    : person.birth_year ? `sinh ${person.birth_year}` : '';
  const facts = person.living ? [years || 'còn sống'] : [years, `giỗ ${pad(person.lunar_day)}/${pad(person.lunar_month)} âm`];
  const note = [married ? 'vợ/chồng' : '', ...facts].filter(Boolean).join(' · ');
  const mat = <Avatar name={person.name} photoId={person.photo_id}/>;
  // Chạm hay rê tới một cái tên thì cả đường nối từ người ấy ngược lên gốc sáng lên:
  // đó là câu hỏi đầu tiên ai mở gia phả cũng hỏi — người này là con cháu của ai.
  const theoDoi = {
    onPointerEnter: () => soi?.(person.id),
    onPointerLeave: () => soi?.(null),
    onFocus: () => soi?.(person.id),
    onBlur: () => soi?.(null),
  };
  // Hai mươi bốn người là hai mươi bốn lần mở trang riêng nếu chỉ tải ảnh được ở đó.
  // Chạm thẳng vào vòng mặt trên cây là chọn được ảnh, không rời khỏi sơ đồ.
  return <div className={`tree-chip ${person.living ? 'living' : 'departed'} ${married ? 'married-in' : ''}`} {...theoDoi}>
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
