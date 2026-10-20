/* =====================================================================
   app.js – Logic dùng chung cho 3 trang (index / sell / admin)
   Kiến trúc: "Git-as-a-database" – books.json trên GitHub đóng vai CSDL.
   ===================================================================== */

/* ---------- 1. CẤU HÌNH (điền sau) ---------- */
const GITHUB_TOKEN = '';   // Chỉ dùng khi USE_PROXY = false (KHÔNG nên, vì lộ token). Với proxy, token đặt trong proxy.php
const REPO_OWNER   = '';   // Tên tài khoản GitHub
const REPO_NAME    = '';   // Tên repository
const FILE_PATH    = 'books.json'; // Đường dẫn file dữ liệu trong repo
const BRANCH       = 'main';

const USE_PROXY = true;                          // true = gọi qua proxy.php (an toàn hơn)
const PROXY_URL = 'https://TEN-MIEN-CUA-BAN.id.vn/proxy.php'; // địa chỉ proxy.php trên hosting
const ADMIN_PASSWORD = 'admin123';               // Mật khẩu admin (chỉ mang tính tượng trưng)

const PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'><rect width='100%' height='100%' fill='%23d9c9a3'/><text x='50%' y='50%' text-anchor='middle' font-size='22' fill='%235a4030' font-family='serif'>Chưa có ảnh bìa</text></svg>";

/* ---------- 2. TIỆN ÍCH ---------- */
// Chống XSS: dữ liệu do người dùng nhập phải được escape trước khi chèn vào HTML
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => Number(n).toLocaleString('vi-VN') + ' ₫';

// btoa/atob chỉ xử lý Latin-1 nên phải đổi qua UTF-8 để giữ tiếng Việt có dấu
const toBase64   = str => btoa(unescape(encodeURIComponent(str)));
const fromBase64 = b64 => decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));

/* ---------- 3. GỌI GITHUB API ---------- */
const GH_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

