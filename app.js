// ================================================================
// EKSPEDISI BERKAS - app.js
// Google Sheets Database Version
// ================================================================

// --- STATE ---
let listBerkas = [];
let listPetugas = [];
let listPembantu = [];
let scriptUrl = '';

// Default WA Message Template
const DEFAULT_WA_TEMPLATE = `Assalamualaikum, Selamat {salam},

Perkenalkan saya {petugas}, Petugas Ukur BPN.

Apakah benar ini dengan Bapak/Ibu {pemohon} yang mendaftar permohonan {permohonan} dengan No. Berkas {noBerkas} tahun {tahun}?

Terima Kasih 🙏`;

let waTemplate = localStorage.getItem('wa_template') || DEFAULT_WA_TEMPLATE;

// Default Jenis Permohonan
const DEFAULT_PERMOHONAN = [
    'Pengukuran Bidang Tanah',
    'Pendaftaran Tanah Pertama Kali',
    'Pemecahan Bidang Tanah',
    'Penggabungan Bidang Tanah',
    'Pemisahan Bidang Tanah',
    'Pengembalian Batas'
];

let listPermohonan = JSON.parse(localStorage.getItem('list_permohonan') || 'null') || [...DEFAULT_PERMOHONAN];

// --- DOM ELEMENTS ---
const navItems = document.querySelectorAll('.nav-item');
const views = {
    dashboard: document.getElementById('viewDashboard'),
    files: document.getElementById('viewFiles'),
    settings: document.getElementById('viewSettings'),
    database: document.getElementById('viewDatabase'),
};

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Load saved URL from localStorage (we still use localStorage ONLY for the URL config, not data)
    scriptUrl = localStorage.getItem('gas_url') || '';
    waTemplate = localStorage.getItem('wa_template') || DEFAULT_WA_TEMPLATE;
    listPermohonan = JSON.parse(localStorage.getItem('list_permohonan') || 'null') || [...DEFAULT_PERMOHONAN];
    updateConnectionStatusUI();
    loadWATemplateUI();
    renderPermohonanList();

    if (scriptUrl) {
        loadDataFromSheets();
    } else {
        const splash = document.getElementById('splashScreen');
        if (splash) splash.classList.add('hidden');
        showToast('Hubungkan ke Google Sheets terlebih dahulu di menu Koneksi Database.', 'info', 5000);
    }

    setupEventListeners();
});

// ================================================================
// NETWORK LAYER - Google Sheets Communication
// ================================================================

function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}

async function gasGet(params = {}) {
    if (!scriptUrl) throw new Error("URL belum diatur.");
    const url = new URL(scriptUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    // Google Apps Script requires no-cors for simple GET, but we use a JSONP-like approach
    // Actually, Apps Script Web Apps support CORS via ContentService
    const resp = await fetch(url.toString(), { redirect: 'follow' });
    if (!resp.ok) throw new Error("Gagal mengambil data: " + resp.status);
    return resp.json();
}

async function gasPost(payload) {
    if (!scriptUrl) throw new Error("URL belum diatur.");
    const resp = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
    });
    if (!resp.ok) throw new Error("Gagal mengirim data: " + resp.status);
    return resp.json();
}

// ================================================================
// WA MESSAGE TEMPLATE & GREETING
// ================================================================

function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5  && hour <= 10) return 'pagi';
    if (hour >= 11 && hour <= 14) return 'siang';
    if (hour >= 15 && hour <= 17) return 'sore';
    return 'malam';
}

function buildWAMessage(berkas) {
    return waTemplate
        .replace(/{salam}/g,       getGreeting())
        .replace(/{petugas}/g,     berkas.petugasUkur   || '-')
        .replace(/{pemohon}/g,     berkas.namaPemohon   || '-')
        .replace(/{permohonan}/g,  berkas.jenisPemohon  || '-')
        .replace(/{noBerkas}/g,    berkas.noBerkas      || '-')
        .replace(/{tahun}/g,       berkas.tahun         || '-')
        .replace(/{status}/g,      berkas.status        || '-');
}

function loadWATemplateUI() {
    const el = document.getElementById('waTemplate');
    if (el) el.value = waTemplate;
}

