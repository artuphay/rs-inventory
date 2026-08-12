const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Gunakan folder /tmp jika berjalan di Vercel Serverless
const dbPath = process.env.VERCEL ? '/tmp/hospital_inventory.db' : './hospital_inventory.db';

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS unit (id TEXT PRIMARY KEY, nama TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS barang (kode_barang TEXT PRIMARY KEY, nama TEXT NOT NULL, jenis TEXT, satuan TEXT NOT NULL, stok_minimum INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS barang_batch (id INTEGER PRIMARY KEY AUTOINCREMENT, unit_id TEXT, kode_barang TEXT, no_batch TEXT NOT NULL, tgl_expired DATE NOT NULL, saldo INTEGER DEFAULT 0, UNIQUE(unit_id, kode_barang, no_batch))`);

    // Auto-seed data dasar
    const stmtUnit = db.prepare(`INSERT OR IGNORE INTO unit (id, nama) VALUES (?, ?)`);
    stmtUnit.run('G01', 'Gudang Utama Farmasi');
    stmtUnit.run('D01', 'Depo Farmasi Rawat Jalan');
    stmtUnit.run('D02', 'Depo Farmasi Rawat Inap');
    stmtUnit.finalize();

    const stmtBarang = db.prepare(`INSERT OR IGNORE INTO barang (kode_barang, nama, jenis, satuan, stok_minimum) VALUES (?, ?, ?, ?, ?)`);
    stmtBarang.run('OBT001', 'Paracetamol 500mg Tablet', 'Obat Bebas', 'Tablet', 100);
    stmtBarang.run('OBT002', 'Amoxicillin 500mg Kaplet', 'Obat Keras', 'Kaplet', 50);
    stmtBarang.run('ALK001', 'Infus Ringer Lactate 500ml', 'Alkes', 'Botol', 20);
    stmtBarang.finalize();
});

module.exports = db;