/** Đọc books.json. Trả về { books: [...], sha } – sha cần thiết cho lần ghi sau. */
async function fetchData() {
  try {
    const res = USE_PROXY
      ? await fetch(`${PROXY_URL}?action=get&t=${Date.now()}`)
      : await fetch(`${GH_URL}?ref=${BRANCH}&t=${Date.now()}`, {   // t=... để tránh cache
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub trả về lỗi ${res.status}`);
    const file = await res.json();                  // { content: "<base64>", sha: "..." }
    const books = JSON.parse(fromBase64(file.content)); // Base64 -> chuỗi JSON -> mảng
    return { books, sha: file.sha };
  } catch (err) {
    console.error('fetchData lỗi:', err);
    throw new Error('Không tải được dữ liệu sách. Hãy kiểm tra cấu hình và kết nối mạng.');
  }
}

/** Ghi đè books.json (PUT). Bắt buộc gửi kèm sha hiện tại, nếu không GitHub từ chối. */
async function updateData(books, sha, message = 'Cập nhật books.json') {
  try {
    const payload = { message, sha, branch: BRANCH,
      content: toBase64(JSON.stringify(books, null, 2)) };  // mảng -> JSON -> Base64
    const res = USE_PROXY
      ? await fetch(PROXY_URL, { method: 'POST', body: JSON.stringify({ action: 'put', ...payload }) })
      : await fetch(GH_URL, { method: 'PUT', body: JSON.stringify(payload),
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } });
    if (!res.ok) { const e = new Error(`Lỗi ghi dữ liệu ${res.status}`); e.status = res.status; throw e; }
    return (await res.json()).content.sha;           // sha mới
  } catch (err) {
    console.error('updateData lỗi:', err);
    throw err;
  }
}

/** Đọc → sửa → ghi. Tự thử lại 1 lần nếu có người khác vừa ghi (lỗi 409/422 do sha cũ). */
async function modifyBooks(modifier, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { books, sha } = await fetchData();
    try { return await updateData(modifier(books), sha, message); }
    catch (err) { if (![409, 422].includes(err.status) || attempt === 1) throw err; }
  }
}

/* ---------- 4. GIỎ HÀNG (localStorage) ---------- */
const getCart = () => JSON.parse(localStorage.getItem('cart') || '[]');
const saveCart = c => { localStorage.setItem('cart', JSON.stringify(c)); renderCart(); };

function addToCart(book) {
  const cart = getCart();
  if (cart.some(b => b.id === book.id)) return toast('Cuốn sách này đã có trong giỏ.');
  cart.push({ id: book.id, title: book.title, price: book.price, seller: book.seller, contact: book.contact });
  saveCart(cart); toast(`Đã thêm “${book.title}” vào giỏ.`);
}
function removeFromCart(id) { saveCart(getCart().filter(b => b.id !== id)); }

function renderCart() {
  const cart = getCart();
  document.getElementById('cartCount').textContent = cart.length;
  document.getElementById('cartBody').innerHTML = cart.length
    ? cart.map(b => `<div class="d-flex justify-content-between border-bottom py-2">
        <div><strong>${esc(b.title)}</strong><br><small>Người bán: ${esc(b.seller)} – ${esc(b.contact)}</small></div>
        <div class="text-end"><div class="price fs-6">${money(b.price)}</div>
        <button class="btn btn-sm btn-outline-vintage" onclick="removeFromCart('${esc(b.id)}')">Bỏ</button></div></div>`).join('')
      + `<p class="text-end mt-3 mb-0">Tổng: <span class="price">${money(cart.reduce((s, b) => s + Number(b.price), 0))}</span></p>`
    : '<p class="text-center mb-0">Giỏ hàng đang trống. Hãy chọn một cuốn sách nhé.</p>';
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast-box alert alert-warning shadow'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
}

/* ---------- 5. KHUNG TRANG DÙNG CHUNG (menu + modal giỏ hàng) ---------- */
function initLayout(active) {
  const link = (href, name, label) => `<a class="nav-link ${active === name ? 'active' : ''}" href="${href}">${label}</a>`;
  document.getElementById('nav').innerHTML = `
  <nav class="navbar navbar-vintage navbar-expand-md"><div class="container">
    <a class="brand" href="index.html">📖 Tiệm Sách Cũ</a>
    <button class="navbar-toggler bg-light" data-bs-toggle="collapse" data-bs-target="#menu" aria-label="Mở menu"><span class="navbar-toggler-icon"></span></button>
    <div class="collapse navbar-collapse" id="menu"><div class="navbar-nav ms-auto">
      ${link('index.html', 'home', 'Cửa hàng')}${link('sell.html', 'sell', 'Đăng bán')}${link('admin.html', 'admin', 'Quản trị')}
      <a class="nav-link" href="#" data-bs-toggle="modal" data-bs-target="#cartModal">Giỏ hàng <span id="cartCount" class="badge badge-cart">0</span></a>
    </div></div></div></nav>
  <div class="modal fade" id="cartModal" tabindex="-1"><div class="modal-dialog modal-dialog-scrollable"><div class="modal-content" style="background:var(--paper-2)">
    <div class="modal-header"><h2 class="modal-title h4">Giỏ hàng của bạn</h2><button class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
    <div class="modal-body" id="cartBody"></div>
    <div class="modal-footer"><small class="me-auto">Liên hệ trực tiếp người bán để thỏa thuận giao dịch.</small>
      <button class="btn btn-outline-vintage" onclick="saveCart([])">Xóa giỏ</button></div></div></div></div>`;
  renderCart();
}

/* ---------- 6. TRANG CHỦ ---------- */
async function initHome() {
  initLayout('home');
  const box = document.getElementById('bookList');
  try {
    const { books } = await fetchData();
    const active = books.filter(b => b.status === 'active');   // chỉ hiện sách đã duyệt
    window._books = active;
    box.innerHTML = active.length ? active.map((b, i) => `
      <div class="col-6 col-md-4 col-lg-3"><article class="book-card">
        <img src="${esc(b.cover)}" alt="Bìa sách ${esc(b.title)}" loading="lazy" onerror="this.onerror=null;this.src=PLACEHOLDER">
        <div class="body">
          <h3>${esc(b.title)}</h3><div class="author mb-1">${esc(b.author)}</div>
          <div class="small mb-1">${esc(b.category || '')} · ${b.type === 'new' ? 'Sách mới' : 'Sách cũ'}</div>
          <div class="cond mb-2">Độ mới: <strong>${esc(b.condition)}%</strong><div class="cond-bar"><span style="width:${Math.min(100, Math.max(0, +b.condition))}%"></span></div></div>
          <div class="price mb-2">${money(b.price)}</div>
          <button class="btn btn-vintage btn-sm" onclick="addToCart(_books[${i}])">Thêm vào giỏ</button>
        </div></article></div>`).join('')
      : '<p class="text-center">Chưa có cuốn sách nào được bán. Hãy là người đăng bán đầu tiên!</p>';
  } catch (e) { box.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
}

/* ---------- 7. TRANG ĐĂNG BÁN ---------- */
function initSell() {
  initLayout('sell');
  const form = document.getElementById('sellForm'), msg = document.getElementById('sellMsg');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = new FormData(form), btn = form.querySelector('button[type=submit]');
    const book = {
      id: 'b' + Date.now(), title: f.get('title').trim(), author: f.get('author').trim(),
      category: f.get('category'), type: f.get('type'), price: +f.get('price'), condition: +f.get('condition'),
      cover: f.get('cover').trim(), seller: f.get('seller').trim(), contact: f.get('contact').trim(),
      description: f.get('description').trim(), status: 'pending', createdAt: new Date().toISOString() };
    btn.disabled = true; msg.innerHTML = '<div class="alert alert-secondary">Đang gửi…</div>';
    try {
      await modifyBooks(books => [...books, book], `Đăng sách mới: ${book.title}`);
      msg.innerHTML = '<div class="alert alert-success">Sách của bạn đã được gửi và đang chờ duyệt.</div>';
      form.reset();
    } catch (e) { msg.innerHTML = '<div class="alert alert-danger">Gửi thất bại. Vui lòng thử lại sau.</div>'; }
    btn.disabled = false;
  });
}

/* ---------- 8. TRANG ADMIN ---------- */
function initAdmin() {
  initLayout('admin');
  const gate = document.getElementById('gate'), panel = document.getElementById('panel');
  const open = () => { gate.classList.add('d-none'); panel.classList.remove('d-none'); loadPending(); };
  if (sessionStorage.getItem('admin') === '1') open();
  document.getElementById('gateForm').addEventListener('submit', ev => {
    ev.preventDefault();
    if (document.getElementById('pw').value === ADMIN_PASSWORD) { sessionStorage.setItem('admin', '1'); open(); }
    else document.getElementById('gateMsg').textContent = 'Mật khẩu chưa đúng.';
  });
}

async function loadPending() {
  const tb = document.getElementById('pendingBody');
  try {
    const { books } = await fetchData();
    const pending = books.filter(b => b.status === 'pending');
    tb.innerHTML = pending.length ? pending.map(b => `<tr>
      <td><img src="${esc(b.cover)}" width="50" alt="" onerror="this.onerror=null;this.src=PLACEHOLDER"></td>
      <td><strong>${esc(b.title)}</strong><br><small>${esc(b.author)} · ${esc(b.category || '')}</small></td>
      <td>${money(b.price)}</td><td>${esc(b.condition)}%</td>
      <td>${esc(b.seller)}<br><small>${esc(b.contact)}</small></td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-vintage" onclick="moderate('${esc(b.id)}','approve')">Phê duyệt</button>
        <button class="btn btn-sm btn-outline-vintage" onclick="moderate('${esc(b.id)}','reject')">Từ chối</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="text-center">Không có bài đăng nào đang chờ duyệt.</td></tr>';
  } catch (e) { tb.innerHTML = `<tr><td colspan="6" class="text-danger">${esc(e.message)}</td></tr>`; }
}

/** Phê duyệt: đổi status -> "active". Từ chối: xóa khỏi mảng. Sau đó lưu lên GitHub. */
async function moderate(id, action) {
  try {
    await modifyBooks(books => action === 'approve'
      ? books.map(b => b.id === id ? { ...b, status: 'active' } : b)
      : books.filter(b => b.id !== id),
      `${action === 'approve' ? 'Duyệt' : 'Từ chối'} sách ${id}`);
    toast(action === 'approve' ? 'Đã phê duyệt.' : 'Đã từ chối và xóa bài đăng.');
    loadPending();
  } catch (e) { toast('Thao tác thất bại, vui lòng thử lại.'); }
}