function openWAModal(berkas) {
    const phone = formatPhoneForWA(berkas.noTelepon);
    const message = buildWAMessage(berkas);

    document.getElementById('waPreviewText').value = message;
    document.getElementById('waTargetPhone').value = berkas.noTelepon;

    // Update send link dynamically when user edits the text
    function updateLink() {
        const text = document.getElementById('waPreviewText').value;
        document.getElementById('btnKirimWA').href =
            `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    }
    updateLink();
    document.getElementById('waPreviewText').oninput = updateLink;

    document.getElementById('modalWA').classList.add('active');
}

// ================================================================
// LOAD ALL DATA FROM GOOGLE SHEETS
// ================================================================
async function loadDataFromSheets() {
    showLoading(true);
    try {
        const data = await gasGet({ action: 'get_all' });

        // Process Berkas
        listBerkas = (data.berkas || []).map(b => {
            b.status = determineStatus(b);
            return b;
        });

        // Process Staff
        listPetugas = (data.petugas || [])
            .filter(p => p.Tipe === 'Petugas' || p.tipe === 'Petugas')
            .map(p => p.Nama || p.nama);

        listPembantu = (data.petugas || [])
            .filter(p => p.Tipe === 'Pembantu' || p.tipe === 'Pembantu')
            .map(p => p.Nama || p.nama);

        updateUI();
        setConnected(true);
        showToast('Data berhasil dimuat dari Google Sheets!', 'success');
    } catch (err) {
        setConnected(false);
        showToast('Gagal terhubung ke Google Sheets. Periksa URL Anda.', 'error');
        console.error(err);
    } finally {
        showLoading(false);
        const splash = document.getElementById('splashScreen');
        if (splash) splash.classList.add('hidden');
    }
}

// ================================================================
// SAVE / DELETE - Google Sheets
// ================================================================
async function saveToSheets(action, payload) {
    showLoading(true);
    try {
        const result = await gasPost({ action, payload });
        if (!result.success) throw new Error(result.message);
        return result;
    } catch (err) {
        showToast('Gagal menyimpan data ke Google Sheets: ' + err.message, 'error');
        throw err;
    } finally {
        showLoading(false);
    }
}

// ================================================================
// HELPERS
// ================================================================
function determineStatus(b) {
    if (b.tglSelesai) return "Selesai";
    if (b.tglPeriksa) return "Pemeriksaan";
    if (b.tglUkur) return "Proses Ukur";
    return "Diterima";
}

function checkOverdue(b) {
    if (b.status === "Selesai") return false;
    if (!b.tglTerima) return false;
    const terima = new Date(b.tglTerima);
    const today = new Date();
    const diffTime = Math.abs(today - terima);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 7;
}

function formatPhoneForWA(phone) {
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    return cleaned;
}

function formatDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateForInput(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function showToast(msg, type = 'info', duration = 3000) {
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

function setConnected(ok) {
    const statusEl = document.getElementById('connectionStatus');
    const bannerEl = document.getElementById('dbStatusBanner');
    const bannerText = document.getElementById('dbStatusText');

    if (ok) {
        statusEl.className = 'connection-status status-connected';
        statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Terhubung</span>';
        bannerEl.className = 'db-status-banner banner-connected';
        bannerEl.innerHTML = '<i class="fa-solid fa-circle-check"></i><span id="dbStatusText">Terhubung ke Google Sheets ✓</span>';
    } else {
        statusEl.className = 'connection-status status-disconnected';
        statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i><span>Tidak Terhubung</span>';
        bannerEl.className = 'db-status-banner banner-disconnected';
        bannerEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i><span id="dbStatusText">Belum terhubung ke Google Sheets</span>';
    }
}

function updateConnectionStatusUI() {
    const inputUrl = document.getElementById('inputScriptUrl');
    if (inputUrl) inputUrl.value = scriptUrl;
    setConnected(!!scriptUrl);
}

// ================================================================
// UI RENDERING
// ================================================================
function updateUI() {
    updateDashboardStats();
    updateStaffStats();
    updateRecentActivity();
    updateFilesTable();
    populateSelects();
    renderSettingsList();
}

function updateDashboardStats() {
    let total = listBerkas.length, diterima = 0, prosesUkur = 0, pemeriksaan = 0, selesai = 0;
    listBerkas.forEach(b => {
        if (b.status === "Diterima") diterima++;
        else if (b.status === "Proses Ukur") prosesUkur++;
        else if (b.status === "Pemeriksaan") pemeriksaan++;
        else if (b.status === "Selesai") selesai++;
    });
    document.getElementById('statTotal').innerText = total;
    document.getElementById('statDiterima').innerText = diterima;
    document.getElementById('statProsesUkur').innerText = prosesUkur;
    document.getElementById('statPemeriksaan').innerText = pemeriksaan;
    document.getElementById('statSelesai').innerText = selesai;
}

function updateStaffStats() {
    const tbody = document.getElementById('staffStatsBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (listPetugas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="help-text" style="text-align:center;">Belum ada petugas terdaftar.</td></tr>';
        return;
    }

    listPetugas.forEach(p => {
        let terima = 0, proses = 0, riksa = 0, selesai = 0;
        listBerkas.forEach(b => {
            if (b.petugasUkur === p) {
                if (b.status === "Diterima") terima++;
                else if (b.status === "Proses Ukur") proses++;
                else if (b.status === "Pemeriksaan") riksa++;
                else if (b.status === "Selesai") selesai++;
            }
        });
        tbody.innerHTML += `
            <tr>
                <td><strong>${p}</strong></td>
                <td><span class="badge diterima">${terima}</span></td>
                <td><span class="badge proses">${proses}</span></td>
                <td><span class="badge pemeriksaan">${riksa}</span></td>
                <td><span class="badge selesai">${selesai}</span></td>
            </tr>
        `;
    });
}

function updateRecentActivity() {
    const recentList = document.getElementById('recentActivityList');
    const sorted = [...listBerkas].sort((a, b) => String(b.id).localeCompare(String(a.id))).slice(0, 5);
    recentList.innerHTML = '';
    if (!sorted.length) { recentList.innerHTML = '<p class="help-text" style="padding:1rem 0;">Belum ada data berkas.</p>'; return; }

    sorted.forEach(b => {
        const cls = { "Diterima": "diterima", "Proses Ukur": "proses", "Pemeriksaan": "pemeriksaan", "Selesai": "selesai" }[b.status] || "diterima";
        const telat = checkOverdue(b);
        const badgeTelat = telat ? `<span class="badge telat" style="margin-right: 5px;"><i class="fa-solid fa-triangle-exclamation"></i> Telat</span>` : '';
        
        const div = document.createElement('div');
        div.style.cssText = 'padding:1rem 0;border-bottom:1px solid var(--border); cursor: pointer;';
        div.onclick = () => window.openDetail(b.id);
        div.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <strong>Berkas No. ${b.noBerkas}</strong> — ${b.namaPemohon}
                    <div class="help-text" style="margin-top:4px;">Diterima: ${formatDate(b.tglTerima)}</div>
                </div>
                <div>
                    ${badgeTelat}
                    <span class="badge ${cls}">${b.status}</span>
                </div>
            </div>`;
        recentList.appendChild(div);
    });
}

