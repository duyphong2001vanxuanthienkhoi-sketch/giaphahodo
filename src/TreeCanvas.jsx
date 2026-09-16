import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Maximize, Play, Square, ImagePlus, ArrowUpRight, X } from 'lucide-react';
import { Avatar } from './components.jsx';
import { TimKiem, MuiTenPhai } from './icons.jsx';
import { build, boCuc, countBelow, khongDau, matGiaDinh, CAO_HANG, LE } from './family.js';
import { pad } from '../shared/lunar.js';

/** Sơ đồ toàn cảnh — cả họ trải ra trên một mặt phẳng kéo được và phóng được.
 *
 * Cây dọc theo nhánh đọc tên rất tốt nhưng không cho thấy được hình dáng của cả
 * dòng họ: ai là anh ai là em, chi nào đông chi nào thưa, mình đứng ở đâu so với
 * gốc. Sơ đồ này làm đúng việc đó, và vì thế nó phải kéo và phóng được — hai
 * mươi tư người bốn đời thì không màn hình nào chứa vừa ở cỡ chữ đọc được.
 *
 * Hình học lấy nguyên của bộ Đỗ Gia Motion v2: mỗi đời một tầng cách nhau 164px,
 * bề rộng một nhánh bằng bề rộng đàn con cộng lại, và cha mẹ đứng đúng giữa tâm
 * của đàn con ấy. */

const NGAM_LAU = 4200;     // mỗi khuôn hình trong chế độ Ngắm cây

/** Đường nối từ cha mẹ xuống con: xuống thẳng, rẽ ngang ở lưng chừng rồi lại
 * xuống thẳng, hai góc bo tròn. Nét gãy vuông nhìn như sơ đồ tổ chức công ty. */
function netNoi(p, c) {
  const sx = p.x + p.w / 2, sy = p.y + p.h + 7, tx = c.x + c.w / 2, ty = c.y - 3;
  if (Math.abs(tx - sx) < 1) return `M${sx},${sy}V${ty}`;
  const giua = sy + (ty - sy) * 0.48, r = Math.min(12, Math.abs(tx - sx) / 2), d = tx > sx ? 1 : -1;
  return `M${sx},${sy}V${giua - r}Q${sx},${giua} ${sx + d * r},${giua}H${tx - d * r}Q${tx},${giua} ${tx},${giua + r}V${ty}`;
}

