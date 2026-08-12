const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 1. Get Semua Barang
app.get('/api/barang', (req, res) => {
    db.all('SELECT * FROM barang', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// 2. Tambah Barang Baru
app.post('/api/barang', (req, res) => {
    const { kode_barang, nama, jenis, satuan, stok_minimum } = req.body;
    const sql = `INSERT INTO barang (kode_barang, nama, jenis, satuan, stok_minimum) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [kode_barang, nama, jenis, satuan, stok_minimum], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: "Barang berhasil ditambahkan", kode_barang });
    });
});

// 3. Get Stok berdasarkan Urutan Expired (FEFO)
app.get('/api/stok/fefo/:kode_barang', (req, res) => {
    const { kode_barang } = req.params;
    const sql = `SELECT * FROM barang_batch WHERE kode_barang = ? AND saldo > 0 ORDER BY tgl_expired ASC`;
    db.all(sql, [kode_barang], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// Route Halaman Utama
app.get('/', (req, res) => {
    res.send('API Pergudangan Rumah Sakit Berhasil Berjalan!');
});

// 4. Endpoint Transaksi Barang Masuk (Penerimaan dari Supplier)
app.post('/api/transaksi/masuk', (req, res) => {
    const { no_trx, tanggal, supplier_name, no_invoice, unit_id, items } = req.body;

    db.serialize(() => {
        // Simpan Header Transaksi
        const stmtHeader = db.prepare(`INSERT INTO trx_masuk (no_trx, tanggal, supplier_name, no_invoice) VALUES (?, ?, ?, ?)`);
        stmtHeader.run(no_trx, tanggal, supplier_name, no_invoice);
        stmtHeader.finalize();

        // Simpan Detail & Update/Insert Stok Batch
        const stmtDetail = db.prepare(`INSERT INTO trx_masuk_detail (no_trx, kode_barang, no_batch, tgl_expired, qty, harga) VALUES (?, ?, ?, ?, ?, ?)`);
        const stmtBatch = db.prepare(`
            INSERT INTO barang_batch (unit_id, kode_barang, no_batch, tgl_expired, saldo)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(unit_id, kode_barang, no_batch) 
            DO UPDATE SET saldo = saldo + excluded.saldo
        `);

        items.forEach(item => {
            stmtDetail.run(no_trx, item.kode_barang, item.no_batch, item.tgl_expired, item.qty, item.harga);
            stmtBatch.run(unit_id, item.kode_barang, item.no_batch, item.tgl_expired, item.qty);
        });

        stmtDetail.finalize();
        stmtBatch.finalize();

        res.json({ message: "Transaksi barang masuk berhasil disimpan dan stok batch diperbarui." });
    });
});
// 5. Cek Stok Berdasarkan Unit / Depo
app.get('/api/stok/unit/:unit_id', (req, res) => {
    const { unit_id } = req.params;
    const sql = `
        SELECT b.kode_barang, b.nama, bb.no_batch, bb.tgl_expired, bb.saldo 
        FROM barang_batch bb 
        JOIN barang b ON bb.kode_barang = b.kode_barang 
        WHERE bb.unit_id = ? AND bb.saldo > 0 
        ORDER BY bb.tgl_expired ASC
    `;
    db.all(sql, [unit_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ unit_id, data: rows });
    });
});

// 6. Transaksi Mutasi (Pindah Stok Antar Depo/Unit)
app.post('/api/transaksi/mutasi', (req, res) => {
    const { no_trx, tanggal, unit_asal_id, unit_tujuan_id, items } = req.body;

    db.serialize(() => {
        // Simpan Header Mutasi
        const stmtHeader = db.prepare(`INSERT INTO trx_pindah (no_trx, tanggal, unit_asal_id, unit_tujuan_id, status) VALUES (?, ?, ?, ?, 'COMPLETED')`);
        stmtHeader.run(no_trx, tanggal, unit_asal_id, unit_tujuan_id);
        stmtHeader.finalize();

        // Update Stok: Kurangi dari unit_asal, Tambah ke unit_tujuan
        const stmtKurang = db.prepare(`UPDATE barang_batch SET saldo = saldo - ? WHERE unit_id = ? AND kode_barang = ? AND no_batch = ? AND saldo >= ?`);
        const stmtTambah = db.prepare(`
            INSERT INTO barang_batch (unit_id, kode_barang, no_batch, tgl_expired, saldo)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(unit_id, kode_barang, no_batch) 
            DO UPDATE SET saldo = saldo + excluded.saldo
        `);

        items.forEach(item => {
            stmtKurang.run(item.qty, unit_asal_id, item.kode_barang, item.no_batch, item.qty);
            stmtTambah.run(unit_tujuan_id, item.kode_barang, item.no_batch, item.tgl_expired, item.qty);
        });

        stmtKurang.finalize();
        stmtTambah.finalize();

        res.json({ message: "Mutasi barang antar depo berhasil diselesaikan." });
    });
});

// 7. Endpoint Tambah / Restok Batch Langsung dari Form
app.post('/api/stok/tambah', (req, res) => {
    const { unit_id, kode_barang, no_batch, tgl_expired, qty } = req.body;
    const sql = `
        INSERT INTO barang_batch (unit_id, kode_barang, no_batch, tgl_expired, saldo)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(unit_id, kode_barang, no_batch) 
        DO UPDATE SET saldo = saldo + excluded.saldo, tgl_expired = excluded.tgl_expired
    `;
    db.run(sql, [unit_id, kode_barang, no_batch, tgl_expired, qty], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: "Stok batch berhasil diperbarui!" });
    });
});
// 8. Endpoint Barang Keluar (Otomatis Potong Stok Berdasarkan FEFO)
app.post('/api/stok/keluar', (req, res) => {
    const { unit_id, kode_barang, qty } = req.body;
    let qtyDibutuhkan = parseInt(qty);

    // Cari batch yang punya saldo > 0, diurutkan dari tanggal expired terdekat (FEFO)
    const sqlSelect = `
        SELECT id, no_batch, tgl_expired, saldo 
        FROM barang_batch 
        WHERE unit_id = ? AND kode_barang = ? AND saldo > 0 
        ORDER BY tgl_expired ASC
    `;

    db.all(sqlSelect, [unit_id, kode_barang], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Hitung total saldo yang ada
        const totalSaldo = rows.reduce((acc, b) => acc + b.saldo, 0);
        if (totalSaldo < qtyDibutuhkan) {
            return res.status(400).json({ error: `Stok tidak mencukupi! Total stok tersedia hanya ${totalSaldo}` });
        }

        // Potong stok bertahap berdasarkan urutan FEFO
        db.serialize(() => {
            let detailPotong = [];
            const stmtUpdate = db.prepare(`UPDATE barang_batch SET saldo = saldo - ? WHERE id = ?`);

            for (let batch of rows) {
                if (qtyDibutuhkan <= 0) break;

                let potong = Math.min(batch.saldo, qtyDibutuhkan);
                stmtUpdate.run(potong, batch.id);
                qtyDibutuhkan -= potong;
                detailPotong.push(`${batch.no_batch} (-${potong})`);
            }

            stmtUpdate.finalize();
            res.json({ 
                message: `Barang keluar berhasil diproses! Batch yang dipotong (FEFO): ${detailPotong.join(', ')}` 
            });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});

module.exports = app;