function updateFilesTable() {
    const tbody = document.getElementById('filesTableBody');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filterTahun = document.getElementById('filterTahun').value;
    const filterStatus = document.getElementById('filterStatus').value;
    const filterPetugas = document.getElementById('filterPetugas') ? document.getElementById('filterPetugas').value : 'all';

    const filtered = listBerkas.filter(b => {
        const matchSearch = String(b.noBerkas).toLowerCase().includes(searchTerm) || String(b.namaPemohon).toLowerCase().includes(searchTerm);
        const matchTahun = filterTahun === 'all' || String(b.tahun) === filterTahun;
        const matchStatus = filterStatus === 'all' || b.status === filterStatus;
        const matchPetugas = filterPetugas === 'all' || b.petugasUkur === filterPetugas;
        return matchSearch && matchTahun && matchStatus && matchPetugas;
    });

    tbody.innerHTML = '';
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;" class="help-text">Data tidak ditemukan.</td></tr>`;
        return;
    }

    filtered.forEach(b => {
        const cls = { "Diterima": "diterima", "Proses Ukur": "proses", "Pemeriksaan": "pemeriksaan", "Selesai": "selesai" }[b.status] || "diterima";
        const telat = checkOverdue(b);
        const rowCls = telat ? "row-telat" : "";
        const badgeTelat = telat ? `<br><span class="badge telat" style="margin-top: 5px;"><i class="fa-solid fa-triangle-exclamation"></i> > 7 Hari</span>` : '';

        const tr = document.createElement('tr');
        tr.className = rowCls;
        tr.innerHTML = `
            <td><strong>${b.noBerkas}</strong></td>
            <td>${b.tahun}</td>
            <td>
                ${b.namaPemohon}
                ${b.namaKuasa ? `<br><small class="help-text">Kuasa: ${b.namaKuasa}</small>` : ''}
                <br><small class="help-text">${b.noTelepon}</small>
            </td>
            <td><span class="badge ${cls}">${b.status}</span>${badgeTelat}</td>
            <td>${formatDate(b.tglTerima)}</td>
            <td>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-sm btn-info" style="background:#0ea5e9;color:white;" onclick="openDetail('${b.id}')" title="Detail"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn btn-sm btn-success" onclick="openWAPreview('${b.id}')" title="Hubungi via WA"><i class="fa-brands fa-whatsapp"></i></button>
                    <button class="btn btn-sm btn-primary" onclick="editBerkas('${b.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBerkas('${b.id}')" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

function populateSelects() {
    const years = [...new Set(listBerkas.map(b => b.tahun))].sort((a, b) => b - a);
    const filterTahun = document.getElementById('filterTahun');
    const cur = filterTahun.value;
    filterTahun.innerHTML = '<option value="all">Semua Tahun</option>';
    years.forEach(y => filterTahun.innerHTML += `<option value="${y}">${y}</option>`);
    if (filterTahun.querySelector(`option[value="${cur}"]`)) filterTahun.value = cur;

    const fPetugas = document.getElementById('filterPetugas');
    if (fPetugas) {
        const curPetugas = fPetugas.value;
        fPetugas.innerHTML = '<option value="all">Semua Petugas</option>';
        listPetugas.forEach(p => fPetugas.innerHTML += `<option value="${p}">${p}</option>`);
        if (fPetugas.querySelector(`option[value="${curPetugas}"]`)) fPetugas.value = curPetugas;
    }

    const sp = document.getElementById('selectPetugas');
    const sb = document.getElementById('selectPembantu');
    const sper = document.getElementById('inputPermohonan');
    sp.innerHTML = '<option value="">-- Pilih Petugas --</option>';
    sb.innerHTML = '<option value="">-- Pilih Pembantu --</option>';
    sper.innerHTML = '<option value="">-- Pilih Permohonan --</option>';
    listPetugas.forEach(p => sp.innerHTML += `<option value="${p}">${p}</option>`);
    listPembantu.forEach(p => sb.innerHTML += `<option value="${p}">${p}</option>`);
    listPermohonan.forEach(p => sper.innerHTML += `<option value="${p}">${p}</option>`);
}

function renderSettingsList() {
    const ulP = document.getElementById('listPetugas');
    const ulPb = document.getElementById('listPembantu');
    ulP.innerHTML = '';
    listPetugas.forEach((p, i) => {
        ulP.innerHTML += `<li><span>${p}</span><button class="btn btn-sm btn-danger btn-icon" onclick="removeStaff('petugas',${i})"><i class="fa-solid fa-trash"></i></button></li>`;
    });
    ulPb.innerHTML = '';
    listPembantu.forEach((p, i) => {
        ulPb.innerHTML += `<li><span>${p}</span><button class="btn btn-sm btn-danger btn-icon" onclick="removeStaff('pembantu',${i})"><i class="fa-solid fa-trash"></i></button></li>`;
    });
}

function renderPermohonanList() {
    const ul = document.getElementById('listPermohonan');
    if (!ul) return;
    ul.innerHTML = '';
    listPermohonan.forEach((p, i) => {
        ul.innerHTML += `<li><span>${p}</span><button class="btn btn-sm btn-danger btn-icon" onclick="removePermohonan(${i})"><i class="fa-solid fa-trash"></i></button></li>`;
    });
}

function savePermohonanList() {
    localStorage.setItem('list_permohonan', JSON.stringify(listPermohonan));
}

window.removePermohonan = function(idx) {
    if (!confirm('Hapus jenis permohonan ini?')) return;
    listPermohonan.splice(idx, 1);
    savePermohonanList();
    renderPermohonanList();
    populateSelects();
};

// ================================================================
// EVENT LISTENERS
// ================================================================
function setupEventListeners() {
    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            // Remove active from all items that match the view
            const viewId = item.getAttribute('data-view');
            document.querySelectorAll(`.nav-item[data-view="${viewId}"]`).forEach(n => {
                navItems.forEach(x => x.classList.remove('active')); // Reset all first
            });
            
            // Mark both sidebar and bottom nav items as active
            document.querySelectorAll(`.nav-item[data-view="${viewId}"]`).forEach(n => n.classList.add('active'));

            Object.values(views).forEach(v => v && v.classList.remove('active'));
            if (views[viewId]) views[viewId].classList.add('active');
            if (viewId === 'database') updateConnectionStatusUI();
            if (viewId === 'files' || viewId === 'dashboard') updateUI();
        });
    });

    // Theme Toggle
    const btnTheme = document.getElementById('btnThemeToggle');
    if (btnTheme) {
        btnTheme.addEventListener('click', () => {
            const html = document.documentElement;
            if (html.getAttribute('data-theme') === 'dark') {
                html.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                btnTheme.innerHTML = '<i class="fa-solid fa-moon"></i>';
            } else {
                html.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                btnTheme.innerHTML = '<i class="fa-solid fa-sun"></i>';
            }
        });
        
        // Initial icon state
        if (localStorage.getItem('theme') === 'dark') {
            btnTheme.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }
    }

    // Search & Filter
    document.getElementById('searchInput').addEventListener('input', updateFilesTable);
    document.getElementById('filterTahun').addEventListener('change', updateFilesTable);
    document.getElementById('filterStatus').addEventListener('change', updateFilesTable);
    const filterPetugas = document.getElementById('filterPetugas');
    if (filterPetugas) filterPetugas.addEventListener('change', updateFilesTable);

    // Connection status click -> go to database view
    document.getElementById('connectionStatus').addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        document.querySelector('[data-view="database"]').classList.add('active');
        Object.values(views).forEach(v => v && v.classList.remove('active'));
        views.database.classList.add('active');
        updateConnectionStatusUI();
    });

    // Save/Disconnect Google Sheets URL
    document.getElementById('btnSimpanUrl').addEventListener('click', async () => {
        const url = document.getElementById('inputScriptUrl').value.trim();
        if (!url.startsWith('https://script.google.com')) {
            showToast('URL tidak valid. Harus dari script.google.com', 'error'); return;
        }
        scriptUrl = url;
        localStorage.setItem('gas_url', scriptUrl);
        updateConnectionStatusUI();
        showToast('URL disimpan. Mencoba menghubungkan...', 'info');
        await loadDataFromSheets();
    });

    document.getElementById('btnHapusUrl').addEventListener('click', () => {
        scriptUrl = '';
        localStorage.removeItem('gas_url');
        listBerkas = []; listPetugas = []; listPembantu = [];
        updateConnectionStatusUI();
        updateUI();
        showToast('Koneksi diputus.', 'info');
    });

    // Modal - Tambah Berkas
    const modal = document.getElementById('modalBerkas');
    document.getElementById('btnTambahBerkas').addEventListener('click', () => {
        if (!scriptUrl) { showToast('Silakan hubungkan ke Google Sheets terlebih dahulu.', 'error'); return; }
        document.getElementById('formBerkas').reset();
        document.getElementById('berkasId').value = '';
        document.getElementById('modalTitle').innerText = 'Tambah Berkas Baru';
        populateSelects();
        modal.classList.add('active');
    });

    document.getElementById('btnCloseModal').addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('btnCancelModal').addEventListener('click', e => { e.preventDefault(); modal.classList.remove('active'); });
    document.getElementById('btnSaveBerkas').addEventListener('click', e => { e.preventDefault(); saveBerkas(); });

    // Settings - Staff
    document.getElementById('btnAddPetugas').addEventListener('click', async () => {
        const name = prompt("Masukkan nama Petugas Ukur baru:"); 
        if (!name || !name.trim()) return;
        listPetugas.push(name.trim());
        await saveStaffToSheets();
        renderSettingsList();
        populateSelects();
    });

    document.getElementById('btnAddPembantu').addEventListener('click', async () => {
        const name = prompt("Masukkan nama Pembantu Ukur baru:");
        if (!name || !name.trim()) return;
        listPembantu.push(name.trim());
        await saveStaffToSheets();
        renderSettingsList();
        populateSelects();
    });

    // Settings - Jenis Permohonan
    document.getElementById('btnAddPermohonan').addEventListener('click', () => {
        const name = prompt('Masukkan Jenis Permohonan baru:');
        if (!name || !name.trim()) return;
        listPermohonan.push(name.trim());
        savePermohonanList();
        renderPermohonanList();
        populateSelects();
        showToast('Jenis permohonan berhasil ditambahkan.', 'success');
    });

    // WA Template
    document.getElementById('btnSimpanTemplate').addEventListener('click', () => {
        const val = document.getElementById('waTemplate').value.trim();
        if (!val) { showToast('Template tidak boleh kosong.', 'error'); return; }
        waTemplate = val;
        localStorage.setItem('wa_template', waTemplate);
        showToast('Template pesan WA berhasil disimpan!', 'success');
    });

    document.getElementById('btnResetTemplate').addEventListener('click', () => {
        if (!confirm('Reset template ke teks default?')) return;
        waTemplate = DEFAULT_WA_TEMPLATE;
        localStorage.removeItem('wa_template');
        loadWATemplateUI();
        showToast('Template berhasil direset.', 'info');
    });

    // WA Preview Modal
    document.getElementById('btnCloseWA').addEventListener('click', () => document.getElementById('modalWA').classList.remove('active'));
    document.getElementById('btnCancelWA').addEventListener('click', () => document.getElementById('modalWA').classList.remove('active'));

    // Export Backup
    document.getElementById('btnExport').addEventListener('click', () => {
        const data = { berkas: listBerkas, petugas: listPetugas, pembantu: listPembantu };
        const a = document.createElement('a');
        a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        a.download = `backup_ekspedisi_berkas_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        showToast('Backup berhasil diunduh!', 'success');
    });

    // Export CSV
    document.getElementById('btnExportCSV').addEventListener('click', () => {
        if (!listBerkas.length) { showToast('Tidak ada data untuk diekspor.', 'error'); return; }
        
        const headers = ['No. Berkas', 'Tahun', 'Nama Pemohon', 'Nama Kuasa', 'Jenis Permohonan', 'No. Telepon', 'Petugas Ukur', 'Pembantu Ukur', 'Tgl Terima', 'Tgl Ukur', 'Tgl Periksa', 'Tgl Selesai', 'Status', 'Catatan', 'Keterlambatan'];
        
        const csvRows = [headers.join(',')];
        
        listBerkas.forEach(b => {
            const telat = checkOverdue(b) ? 'Terlambat (>7 Hari)' : 'Aman';
            const row = [
                b.noBerkas, b.tahun, `"${b.namaPemohon || ''}"`, `"${b.namaKuasa || ''}"`, `"${b.jenisPemohon || ''}"`,
                b.noTelepon, `"${b.petugasUkur || ''}"`, `"${b.pembantuUkur || ''}"`,
                b.tglTerima, b.tglUkur, b.tglPeriksa, b.tglSelesai,
                b.status, `"${(b.catatan || '').replace(/"/g, '""')}"`, telat
            ];
            csvRows.push(row.join(','));
        });

        const a = document.createElement('a');
        a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join('\n'));
        a.download = `Laporan_Ekspedisi_Berkas_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        showToast('Laporan CSV berhasil diunduh!', 'success');
    });
}

// ================================================================
// CRUD OPERATIONS
// ================================================================
async function saveBerkas() {
    if (!document.getElementById('inputNoBerkas').value ||
        !document.getElementById('inputTahun').value ||
        !document.getElementById('inputPemohon').value ||
        !document.getElementById('tglTerima').value) {
        showToast('Isi semua field bertanda * terlebih dahulu.', 'error'); return;
    }

    const id = document.getElementById('berkasId').value;
    
    // Format Nomor Telepon
    let phoneVal = document.getElementById('inputTelepon').value.trim();
    phoneVal = phoneVal.replace(/\D/g, ''); // Hapus karakter selain angka
    if (phoneVal.startsWith('0')) {
        phoneVal = '+62' + phoneVal.substring(1);
    } else if (phoneVal.startsWith('62')) {
        phoneVal = '+' + phoneVal;
    } else if (phoneVal.length > 0) {
        phoneVal = '+62' + phoneVal;
    }

    const newBerkas = {
        id: id || Date.now().toString(),
        noBerkas: document.getElementById('inputNoBerkas').value,
        tahun: parseInt(document.getElementById('inputTahun').value),
        namaPemohon: document.getElementById('inputPemohon').value,
        namaKuasa: document.getElementById('inputKuasa').value,
        jenisPemohon: document.getElementById('inputPermohonan').value,
        noTelepon: phoneVal,
        petugasUkur: document.getElementById('selectPetugas').value,
        pembantuUkur: document.getElementById('selectPembantu').value,
        tglTerima: document.getElementById('tglTerima').value,
        tglUkur: document.getElementById('tglUkur').value,
        tglPeriksa: document.getElementById('tglPeriksa').value,
        tglSelesai: document.getElementById('tglSelesai').value,
        catatan: document.getElementById('inputCatatan').value,
    };
    newBerkas.status = determineStatus(newBerkas);

    // Validasi No Berkas dan Tahun yang sama
    const isDuplicate = listBerkas.some(b => 
        String(b.noBerkas) === String(newBerkas.noBerkas) && 
        String(b.tahun) === String(newBerkas.tahun) && 
        String(b.id) !== String(newBerkas.id)
    );

    if (isDuplicate) {
        showToast(`Gagal: No Berkas ${newBerkas.noBerkas} tahun ${newBerkas.tahun} sudah ada di database!`, 'error', 4000);
        return;
    }

    try {
        await saveToSheets('save_berkas', newBerkas);
        // Update local state, pastikan menggunakan String() agar tipe angka/teks dari Sheets cocok
        const idx = listBerkas.findIndex(b => String(b.id) === String(newBerkas.id));
        if (idx > -1) listBerkas[idx] = newBerkas;
        else listBerkas.push(newBerkas);
        updateUI();
        document.getElementById('modalBerkas').classList.remove('active');
        showToast('Berkas berhasil disimpan ke Google Sheets!', 'success');
    } catch(e) { /* Error already shown in saveToSheets */ }
}

window.editBerkas = function(id) {
    const b = listBerkas.find(b => String(b.id) === String(id));
    if (!b) return;
    populateSelects();
    document.getElementById('berkasId').value = b.id;
    document.getElementById('inputNoBerkas').value = b.noBerkas;
    document.getElementById('inputTahun').value = b.tahun;
    document.getElementById('inputPemohon').value = b.namaPemohon;
    document.getElementById('inputKuasa').value = b.namaKuasa || '';
    document.getElementById('inputPermohonan').value = b.jenisPemohon || '';
    
    // Tampilkan nomor telepon tanpa prefix
    let phoneToEdit = String(b.noTelepon || '').replace(/\D/g, '');
    if (phoneToEdit.startsWith('62')) {
        phoneToEdit = phoneToEdit.substring(2);
    } else if (phoneToEdit.startsWith('0')) {
        phoneToEdit = phoneToEdit.substring(1);
    }
    document.getElementById('inputTelepon').value = phoneToEdit;
    
    document.getElementById('selectPetugas').value = b.petugasUkur || '';
    document.getElementById('selectPembantu').value = b.pembantuUkur || '';
    document.getElementById('tglTerima').value = formatDateForInput(b.tglTerima);
    document.getElementById('tglUkur').value = formatDateForInput(b.tglUkur);
    document.getElementById('tglPeriksa').value = formatDateForInput(b.tglPeriksa);
    document.getElementById('tglSelesai').value = formatDateForInput(b.tglSelesai);
    document.getElementById('inputCatatan').value = b.catatan || '';
    document.getElementById('modalTitle').innerText = 'Edit Berkas';
    document.getElementById('modalBerkas').classList.add('active');
};

// Open WA Preview Modal
window.openWAPreview = function(id) {
    const berkas = listBerkas.find(b => String(b.id) === String(id));
    if (!berkas) return;
    openWAModal(berkas);
};

window.deleteBerkas = async function(id) {
    if (!confirm('Yakin ingin menghapus berkas ini? Data akan dihapus permanen dari Google Sheets.')) return;
    try {
        await saveToSheets('delete_berkas', { id });
        listBerkas = listBerkas.filter(b => String(b.id) !== String(id));
        updateUI();
        showToast('Berkas berhasil dihapus.', 'success');
    } catch(e) { /* handled */ }
};

window.removeStaff = async function(type, idx) {
    if (!confirm('Hapus nama ini?')) return;
    if (type === 'petugas') listPetugas.splice(idx, 1);
    else listPembantu.splice(idx, 1);
    await saveStaffToSheets();
    renderSettingsList();
    populateSelects();
};

async function saveStaffToSheets() {
    try {
        await saveToSheets('save_petugas', { listPetugas, listPembantu });
        showToast('Data petugas berhasil disimpan.', 'success');
    } catch(e) { /* handled */ }
}

// ================================================================
// DETAIL MODAL LOGIC
// ================================================================
window.openDetail = function(id) {
    const b = listBerkas.find(b => String(b.id) === String(id));
    if (!b) return;

    // Basic Info
    document.getElementById('detNoBerkas').innerText = b.noBerkas || '-';
    document.getElementById('detTahun').innerText = b.tahun || '-';
    document.getElementById('detPemohon').innerText = b.namaPemohon || '-';
    document.getElementById('detKuasa').innerText = b.namaKuasa || '-';
    document.getElementById('detPermohonan').innerText = b.jenisPemohon || '-';
    document.getElementById('detTelepon').innerText = b.noTelepon || '-';
    document.getElementById('detCatatan').innerText = b.catatan || '-';

    // Status & Assignment
    const telat = checkOverdue(b);
    const badgeTelat = telat ? ` <span class="badge telat"><i class="fa-solid fa-triangle-exclamation"></i> Terlambat</span>` : '';
    const cls = { "Diterima": "diterima", "Proses Ukur": "proses", "Pemeriksaan": "pemeriksaan", "Selesai": "selesai" }[b.status] || "diterima";
    document.getElementById('detStatus').innerHTML = `<span class="badge ${cls}">${b.status}</span>${badgeTelat}`;
    document.getElementById('detPetugas').innerText = b.petugasUkur || '-';
    document.getElementById('detPembantu').innerText = b.pembantuUkur || '-';

    // Timeline
    const tl = document.getElementById('detTimeline');
    tl.innerHTML = '';
    
    function addTimelineItem(title, dateStr, isCompleted) {
        if (!dateStr && !isCompleted) {
            tl.innerHTML += `<div class="timeline-item pending"><div class="timeline-content"><h4>${title}</h4><p>Belum ada tanggal</p></div></div>`;
        } else {
            tl.innerHTML += `<div class="timeline-item completed"><div class="timeline-content"><h4>${title}</h4><p>${formatDate(dateStr)}</p></div></div>`;
        }
    }

    addTimelineItem("Berkas Diterima", b.tglTerima, true);
    addTimelineItem("Proses Pengukuran", b.tglUkur, !!b.tglUkur);
    addTimelineItem("Proses Pemeriksaan", b.tglPeriksa, !!b.tglPeriksa);
    addTimelineItem("Selesai", b.tglSelesai, !!b.tglSelesai);

    // Bind Edit Button
    document.getElementById('btnEditFromDetail').onclick = () => {
        document.getElementById('modalDetail').classList.remove('active');
        editBerkas(b.id);
    };

    document.getElementById('modalDetail').classList.add('active');
};

document.getElementById('btnCloseDetail').addEventListener('click', () => document.getElementById('modalDetail').classList.remove('active'));
document.getElementById('btnCloseDetail2').addEventListener('click', () => document.getElementById('modalDetail').classList.remove('active'));
