// Data Store Murni JavaScript (Kompatibel Vercel Serverless)

const units = [
    { id: 'G01', nama: 'Gudang Utama Farmasi' },
    { id: 'D01', nama: 'Depo Farmasi Rawat Jalan' },
    { id: 'D02', nama: 'Depo Farmasi Rawat Inap' }
];

const barangList = [
    { kode_barang: 'OBT001', nama: 'Paracetamol 500mg Tablet', jenis: 'Obat Bebas', satuan: 'Tablet', stok_minimum: 100 },
    { kode_barang: 'OBT002', nama: 'Amoxicillin 500mg Kaplet', jenis: 'Obat Keras', satuan: 'Kaplet', stok_minimum: 50 },
    { kode_barang: 'ALK001', nama: 'Infus Ringer Lactate 500ml', jenis: 'Alkes', satuan: 'Botol', stok_minimum: 20 }
];

const batchList = [
    { id: 1, unit_id: 'G01', kode_barang: 'OBT002', no_batch: 'AMX-2026-05', tgl_expired: '2026-11-15', saldo: 30 },
    { id: 2, unit_id: 'G01', kode_barang: 'OBT001', no_batch: 'BATCH-2026-01', tgl_expired: '2026-12-01', saldo: 50 },
    { id: 3, unit_id: 'G01', kode_barang: 'OBT001', no_batch: 'BATCH-2027-02', tgl_expired: '2027-06-01', saldo: 100 }
];

let nextBatchId = 4;

const db = {
    serialize: (fn) => fn(),
    all: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        
        // 1. Get Semua Barang
        if (sql.includes('FROM barang') && !sql.includes('JOIN')) {
            return callback(null, barangList);
        }

        // 2. Get Stok FEFO
        if (sql.includes('FROM barang_batch WHERE kode_barang =')) {
            const kode = params[0];
            const result = batchList
                .filter(b => b.kode_barang === kode && b.saldo > 0)
                .sort((a, b) => new Date(a.tgl_expired) - new Date(b.tgl_expired));
            return callback(null, result);
        }

        // 3. Get Stok Per Unit (JOIN)
        if (sql.includes('WHERE bb.unit_id =') || sql.includes('FROM barang_batch bb')) {
            const unitId = params[0];
            const result = batchList
                .filter(b => b.unit_id === unitId && b.saldo > 0)
                .map(b => {
                    const brg = barangList.find(x => x.kode_barang === b.kode_barang) || {};
                    return {
                        kode_barang: b.kode_barang,
                        nama: brg.nama || b.kode_barang,
                        no_batch: b.no_batch,
                        tgl_expired: b.tgl_expired,
                        saldo: Number(b.saldo)
                    };
                })
                .sort((a, b) => new Date(a.tgl_expired) - new Date(b.tgl_expired));
            return callback(null, result);
        }

        // 4. Search Batch Spesifik untuk Retur
        if (sql.includes('WHERE unit_id = ? AND kode_barang = ? AND no_batch = ?')) {
            const [unitId, kode, noBatch] = params;
            const result = batchList.filter(b => b.unit_id === unitId && b.kode_barang === kode && b.no_batch === noBatch);
            return callback(null, result);
        }

        // Default: pencarian batch bertahap untuk FEFO keluar
        if (sql.includes('FROM barang_batch')) {
            const [unitId, kode] = params;
            const result = batchList
                .filter(b => b.unit_id === unitId && b.kode_barang === kode && b.saldo > 0)
                .sort((a, b) => new Date(a.tgl_expired) - new Date(b.tgl_expired));
            return callback(null, result);
        }

        callback(null, []);
    },

    run: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        // Insert Barang Baru
        if (sql.includes('INSERT INTO barang')) {
            const [kode_barang, nama, jenis, satuan, stok_minimum] = params;
            const idx = barangList.findIndex(b => b.kode_barang === kode_barang);
            if (idx >= 0) {
                barangList[idx] = { kode_barang, nama, jenis, satuan, stok_minimum: Number(stok_minimum) };
            } else {
                barangList.push({ kode_barang, nama, jenis, satuan, stok_minimum: Number(stok_minimum) });
            }
            if (callback) callback(null);
            return;
        }

        // Insert / Restok Batch
        if (sql.includes('barang_batch')) {
            const [unit_id, kode_barang, no_batch, tgl_expired, qty] = params;
            const numQty = parseInt(qty) || 0;
            const existing = batchList.find(b => b.unit_id === unit_id && b.kode_barang === kode_barang && b.no_batch === no_batch);
            if (existing) {
                existing.saldo = Number(existing.saldo) + numQty;
                existing.tgl_expired = tgl_expired;
            } else {
                batchList.push({ id: nextBatchId++, unit_id, kode_barang, no_batch, tgl_expired, saldo: numQty });
            }
            if (callback) callback(null);
            return;
        }

        // Update Master Barang
        if (sql.includes('UPDATE barang SET')) {
            const [nama, jenis, satuan, stok_minimum, kode_barang] = params;
            const item = barangList.find(b => b.kode_barang === kode_barang);
            if (item) {
                item.nama = nama;
                item.jenis = jenis;
                item.satuan = satuan;
                item.stok_minimum = Number(stok_minimum);
            }
            if (callback) callback(null);
            return;
        }

        // Delete Master Barang
        if (sql.includes('DELETE FROM barang')) {
            const [kode_barang] = params;
            const idx = barangList.findIndex(b => b.kode_barang === kode_barang);
            if (idx >= 0) barangList.splice(idx, 1);
            for (let i = batchList.length - 1; i >= 0; i--) {
                if (batchList[i].kode_barang === kode_barang) batchList.splice(i, 1);
            }
            if (callback) callback(null);
            return;
        }

        // Update Saldo (Potong Stok)
        if (sql.includes('UPDATE barang_batch SET saldo = saldo -')) {
            const [potong, id] = params;
            const batch = batchList.find(b => b.id === id);
            if (batch) {
                batch.saldo = Math.max(0, Number(batch.saldo) - Number(potong));
            }
            if (callback) callback(null);
            return;
        }

        if (callback) callback(null);
    },

    prepare: (sql) => {
        return {
            run: (...args) => {
                db.run(sql, args);
            },
            finalize: () => {}
        };
    }
};

module.exports = db;