export default function TreeCanvas({ people, onOpen, onPhoto = null, dangTai = null }) {
  const tree = useMemo(() => build(people), [people]);

  // Một "mắt" trên sơ đồ là một gia đình: người có gốc trong họ, vợ hoặc chồng
  // của người ấy, và đàn con treo bên dưới. Khoá của mắt là id người có gốc.
  const mats = useMemo(() => matGiaDinh(tree), [tree]);

  const matCuaNguoi = useMemo(() => {
    const map = new Map();
    for (const g of mats.values()) for (const m of g.members) map.set(m.id, g.id);
    return map;
  }, [mats]);

  const [gap, setGap] = useState(() => new Set());
  const [chon, setChon] = useState(null);
  const [chi, setChi] = useState(null);
  const [tim, setTim] = useState('');
  const [ngam, setNgam] = useState(false);
  const [nhan, setNhan] = useState('');
  const [phongChu, setPhongChu] = useState(1);

  const vungRef = useRef(null), theGioiRef = useRef(null), rayRef = useRef(null);
  const may = useRef({ zoom: 1, x: 0, y: 0 });
  const cham = useRef({ diem: new Map(), keo: null, chum: null });
  const heNgam = useRef(null);
  const daVao = useRef(false);
  const dangXem = useRef(null);   // mắt mà khung nhìn đang đóng khung, để xếp lại cho đúng

  /* ---- Bố cục ------------------------------------------------------- */
  const { cho, worldW, worldH, doiCo } = useMemo(
    () => boCuc(mats, tree.roots.map(r => r.id), gap), [mats, gap, tree]);

  /* ---- Máy quay ------------------------------------------------------
     Kéo và phóng ghi thẳng vào style, không đi qua state: kéo một cái là vài
     chục khung hình, mà dựng lại cả cây mỗi khung hình thì máy nào cũng giật. */
  const apMay = useCallback((thang = false) => {
    const w = theGioiRef.current, v = vungRef.current;
    if (!w || !v) return;
    const { zoom, x, y } = may.current;
    w.classList.toggle('thang', thang);
    w.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    // Chỉ báo về React khi mức phóng đổi đáng kể. Kéo cây là vài chục khung hình
    // một giây; dựng lại cả cây từng ấy lần chỉ để đổi con số phần trăm thì phí.
    setPhongChu(cu => (Math.abs(cu - zoom) > 0.015 ? zoom : cu));
    const ray = rayRef.current;
    if (ray) for (const nhanh of ray.children) {
      nhanh.style.top = `${y + (LE + Number(nhanh.dataset.doi) * CAO_HANG + 46) * zoom}px`;
      nhanh.style.opacity = zoom < 0.45 ? '0' : '';
    }
  }, []);

  const vuaMan = useCallback((thang = false) => {
    const v = vungRef.current;
    if (!v) return;
    const w = v.clientWidth, h = v.clientHeight;
    may.current.zoom = Math.max(0.3, Math.min(1.12, (w - 72) / worldW, (h - 118) / worldH));
    may.current.x = (w - worldW * may.current.zoom) / 2;
    may.current.y = 60 + (h - 118 - worldH * may.current.zoom) / 2;
    dangXem.current = null;
    apMay(thang);
  }, [worldW, worldH, apMay]);

  /** Đưa vùng xem tới một mắt, có thể kèm cả đàn con cháu của nó. */
  const toiMat = useCallback((id, caNhanh = false) => {
    const l = cho.get(id);
    const v = vungRef.current;
    if (!l || !v) return;
    let x1 = l.x, x2 = l.x + l.w, y1 = l.y, y2 = l.y + l.h;
    if (caNhanh) {
      const duoi = (mid) => { const g = mats.get(mid); if (!g) return; for (const c of g.children) { const k = cho.get(c); if (!k) continue; x1 = Math.min(x1, k.x); x2 = Math.max(x2, k.x + k.w); y2 = Math.max(y2, k.y + k.h); duoi(c); } };
      duoi(id);
    }
    // Bảng thông tin đứng bên phải trên màn rộng và nằm dưới đáy trên màn hẹp,
    // nên chỗ còn lại để đặt cây bị hụt theo hai chiều khác nhau.
    const hep = v.clientWidth <= 620;
    const chua = v.clientWidth - (chon && !hep ? 300 : 0);
    const cao = v.clientHeight - (chon && hep ? Math.round(v.clientHeight * 0.46) : 0);
    const zoom = Math.max(0.36, Math.min(caNhanh ? 1.1 : 1.35, (chua - 60) / (x2 - x1 + 30), (cao - 170) / (y2 - y1 + 30)));
    may.current.zoom = zoom;
    may.current.x = (chua - (x2 - x1) * zoom) / 2 - x1 * zoom;
    may.current.y = 78 + (cao - 170 - (y2 - y1) * zoom) / 2 - y1 * zoom;
    dangXem.current = id;
    apMay();
  }, [cho, mats, chon, apMay]);

  /** Chọn một người thì đừng xô cả cây: chỉ đẩy đúng đủ để thẻ của người ấy không
   * nằm dưới bảng thông tin. Phóng to thu nhỏ lại từ đầu mỗi lần bấm một cái tên
   * làm người xem mất phương hướng — vừa nhìn thấy cả nhà, bấm một cái là mọi thứ
   * nhảy sang cỡ khác. */
  const dayVaoTam = useCallback(id => {
    const v = vungRef.current, l = cho.get(id);
    if (!v || !l) return;
    const { zoom, x, y } = may.current;
    const hep = v.clientWidth <= 620;
    const chuaDuoi = hep ? v.clientHeight * 0.46 + 16 : 16;
    const chuaPhai = hep ? 14 : 312;
    const tren = y + l.y * zoom, duoi = tren + l.h * zoom;
    const trai = x + l.x * zoom, phai = trai + l.w * zoom;
    let dx = 0, dy = 0;
    if (duoi > v.clientHeight - chuaDuoi) dy = v.clientHeight - chuaDuoi - duoi;
    if (tren + dy < 58) dy = 58 - tren;
    if (phai > v.clientWidth - chuaPhai) dx = v.clientWidth - chuaPhai - phai;
    if (trai + dx < 16) dx = 16 - trai;
    if (!dx && !dy) return;
    may.current.x += dx;
    may.current.y += dy;
    apMay();
  }, [cho, apMay]);

  const phongTheo = useCallback((he, cx, cy) => {
    const v = vungRef.current;
    if (!v) return;
    const cu = may.current.zoom;
    const moi = Math.max(0.3, Math.min(2, cu * he));
    may.current.x = cx - (cx - may.current.x) * (moi / cu);
    may.current.y = cy - (cy - may.current.y) * (moi / cu);
    may.current.zoom = moi;
    apMay(true);
  }, [apMay]);

  /* ---- Mở nhánh, chọn người ------------------------------------------ */
  const moDuongToi = useCallback(id => {
    setGap(cu => {
      const moi = new Set(cu);
      let g = matCuaNguoi.get(id);
      while (g) { moi.delete(g); g = mats.get(g)?.parent; }
      return moi;
    });
  }, [matCuaNguoi, mats]);

  const dungNgam = useCallback(() => { clearTimeout(heNgam.current); setNgam(false); }, []);

  const chonNguoi = useCallback((id, dua = true) => {
    dungNgam();
    moDuongToi(id);
    setChon(id);
    const g = matCuaNguoi.get(id);
    let goc = g;
    while (goc && mats.get(goc)?.depth > 1) goc = mats.get(goc).parent;
    setChi(mats.get(goc)?.depth === 1 ? goc : null);
    if (!g) return;
    // Tìm thấy từ ô tìm kiếm thì người ấy có thể đang ở tận đầu kia của cây, phải
    // đưa hẳn vùng xem tới. Bấm thẳng vào thẻ thì người ấy đang ở ngay trước mắt
    // rồi, chỉ cần đừng để bảng thông tin che mất.
    requestAnimationFrame(() => (dua ? toiMat(g) : dayVaoTam(g)));
  }, [dungNgam, moDuongToi, matCuaNguoi, mats, toiMat, dayVaoTam]);

  /** Mạch từ người đang chọn ngược lên gốc — đây là thứ người ta thật sự muốn
   * thấy khi bấm vào một cái tên: mình là con cháu của những ai. */
  const mach = useMemo(() => {
    const ra = new Set();
    if (!chon) return ra;
    let g = matCuaNguoi.get(chon);
    while (g) { ra.add(g); g = mats.get(g)?.parent; }
    return ra;
  }, [chon, matCuaNguoi, mats]);

  const nguoiChon = chon ? tree.byId.get(chon) : null;

  /* ---- Tìm tên ------------------------------------------------------- */
  const ketQua = useMemo(() => {
    const t = khongDau(tim);
    if (t.length < 1) return [];
    return people.filter(p => khongDau(p.name).includes(t)).slice(0, 6);
  }, [tim, people]);

  /* ---- Ngắm cây ------------------------------------------------------ */
  const khuonNgam = useMemo(() => {
    const goc = tree.roots[0]?.id;
    const chiList = [...mats.values()].filter(g => g.depth === 1).map(g => g.id);
    return [
      ...(goc ? [{ id: goc, caNhanh: false, loi: 'Từ một gốc rễ' }] : []),
      ...chiList.map((id, i) => ({ id, caNhanh: true, loi: `Chi thứ ${i + 1} · ${mats.get(id).members[0].name}` })),
    ];
  }, [mats, tree]);

  useEffect(() => {
    if (!ngam || !khuonNgam.length) return;
    let buoc = 0, song = true;
    const di = () => {
      if (!song) return;
      const k = khuonNgam[buoc % khuonNgam.length];
      setNhan(k.loi);
      setGap(new Set());
      setChon(k.id);
      setChi(mats.get(k.id)?.depth === 1 ? k.id : null);
      requestAnimationFrame(() => toiMat(k.id, k.caNhanh));
      buoc += 1;
      heNgam.current = setTimeout(di, NGAM_LAU);
    };
    di();
    return () => { song = false; clearTimeout(heNgam.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ngam, khuonNgam]);

  /* ---- Vào lần đầu, đổi kích thước, rời màn hình --------------------- */
  useLayoutEffect(() => { apMay(); }, [apMay, cho]);

  useEffect(() => {
    if (daVao.current) return;
    daVao.current = true;
    const v = vungRef.current;
    requestAnimationFrame(() => {
      vuaMan(true);
      // Màn hẹp thì cả họ thu lại chỉ còn những vệt chữ; mở thẳng vào chi đầu
      // để tên đọc được, vẫn còn nút "Toàn cảnh" cho ai muốn lùi ra.
      if (v && v.clientWidth < 900) {
        const dau = [...mats.values()].find(g => g.depth === 1);
        if (dau) { setChi(dau.id); requestAnimationFrame(() => toiMat(dau.id, true)); }
      }
    });
  }, [vuaMan, toiMat, mats]);

  // Giữ hàm mới nhất trong một ref: người canh kích thước chỉ nên dựng lại khi
  // khung thật sự đổi cỡ, chứ không phải mỗi lần đổi người đang chọn — dựng lại
  // là ResizeObserver bắn ngay một lượt, và cây bị xếp lại giữa chừng.
  const xepLai = useRef(null);
  xepLai.current = () => (dangXem.current ? toiMat(dangXem.current, true) : vuaMan(true));

  useEffect(() => {
    const v = vungRef.current;
    if (!v || !('ResizeObserver' in window)) return;
    let hen;
    // Xoay máy hay đổi cỡ cửa sổ thì xếp lại khung nhìn, nhưng giữ nguyên chỗ
    // đang xem: đang xem nhánh nhà bác Lương mà bị kéo phắt về toàn cảnh thì mất
    // dấu, nhất là lúc vừa mở trang và máy còn đang tính lại bố cục.
    let rongCu = v.clientWidth, caoCu = v.clientHeight;
    const nhin = new ResizeObserver(() => {
      if (v.clientWidth === rongCu && v.clientHeight === caoCu) return;
      rongCu = v.clientWidth; caoCu = v.clientHeight;
      clearTimeout(hen);
      hen = setTimeout(() => xepLai.current?.(), 160);
    });
    nhin.observe(v);
    return () => { clearTimeout(hen); nhin.disconnect(); };
  }, []);

  useEffect(() => {
    const roi = () => { if (document.hidden) dungNgam(); };
    document.addEventListener('visibilitychange', roi);
    return () => document.removeEventListener('visibilitychange', roi);
  }, [dungNgam]);

  /* ---- Kéo và chụm --------------------------------------------------- */
  const xuong = e => {
    if (e.target.closest('button,label,input')) return;
    dungNgam();
    const c = cham.current;
    c.diem.set(e.pointerId, { x: e.clientX, y: e.clientY });
    vungRef.current?.setPointerCapture?.(e.pointerId);
    vungRef.current?.classList.add('dang-keo');
    if (c.diem.size === 1) c.keo = { x: e.clientX - may.current.x, y: e.clientY - may.current.y };
    else if (c.diem.size === 2) {
      const [a, b] = [...c.diem.values()];
      c.chum = { xa: Math.hypot(a.x - b.x, a.y - b.y), zoom: may.current.zoom };
      c.keo = null;
    }
  };
  const di = e => {
    const v = vungRef.current;
    const c = cham.current;
    if (v) {
      const o = v.getBoundingClientRect();
      v.style.setProperty('--mo-mx', `${e.clientX - o.left}px`);
      v.style.setProperty('--mo-my', `${e.clientY - o.top}px`);
    }
    if (!c.diem.has(e.pointerId)) return;
    c.diem.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (c.chum && c.diem.size === 2) {
      const [a, b] = [...c.diem.values()];
      const xa = Math.hypot(a.x - b.x, a.y - b.y);
      const o = v.getBoundingClientRect();
      phongTheo((xa / c.chum.xa) * (c.chum.zoom / may.current.zoom), (a.x + b.x) / 2 - o.left, (a.y + b.y) / 2 - o.top);
    } else if (c.keo) {
      may.current.x = e.clientX - c.keo.x;
      may.current.y = e.clientY - c.keo.y;
      apMay(true);
    }
  };
  const len = e => {
    const c = cham.current;
    c.diem.delete(e.pointerId);
    if (c.diem.size < 2) c.chum = null;
    if (!c.diem.size) { c.keo = null; vungRef.current?.classList.remove('dang-keo'); }
  };
  const lan = e => {
    if (!e.ctrlKey && !e.metaKey) return;   // cuộn thường vẫn để cuộn trang
    e.preventDefault();
    dungNgam();
    const o = vungRef.current.getBoundingClientRect();
    phongTheo(Math.exp(-e.deltaY / 420), e.clientX - o.left, e.clientY - o.top);
  };

  // Chrome không cho ngăn cuộn trong listener gắn bằng React (passive mặc định),
  // nên bánh xe phải đăng ký tay mới chặn được thao tác phóng của trình duyệt.
  useEffect(() => {
    const v = vungRef.current;
    if (!v) return;
    v.addEventListener('wheel', lan, { passive: false });
    return () => v.removeEventListener('wheel', lan);
  });

  if (!tree.roots.length) return null;
  const chiList = [...mats.values()].filter(g => g.depth === 1);
  const nho = phongChu < 0.62;

  return <div className="so-do" onKeyDown={e => { if (e.key === 'Escape') { setChon(null); dungNgam(); } }}>
    <div className="so-do-thanh">
      <div className="so-do-tim">
        <label className="search-field">
          <TimKiem/>
          <input aria-label="Tìm người trong sơ đồ" placeholder="Tìm tên, không cần dấu…" value={tim}
            onChange={e => setTim(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ketQua[0]) { chonNguoi(ketQua[0].id); setTim(''); } }}/>
        </label>
        {ketQua.length > 0 && <ul className="so-do-ketqua">
          {ketQua.map(p => <li key={p.id}>
            <button onClick={() => { chonNguoi(p.id); setTim(''); }}>
              <Avatar name={p.name} photoId={p.photo_id}/>
              <span><strong>{p.name}</strong><small>Đời thứ {p.generation}{p.living ? '' : ' · đã khuất'}</small></span>
            </button>
          </li>)}
        </ul>}
      </div>
      <div className="so-do-chi">
        <button className={chi === null ? 'active' : ''} onClick={() => { dungNgam(); setChi(null); setChon(null); setGap(new Set()); requestAnimationFrame(() => vuaMan()); }}>Toàn cảnh</button>
        {/* Gọi nhánh bằng tên người đứng đầu nhánh, không đánh số: một nhà chín
            người con thì "Chi 7" chẳng nói lên điều gì, còn "Văn Phan" thì ai
            trong họ cũng biết là nhà ai. */}
        {chiList.map(g => <button key={g.id} className={chi === g.id ? 'active' : ''}
          title={`Nhánh ${g.members[0].name}`}
          onClick={() => { dungNgam(); setChi(g.id); setGap(cu => { const m = new Set(cu); m.delete(g.id); return m; }); requestAnimationFrame(() => toiMat(g.id, true)); }}>
          {tenNgan(g.members[0].name)}
        </button>)}
      </div>
      <button className={`so-do-ngam ${ngam ? 'dang' : ''}`} onClick={() => (ngam ? dungNgam() : setNgam(true))}>
        {ngam ? <><Square/>Dừng</> : <><Play/>Ngắm cây</>}
      </button>
    </div>

    <div className="so-do-vung" ref={vungRef} onPointerDown={xuong} onPointerMove={di} onPointerUp={len} onPointerCancel={len}>
      <div className="so-do-ray" ref={rayRef} aria-hidden="true">
        {doiCo.map(d => <span key={d} className="so-do-doi" data-doi={d}>Đời {d + 1}</span>)}
      </div>

      <div className="so-do-the-gioi" ref={theGioiRef} style={{ width: worldW, height: worldH }}>
        <svg className="so-do-net" width={worldW} height={worldH} aria-hidden="true">
          {[...cho.keys()].map(id => {
            const g = mats.get(id);
            if (!g.parent || !cho.has(g.parent)) return null;
            const sang = mach.has(id) && mach.has(g.parent);
            // pathLength="1" để nét dài bao nhiêu cũng vẽ hết trong đúng một nhịp,
            // thay vì đường ngắn xong trước đường dài cả nửa giây.
            return <path key={id} className={`so-do-canh ${sang ? 'mach' : ''}`} pathLength="1"
              d={netNoi(cho.get(g.parent), cho.get(id))}
              style={{ '--mo-tre': `${Math.max(0, g.depth - 1) * 0.22 + 0.1}s` }}/>;
          })}
        </svg>

        {[...cho.entries()].map(([id, l]) => {
          const g = mats.get(id);
          const daGap = gap.has(id);
          const soCon = g.children.length ? countBelow(tree.byId.get(id), tree) : 0;
          // Sáng rõ nếu: không đang xem riêng chi nào; hoặc nằm trong chi đang xem;
          // hoặc là đời trên của chi ấy — xem một chi mà mờ mất ông bà sinh ra chi
          // ấy thì cái chi kia treo lơ lửng, không còn biết từ đâu ra.
          const mo = chi === null || mach.has(id) || duoiChi(id, chi, mats) || duoiChi(chi, id, mats);
          return <div key={id} className={`so-do-mat ${g.depth === 0 ? 'goc' : ''} ${mach.has(id) ? 'mach' : ''} ${mo ? '' : 'lui'}`}
            style={{ left: l.x, top: l.y, width: l.w, height: l.h, '--mo-tre': `${g.depth * 0.16 + (l.x / worldW) * 0.12}s` }}>
            {g.depth === 1 && g.members[0].branch && g.members[0].branch !== 'Chưa phân chi'
              && <span className="so-do-nhan-chi">{g.members[0].branch}</span>}
            <div className={`so-do-the ${g.members.length === 2 ? 'cap' : ''}`}>
              {g.members.map(p => <Nguoi key={p.id} person={p} chon={chon === p.id} nho={nho}
                onChon={() => chonNguoi(p.id, false)}/>)}
              {g.members.length === 2 && <span className="so-do-noi-duyen" aria-hidden="true">∞</span>}
            </div>
            {g.children.length > 0 && <button className={`so-do-gap ${daGap ? 'dang-gap' : ''}`}
              aria-expanded={!daGap}
              aria-label={`${daGap ? 'Mở' : 'Thu gọn'} nhánh ${g.members[0].name}, ${soCon} người`}
              onClick={() => { dungNgam(); setGap(cu => { const m = new Set(cu); m.has(id) ? m.delete(id) : m.add(id); return m; }); }}>
              {daGap ? `+${soCon}` : '−'}
            </button>}
          </div>;
        })}
      </div>

      <div className="so-do-may">
        <button className="icon-button" onClick={() => phongTheo(1 / 1.22, vungRef.current.clientWidth / 2, vungRef.current.clientHeight / 2)} aria-label="Thu nhỏ"><Minus/></button>
        <span className="so-do-muc">{Math.round(phongChu * 100)}%</span>
        <button className="icon-button" onClick={() => phongTheo(1.22, vungRef.current.clientWidth / 2, vungRef.current.clientHeight / 2)} aria-label="Phóng to"><Plus/></button>
        <span className="so-do-vach"/>
        <button className="icon-button" onClick={() => { dungNgam(); setChi(null); vuaMan(); }} aria-label="Vừa màn hình"><Maximize/></button>
      </div>

      {ngam && <div className="so-do-dang-ngam"><span className="so-do-hat"/>{nhan}<button onClick={dungNgam}>Dừng</button></div>}
      <p className="so-do-mach-nuoc" aria-hidden="true">Kéo để đi · Ctrl + cuộn để phóng</p>

      {nguoiChon && <aside className="so-do-bang" aria-label={`Thông tin ${nguoiChon.name}`}>
        <div className="so-do-bang-dau">
          <span>NGƯỜI ĐANG CHỌN</span>
          <button className="icon-button" onClick={() => setChon(null)} aria-label="Đóng bảng"><X/></button>
        </div>
        <ThePhotoAvatar person={nguoiChon} onPhoto={onPhoto} dangTai={dangTai === nguoiChon.id}/>
        <div className="so-do-bang-ten">
          <h3>{nguoiChon.name}</h3>
          <p className="so-do-bang-trang-thai">{nguoiChon.living ? 'Còn sống' : 'Tưởng nhớ'} · Đời thứ {nguoiChon.generation}</p>
        </div>
        <dl>
          {!!nguoiChon.birth_year && <><dt>Năm sinh</dt><dd>{nguoiChon.birth_year}</dd></>}
          {!nguoiChon.living && <><dt>Ngày giỗ</dt><dd>{pad(nguoiChon.lunar_day)}/{pad(nguoiChon.lunar_month)} âm lịch</dd></>}
          {nguoiChon.branch && nguoiChon.branch !== 'Chưa phân chi' && <><dt>Chi</dt><dd>{nguoiChon.branch}</dd></>}
          <ThanNhan person={nguoiChon} tree={tree} onChon={chonNguoi}/>
        </dl>
        <button className="button primary so-do-bang-mo" onClick={() => onOpen(nguoiChon)}>Mở trang riêng<ArrowUpRight/></button>
      </aside>}
    </div>
  </div>;
}

/** Hai chữ cuối của tên. Trong một dòng họ ai cũng mang họ Đỗ, nên chữ "Đỗ" ở đầu
 * mỗi cái tên không phân biệt được ai với ai, mà lại chiếm mất chỗ. Tên đầy đủ vẫn
 * còn nguyên trong bảng thông tin, trong ô tìm kiếm và trong nhãn đọc màn hình. */
const tenNgan = ten => { const t = String(ten).split(' '); return t.length > 2 ? t.slice(-2).join(' ') : ten; };

/** Một mắt có nằm dưới chi đang xem không — dùng để làm mờ các chi khác đi một
 * chút khi người xem đang tập trung vào một chi. Mờ vừa phải thôi: các chi khác
 * vẫn là người trong họ, không phải nền. */
function duoiChi(id, chi, mats) {
  if (!chi) return true;
  let g = id;
  while (g) { if (g === chi) return true; g = mats.get(g)?.parent; }
  return false;
}

function Nguoi({ person, chon, nho, onChon }) {
  const hien = tenNgan(person.name);
  return <button type="button" className={`so-do-nguoi ${person.living ? 'song' : 'khuat'} ${chon ? 'dang-chon' : ''}`}
    aria-pressed={chon} aria-label={`${person.name}, đời thứ ${person.generation}, ${person.living ? 'còn sống' : 'đã khuất'}`}
    onClick={onChon} title={person.name}>
    <Avatar name={person.name} photoId={person.photo_id}/>
    <span className="so-do-ten">{hien}</span>
    {!nho && <span className="so-do-phu">{person.living ? `Đời ${person.generation}` : 'Tưởng nhớ'}</span>}
  </button>;
}

/** Ảnh trong bảng thông tin cũng chọn được ngay tại chỗ, y như vòng mặt trên cây
 * dọc — không ai chịu mở trang riêng chỉ để tải một tấm ảnh. */
function ThePhotoAvatar({ person, onPhoto, dangTai }) {
  const mat = <Avatar name={person.name} photoId={person.photo_id} size="large"/>;
  if (!onPhoto) return <div className="so-do-bang-mat">{mat}</div>;
  return <label className={`so-do-bang-mat chon-duoc ${dangTai ? 'dang-tai' : ''}`} title={`Thêm ảnh cho ${person.name}`}>
    {mat}
    <span className="so-do-bang-them" aria-hidden="true"><ImagePlus/></span>
    <input type="file" accept="image/*" hidden disabled={dangTai}
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(person, f); }}/>
    <span className="visually-hidden">Thêm ảnh cho {person.name}</span>
  </label>;
}

/** Vợ chồng, cha mẹ và con — bấm được để đi tiếp, vì xem gia phả là đi từ người
 * này sang người kia chứ không phải đọc từng hồ sơ rời. */
function ThanNhan({ person, tree, onChon }) {
  const ban = tree.partnerOf.get(person.id) || [...tree.partnerOf.entries()].find(([, v]) => v.id === person.id)?.[0];
  const banDoi = typeof ban === 'string' ? tree.byId.get(ban) : ban;
  const cha = person.parent_id ? tree.byId.get(person.parent_id) : null;
  const con = tree.nodes.filter(p => p.parent_id === person.id || (banDoi && p.parent_id === banDoi.id));
  const hang = (nhan, ds) => ds.length > 0 && <><dt>{nhan}</dt><dd>{ds.map(p =>
    <button key={p.id} onClick={() => onChon(p.id)}>{p.name}<MuiTenPhai/></button>)}</dd></>;
  return <>
    {hang('Vợ / chồng', banDoi ? [banDoi] : [])}
    {hang('Cha / mẹ', cha ? [cha] : [])}
    {hang('Con', con)}
  </>;
}
