const db = require('./database');

db.serialize(() => {
    const stmtBatch = db.prepare(`
        INSERT INTO barang_batch (unit_id, kode_barang, no_batch, tgl_expired, saldo)
        VALUES (?, ?, ?, ?, ?)
    `);

    // Batch 1 Paracetamol: Expired Des 2026 (Kedaluwarsa Lebih Awal)
    stmtBatch.run('G01', 'OBT001', 'BATCH-2026-01', '2026-12-01', 50);

    // Batch 2 Paracetamol: Expired Jun 2027 (Kedaluwarsa Lebih Lama)
    stmtBatch.run('G01', 'OBT001', 'BATCH-2027-02', '2027-06-01', 100);

    // Batch Amoxicillin
    stmtBatch.run('G01', 'OBT002', 'AMX-2026-05', '2026-11-15', 30);

    stmtBatch.finalize();
    console.log("Data stok batch obat berhasil ditambahkan!");
});