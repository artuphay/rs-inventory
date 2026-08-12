const db = require('./database');

db.serialize(() => {
    // 1. Data Unit / Depo
    const stmtUnit = db.prepare(`INSERT OR IGNORE INTO unit (id, nama) VALUES (?, ?)`);
    stmtUnit.run('G01', 'Gudang Utama Farmasi');
    stmtUnit.run('D01', 'Depo Farmasi Rawat Jalan');
    stmtUnit.run('D02', 'Depo Farmasi Rawat Inap');
    stmtUnit.finalize();

    // 2. Data Master Obat / Alkes Contoh
    const stmtBarang = db.prepare(`INSERT OR IGNORE INTO barang (kode_barang, nama, jenis, satuan, stok_minimum) VALUES (?, ?, ?, ?, ?)`);
    stmtBarang.run('OBT001', 'Paracetamol 500mg Tablet', 'Obat Bebas', 'Tablet', 100);
    stmtBarang.run('OBT002', 'Amoxicillin 500mg Kaplet', 'Obat Keras', 'Kaplet', 50);
    stmtBarang.run('ALK001', 'Infus Ringer Lactate 500ml', 'Alkes', 'Botol', 20);
    stmtBarang.finalize();

    console.log("Seed data (Unit & Barang) berhasil ditambahkan.");
});