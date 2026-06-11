const SHEET_BERKAS = "Berkas";
const SHEET_PETUGAS = "Petugas";

/**
 * 1. JALANKAN FUNGSI INI PERTAMA KALI
 * Pilih nama fungsi 'setupDatabase' di atas layar, lalu klik tombol 'Run' (Jalankan).
 * Ini akan otomatis membuat lembar kerja beserta kolom-kolomnya jika belum ada.
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let sheetBerkas = ss.getSheetByName(SHEET_BERKAS);
  if (!sheetBerkas) {
    sheetBerkas = ss.insertSheet(SHEET_BERKAS);
    // Kolom-kolom database
    sheetBerkas.appendRow(["id", "noBerkas", "tahun", "namaPemohon", "namaKuasa", "jenisPemohon", "noTelepon", "petugasUkur", "pembantuUkur", "tglTerima", "tglUkur", "tglPeriksa", "tglSelesai", "status", "catatan"]);
    // Freeze header baris pertama
    sheetBerkas.setFrozenRows(1);
    // Beri format teks tebal pada header
    sheetBerkas.getRange(1, 1, 1, 15).setFontWeight("bold");
  }
  
  let sheetPetugas = ss.getSheetByName(SHEET_PETUGAS);
  if (!sheetPetugas) {
    sheetPetugas = ss.insertSheet(SHEET_PETUGAS);
    sheetPetugas.appendRow(["Tipe", "Nama"]);
    sheetPetugas.appendRow(["Petugas", "Budi Santoso"]);
    sheetPetugas.appendRow(["Pembantu", "Deni Pratama"]);
    sheetPetugas.setFrozenRows(1);
    sheetPetugas.getRange(1, 1, 1, 2).setFontWeight("bold");
  }
}

/**
 * Menerima request HTTP GET dari Aplikasi (Mengambil Data)
 */
function doGet(e) {
  const action = e.parameter.action;
  
  // CORS Headers
  const output = ContentService.createTextOutput();
  
  if(action === 'get_all') {
    const responseData = {
      berkas: getSheetData(SHEET_BERKAS),
      petugas: getSheetData(SHEET_PETUGAS)
    };
    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput("Aplikasi API Ekspedisi Berkas Aktif!");
}

/**
 * Menerima request HTTP POST dari Aplikasi (Menyimpan/Menghapus Data)
 */
function doPost(e) {
  if (!e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "No data" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  
  if (action === 'save_berkas') {
    const result = saveBerkas(data.payload);
    return ContentService.createTextOutput(JSON.stringify({ success: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } else if (action === 'delete_berkas') {
    const result = deleteBerkas(data.payload.id);
    return ContentService.createTextOutput(JSON.stringify({ success: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } else if (action === 'save_petugas') {
    const result = savePetugasData(data.payload);
    return ContentService.createTextOutput(JSON.stringify({ success: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Unknown action" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================
// FUNGSI INTERNAL DATABASE
// ==========================

function getSheetData(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if(!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if(data.length <= 1) return []; // Hanya ada header atau kosong
  
  const headers = data[0];
  const rows = [];
  for(let i = 1; i < data.length; i++) {
    const obj = {};
    for(let j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    rows.push(obj);
  }
  return rows;
}

function saveBerkas(berkas) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BERKAS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // Cek apakah ID berkas sudah ada
  let rowIndex = -1;
  for(let i = 1; i < data.length; i++) {
    if(data[i][0] == berkas.id) {
      rowIndex = i + 1; // Array 0-indexed, tapi Row Spreadsheet 1-indexed
      break;
    }
  }
  
  // Susun data sesuai urutan kolom (header)
  const rowData = headers.map(header => {
    // Konversi nilai undefined menjadi string kosong
    return berkas[header] !== undefined ? berkas[header] : "";
  });
  
  if(rowIndex > -1) {
    // Update baris yang sudah ada
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Insert baris baru di bagian paling bawah
    sheet.appendRow(rowData);
  }
  return "Tersimpan";
}

function deleteBerkas(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BERKAS);
  const data = sheet.getDataRange().getValues();
  
  for(let i = 1; i < data.length; i++) {
    if(data[i][0] == id) {
      sheet.deleteRow(i + 1);
      return "Dihapus";
    }
  }
  return "Data tidak ditemukan";
}

function savePetugasData(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PETUGAS);
  sheet.clearContents();
  sheet.appendRow(["Tipe", "Nama"]);
  sheet.getRange(1, 1, 1, 2).setFontWeight("bold");
  
  if(payload.listPetugas && payload.listPetugas.length > 0) {
    payload.listPetugas.forEach(p => sheet.appendRow(["Petugas", p]));
  }
  
  if(payload.listPembantu && payload.listPembantu.length > 0) {
    payload.listPembantu.forEach(p => sheet.appendRow(["Pembantu", p]));
  }
  
  return "Petugas Tersimpan";
}
