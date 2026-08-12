const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./hospital_inventory.db');

db.serialize(() => {
    // 1. Tabel Unit/Depo
    db.run(`CREATE TABLE IF NOT EXISTS unit (
        id TEXT PRIMARY KEY,
        nama TEXT NOT NULL
    )`);

    // 2. Tabel Master Barang (Obat/Alkes)
    db.run(`CREATE TABLE IF NOT EXISTS barang (
        kode_barang TEXT PRIMARY KEY,
        nama TEXT NOT NULL,
        jenis TEXT,
        satuan TEXT NOT NULL,
        stok_minimum INTEGER DEFAULT 0
    )`);

    // 3. Tabel Batch & Stok (Sistem FEFO)
    db.run(`CREATE TABLE IF NOT EXISTS barang_batch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id TEXT,
        kode_barang TEXT,
        no_batch TEXT NOT NULL,
        tgl_expired DATE NOT NULL,
        saldo INTEGER DEFAULT 0,
        FOREIGN KEY(unit_id) REFERENCES unit(id),
        FOREIGN KEY(kode_barang) REFERENCES barang(kode_barang)
    )`);

    // 4. Tabel Transaksi Masuk
    db.run(`CREATE TABLE IF NOT EXISTS trx_masuk (
        no_trx TEXT PRIMARY KEY,
        tanggal DATE NOT NULL,
        supplier_name TEXT,
        no_invoice TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS trx_masuk_detail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        no_trx TEXT,
        kode_barang TEXT,
        no_batch TEXT,
        tgl_expired DATE,
        qty INTEGER,
        harga INTEGER,
        FOREIGN KEY(no_trx) REFERENCES trx_masuk(no_trx)
    )`);

    console.log("Database & tabel berhasil diinisialisasi.");
});

module.exports = db;