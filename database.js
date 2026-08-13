const fs = require('fs');
const path = require('path');

const STORE_PATH = process.env.VERCEL ? '/tmp/data_store.json' : './data_store.json';

const defaultUnits = [
    { id: 'G01', nama: 'Gudang Utama Farmasi' },
    { id: 'D01', nama: 'Depo Farmasi Rawat Jalan' },
    { id: 'D02', nama: 'Depo Farmasi Rawat Inap' }
];

const defaultBarang = [
    { kode_barang: 'OBT001', nama: 'Paracetamol 500mg Tablet', jenis: 'Obat Bebas', satuan: 'Tablet', stok_minimum: 100 },
    { kode_barang: 'OBT002', nama: 'Amoxicillin 500mg Kaplet', jenis: 'Obat Keras', satuan: 'Kaplet', stok_minimum: 50 },
    { kode_barang: 'ALK001', nama: 'Infus Ringer Lactate 500ml', jenis: 'Alkes', satuan: 'Botol', stok_minimum: 20 }
];

const defaultBatch = [
    { id: 1, unit_id: 'G01', kode_barang: 'OBT002', no_batch: 'AMX-2026-05', tgl_expired: '2026-11-15', saldo: 30 },
    { id: 2, unit_id: 'G01', kode_barang: 'OBT001', no_batch: 'BATCH-2026-01', tgl_expired: '2026-12-01', saldo: 50 },
    { id: 3, unit_id: 'G01', kode_barang: 'OBT001', no_batch: 'BATCH-2027-02', tgl_expired: '2027-06-01', saldo: 100 }
];

function loadStore() {
    try {
        if (fs.existsSync(STORE_PATH)) {
            const raw = fs.readFileSync(STORE_PATH, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error("Error loading store:", e);
    }
    const initData = {
        units: defaultUnits,
        barangList: defaultBarang,
        batchList: defaultBatch,
        nextBatchId: 4
    };
    saveStore(initData);
    return initData;
}

function saveStore(store) {
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) {
        console.error("Error saving store:", e);
    }
}

const db = {
    serialize: (fn) => fn(),
    all: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const store = loadStore();

        // 1. Get Semua Barang
        if (sql.includes('FROM barang') && !sql.includes('JOIN')) {
            return callback(null, store.barangList);
        }

        // 2. Get Stok FEFO per kode barang
        if (sql.includes('FROM barang_batch WHERE kode_barang =')) {
            const kode = params[0];
            const result = store.batchList
                .filter(b => b.kode_barang === kode && Number(b.saldo) > 0)
                .sort((a, b) => new Date(a.tgl_expired) - new Date(b.tgl_expired));
            return callback(null, result);
        }

        // 3. Get Stok Per Unit (JOIN)
        if (sql.includes('WHERE bb.unit_id =') || sql.includes('FROM barang_batch bb')) {
            const unitId = params[0];
            const result = store.batchList
                .filter(b => b.unit_id === unitId && Number(b.saldo) > 0)
                .map(b => {
                    const brg = store.barangList.find(x => x.kode_barang === b.kode_barang) || {};
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
            const result = store.batchList.filter(b => b.unit_id === unitId && b.kode_barang === kode && b.no_batch === noBatch);
            return callback(null, result);
        }

        // Default batch filter
        if (sql.includes('FROM barang_batch')) {
            const [unitId, kode] = params;
            const result = store.batchList
                .filter(b => b.unit_id === unitId && b.kode_barang === kode && Number(b.saldo) > 0)
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
        const store = loadStore();

        // 1. CEK RESTOK BATCH LEBIH DAHULU (PENTING: Mencegah bentrokan nama tabel)
        if (sql.includes('barang_batch') && (sql.includes('INSERT') || sql.includes('VALUES') || sql.includes('ON CONFLICT'))) {
            const [unit_id, kode_barang, no_batch, tgl_expired, qty] = params;
            const numQty = parseInt(qty) || 0;
            const existing = store.batchList.find(b => b.unit_id === unit_id && b.kode_barang === kode_barang && b.no_batch === no_batch);
            if (existing) {
                existing.saldo = Number(existing.saldo) + numQty;
                existing.tgl_expired = tgl_expired;
            } else {
                store.batchList.push({ id: store.nextBatchId++, unit_id, kode_barang, no_batch, tgl_expired, saldo: numQty });
            }
            saveStore(store);
            if (callback) callback(null);
            return;
        }

        // 2. Insert Master Barang Baru
        if (sql.includes('INSERT INTO barang ') || sql.includes('INSERT INTO barang(')) {
            const [kode_barang, nama, jenis, satuan, stok_minimum] = params;
            const idx = store.barangList.findIndex(b => b.kode_barang === kode_barang);
            if (idx >= 0) {
                store.barangList[idx] = { kode_barang, nama, jenis, satuan, stok_minimum: Number(stok_minimum) };
            } else {
                store.barangList.push({ kode_barang, nama, jenis, satuan, stok_minimum: Number(stok_minimum) });
            }
            saveStore(store);
            if (callback) callback(null);
            return;
        }

        // Update Master Barang
        if (sql.includes('UPDATE barang SET')) {
            const [nama, jenis, satuan, stok_minimum, kode_barang] = params;
            const item = store.barangList.find(b => b.kode_barang === kode_barang);
            if (item) {
                item.nama = nama;
                item.jenis = jenis;
                item.satuan = satuan;
                item.stok_minimum = Number(stok_minimum);
            }
            saveStore(store);
            if (callback) callback(null);
            return;
        }

        // Delete Master Barang
        if (sql.includes('DELETE FROM barang')) {
            const [kode_barang] = params;
            const idx = store.barangList.findIndex(b => b.kode_barang === kode_barang);
            if (idx >= 0) store.barangList.splice(idx, 1);
            for (let i = store.batchList.length - 1; i >= 0; i--) {
                if (store.batchList[i].kode_barang === kode_barang) store.batchList.splice(i, 1);
            }
            saveStore(store);
            if (callback) callback(null);
            return;
        }

        // Update Saldo (Potong Stok)
        if (sql.includes('UPDATE barang_batch SET saldo = saldo -')) {
            const [potong, id] = params;
            const batch = store.batchList.find(b => b.id === id);
            if (batch) {
                batch.saldo = Math.max(0, Number(batch.saldo) - Number(potong));
            }
            saveStore(store);
            if (callback) callback(null);
            return;
        }

        saveStore(store);
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