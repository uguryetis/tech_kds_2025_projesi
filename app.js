// app.js
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// ================== SABİT ŞUBELER / AYLAR ==================

const BRANCHES = [
  { key: 'gaziemir',  id: 1, name: 'Gaziemir',  color: '#2ecc71' }, // yeşil
  { key: 'bayrakli',  id: 2, name: 'Bayraklı',  color: '#3498db' }, // mavi
  { key: 'karsiyaka', id: 3, name: 'Karşıyaka', color: '#95a5a6' }, // gri
  { key: 'urla',      id: 4, name: 'Urla',      color: '#f39c12' }, // turuncu
  { key: 'selcuk',    id: 5, name: 'Selçuk',    color: '#e74c3c' }, // kırmızı
];

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];

app.locals.BRANCHES = BRANCHES;
app.locals.MONTHS = MONTHS;

function rgbaForBranch(key) {
  switch (key) {
    case 'gaziemir':  return 'rgba(46, 204, 113, 0.2)';
    case 'bayrakli':  return 'rgba(52, 152, 219, 0.2)';
    case 'karsiyaka': return 'rgba(149, 165, 166, 0.2)';
    case 'urla':      return 'rgba(243, 156, 18, 0.2)';
    case 'selcuk':    return 'rgba(231, 76, 60, 0.2)';
    default:          return 'rgba(149, 165, 166, 0.2)';
  }
}

// ================== SAĞLIK SKORU YARDIMCI FONKSİYONLARI ==================
//
// Kurallar (aylık):
// - Ciro:
//    > 200 M → +2 puan
//    > 500 M → +1 puan daha (toplam +3)
// - Net Kâr:
//    > 0     → +4 puan
//    > 50 M  → +1 puan daha (toplam +5)
//    ≤ 0     → 0 puan
// - Müşteri Oranı (o aydaki toplam müşteriye göre %):
//    ≥ %10   → +2 puan
//    ≥ %25   → +1 puan daha (toplam +3)
// - Stok Devir Günü:
//    < 60 gün → +2 puan
//    < 45 gün → +1 puan daha (toplam +3)
//
// Maksimum: 14 puan / ay → 6 ayda 84 puan.
// Sonra 0–100 aralığına ölçekleniyor.

function hesaplaRawPuanlar(branchDataList, toplamMusteriAy, opts = {}) {
  const stokFactor = opts.stokFactor || 1;  // Senaryo A için 1.25
  const netKarFactor = opts.netKarFactor || 1; // Senaryo B için 0.8
  const rawPoints = [];

  branchDataList.forEach((b) => {
    let puan = 0;

    for (let ay = 1; ay <= 6; ay++) {
      const m = b.months[ay] || {};
      const ciro = Number(m.ciro) || 0;
      const netKar = (Number(m.netKar) || 0) * netKarFactor;
      const musteri = Number(m.musteri) || 0;
      let stokGun = Number(m.stokGun) || 0;
      stokGun = stokGun * stokFactor;

      const toplamM = toplamMusteriAy[ay] || 0;
      const oran = toplamM > 0 ? (musteri / toplamM) * 100 : 0;

      // Ciro puanı
      if (ciro > 200) {
        puan += 2;
        if (ciro > 500) {
          puan += 1;
        }
      }

      // Net kâr puanı
      if (netKar > 0) {
        puan += 4;
        if (netKar > 50) {
          puan += 1;
        }
      }

      // Müşteri oranı puanı
      if (oran >= 10) {
        puan += 2;
        if (oran >= 25) {
          puan += 1;
        }
      }

      // Stok devir günü puanı (düşük gün iyidir)
      if (stokGun > 0 && stokGun < 60) {
        puan += 2;
        if (stokGun < 45) {
          puan += 1;
        }
      }
    }

    rawPoints.push(puan);
  });

  return rawPoints;
}

function skorlaraDonustur(rawPoints) {
  const maxPossible = 84; // 6 ay * 14 puan
  const skorlar = rawPoints.map((p) =>
    Math.round((p / maxPossible) * 100)
  );

  const n = skorlar.length;
  const durumEtiketleri = new Array(n);

  // En düşük her zaman "Kritik"
  const sirali = skorlar.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s);

  sirali.forEach(({ i }, rank) => {
    let durum;
    if (rank === 0) {
      durum = 'Başarılı (Model Alınmalı)';
    } else if (rank === 1) {
      durum = 'İyi (Geliştirilmeli)';
    } else if (rank === 2) {
      durum = 'İzlenmeli (İyileştirilmeli)';
    } else {
      durum = 'Kritik! (Kapatılması Gerekebilir!)';
    }
    durumEtiketleri[i] = durum;
  });

  return { skorlar, durumEtiketleri };
}

// Tüm yıl verilerini çekip, mevcut / senaryo A / senaryo B skorlarını hesaplar
async function hesaplaSubeSkorlari(yil) {
  // Aylık performans
  const [perfRows] = await db.query(
    `
    SELECT 
      s.sube_id,
      s.sube_adi,
      p.ay,
      p.ciro_milyon,
      p.net_kar_milyon,
      p.musteri_sayisi
    FROM sube_aylik_performans p
    JOIN sube s ON p.sube_id = s.sube_id
    WHERE p.yil = ?
    ORDER BY s.sube_id, p.ay
    `,
    [yil]
  );

  // Aylık stok günleri
  const [stokRows] = await db.query(
    `
    SELECT
      s.sube_id,
      s.sube_adi,
      ss.ay,
      ss.stok_gun
    FROM sube_stok_kullanim ss
    JOIN sube s ON ss.sube_id = s.sube_id
    WHERE ss.yil = ?
    ORDER BY s.sube_id, ss.ay
    `,
    [yil]
  );

  // Şube -> aylık veriler
  const branchMap = new Map();
  BRANCHES.forEach((b) => {
    branchMap.set(b.id, { id: b.id, name: b.name, months: {} });
  });

  const toplamMusteriAy = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  // Performans verilerini doldur
  perfRows.forEach((r) => {
    const b = branchMap.get(r.sube_id);
    if (!b) return;
    if (!b.months[r.ay]) b.months[r.ay] = {};
    b.months[r.ay].ciro = Number(r.ciro_milyon) || 0;
    b.months[r.ay].netKar = Number(r.net_kar_milyon) || 0;
    b.months[r.ay].musteri = Number(r.musteri_sayisi) || 0;
    toplamMusteriAy[r.ay] += Number(r.musteri_sayisi) || 0;
  });

  // Stok verilerini doldur
  stokRows.forEach((r) => {
    const b = branchMap.get(r.sube_id);
    if (!b) return;
    if (!b.months[r.ay]) b.months[r.ay] = {};
    b.months[r.ay].stokGun = Number(r.stok_gun) || 0;
  });

  const branchDataList = BRANCHES.map((b) => branchMap.get(b.id));

  // Mevcut
  const baseRaw = hesaplaRawPuanlar(
    branchDataList,
    toplamMusteriAy,
    { stokFactor: 1, netKarFactor: 1 }
  );

  // Senaryo A: stok devir günleri %25 kötüleşir (stokFactor 1.25)
  const senaryoARaw = hesaplaRawPuanlar(
    branchDataList,
    toplamMusteriAy,
    { stokFactor: 1.25, netKarFactor: 1 }
  );

  // Senaryo B: net kâr %20 düşer (netKarFactor 0.8)
  const senaryoBRaw = hesaplaRawPuanlar(
    branchDataList,
    toplamMusteriAy,
    { stokFactor: 1, netKarFactor: 0.8 }
  );

  const base = skorlaraDonustur(baseRaw);
  const senaryoA = skorlaraDonustur(senaryoARaw);
  const senaryoB = skorlaraDonustur(senaryoBRaw);

  return {
    subeAdlari: branchDataList.map((b) => b.name),
    base,
    senaryoA,
    senaryoB,
  };
}

// ================== LOGIN ==================

app.get('/login', (req, res) => {
  res.render('login', { title: 'Giriş Yap', error: null });
});

app.post('/login', (req, res) => {
  // Şimdilik doğrudan anasayfaya atıyoruz
  return res.redirect('/');
});

// ================== ANASAYFA (DASHBOARD) ==================

app.get('/', async (req, res) => {
  const yil = 2025;

  try {
    // Eski kart verileri
    const [rows] = await db.query(
      `
      SELECT s.sube_adi,
             SUM(p.ciro_milyon)    AS toplam_ciro_m,
             SUM(p.net_kar_milyon) AS toplam_kar_m
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ?
      GROUP BY s.sube_id, s.sube_adi
    `,
      [yil]
    );

    const toplamSube = rows.length;

    const enCokKar =
      [...rows].sort(
        (a, b) => Number(b.toplam_kar_m) - Number(a.toplam_kar_m)
      )[0] || null;

    const enAzKar =
      [...rows].sort(
        (a, b) => Number(a.toplam_kar_m) - Number(b.toplam_kar_m)
      )[0] || null;

    // Yeni: Şube Sağlık Skoru + Senaryo verisi
    let skorVerisi = null;
    let skorTablo = [];
    try {
      skorVerisi = await hesaplaSubeSkorlari(yil);
      skorTablo = skorVerisi.subeAdlari.map((ad, i) => ({
        sube_adi: ad,
        skor: skorVerisi.base.skorlar[i],
        durum: skorVerisi.base.durumEtiketleri[i],
      }));
    } catch (e) {
      console.error('Skor hesaplama hatası:', e);
    }

    res.render('dashboard', {
      title: 'Anasayfa',
      activePage: 'dashboard',
      toplamSube,
      enCokKar,
      enAzKar,
      skorTablo,
      hasSkor: !!skorVerisi,
      skorJSON: skorVerisi ? JSON.stringify(skorVerisi) : 'null',
    });
  } catch (err) {
    console.error('Anasayfa hata:', err);
    res.render('dashboard', {
      title: 'Anasayfa',
      activePage: 'dashboard',
      toplamSube: 0,
      enCokKar: null,
      enAzKar: null,
      skorTablo: [],
      hasSkor: false,
      skorJSON: 'null',
    });
  }
});

// ================== ŞUBE CİRO ANALİZİ ==================

app.get('/sube-ciro', async (req, res) => {
  const yil = 2025;
  const seciliAy = parseInt(req.query.ay || '1', 10);

  try {
    const [rows] = await db.query(
      `
      SELECT p.sube_id, s.sube_adi, p.ay, p.ciro_milyon
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ? AND p.ay = ?
      ORDER BY p.sube_id
    `,
      [yil, seciliAy]
    );

    const barLabels = BRANCHES.map((b) => b.name);
    const barData = BRANCHES.map((b) => {
      const row = rows.find((r) => r.sube_id === b.id);
      return row ? Number(row.ciro_milyon) : 0;
    });
    const barColors = BRANCHES.map((b) => b.color);

    res.render('sube-ciro', {
      title: 'Şube Ciro Analizi',
      activePage: 'sube-ciro',
      months: MONTHS,
      seciliAy,
      barLabels,
      barData,
      barColors,
    });
  } catch (err) {
    console.error('Şube ciro hata:', err);
    res.render('sube-ciro', {
      title: 'Şube Ciro Analizi',
      activePage: 'sube-ciro',
      months: MONTHS,
      seciliAy: 1,
      barLabels: [],
      barData: [],
      barColors: [],
    });
  }
});

// ================== ŞUBE KÂR ANALİZİ ==================

app.get('/sube-kar', async (req, res) => {
  const yil = 2025;
  const seciliAy = parseInt(req.query.ay || '1', 10);

  try {
    const [rows] = await db.query(
      `
      SELECT p.sube_id, s.sube_adi, p.ay, p.net_kar_milyon
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ?
      ORDER BY p.ay, p.sube_id
    `,
      [yil]
    );

    const barLabels = BRANCHES.map((b) => b.name);
    const barData = BRANCHES.map((b) => {
      const row = rows.find(
        (r) => r.ay === seciliAy && r.sube_id === b.id
      );
      return row ? Number(row.net_kar_milyon) : 0;
    });
    const barColors = BRANCHES.map((b) => b.color);

    const lineLabels = MONTHS;
    const totalData = [];

    for (let ay = 1; ay <= 6; ay++) {
      const aylikToplam = rows
        .filter((r) => r.ay === ay)
        .reduce((acc, r) => acc + Number(r.net_kar_milyon), 0);
      totalData.push(aylikToplam);
    }

    const totalLineDataset = {
      label: 'Toplam Net Kâr',
      borderColor: '#1d4ed8',
      backgroundColor: 'rgba(37, 99, 235, 0.15)',
      data: totalData,
      fill: true,
      tension: 0,
    };

    res.render('sube-kar', {
      title: 'Şube Kâr Analizi',
      activePage: 'sube-kar',
      months: MONTHS,
      seciliAy,
      barLabels,
      barData,
      barColors,
      lineLabels,
      totalLineDataset,
    });
  } catch (err) {
    console.error('Şube kâr hata:', err);
    res.render('sube-kar', {
      title: 'Şube Kâr Analizi',
      activePage: 'sube-kar',
      months: MONTHS,
      seciliAy: 1,
      barLabels: [],
      barData: [],
      barColors: [],
      lineLabels: MONTHS,
      totalLineDataset: {
        label: 'Toplam Net Kâr',
        borderColor: '#1d4ed8',
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        data: [0, 0, 0, 0, 0, 0],
        fill: true,
        tension: 0,
      },
    });
  }
});

// ================== ŞUBE MÜŞTERİ ANALİZİ ==================

app.get('/musteri-analiz', async (req, res) => {
  const yil = 2025;
  const seciliAy = parseInt(req.query.ay || '0', 10); // 0 = 6 aylık toplam

  try {
    const params = [yil];
    let whereAy = '';
    if (seciliAy >= 1 && seciliAy <= 6) {
      whereAy = ' AND p.ay = ?';
      params.push(seciliAy);
    }

    const [rows] = await db.query(
      `
      SELECT p.sube_id, s.sube_adi,
             SUM(p.musteri_sayisi) AS toplam_musteri
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ? ${whereAy}
      GROUP BY p.sube_id, s.sube_adi
      ORDER BY p.sube_id
    `,
      params
    );

    const labels = rows.map((r) => r.sube_adi);
    const data = rows.map((r) => Number(r.toplam_musteri));
    const colors = rows.map((r) => {
      const b = BRANCHES.find((b) => b.name === r.sube_adi);
      return b ? b.color : '#999999';
    });
    const offsets = labels.map((label) =>
      label === 'Selçuk' ? 15 : 0
    );

    res.render('musteri-analiz', {
      title: 'Şube Müşteri Analizi',
      activePage: 'musteri-analiz',
      months: MONTHS,
      seciliAy,
      labels,
      data,
      colors,
      offsets,
    });
  } catch (err) {
    console.error('Müşteri analiz hata:', err);
    res.render('musteri-analiz', {
      title: 'Şube Müşteri Analizi',
      activePage: 'musteri-analiz',
      months: MONTHS,
      seciliAy: 0,
      labels: [],
      data: [],
      colors: [],
      offsets: [],
    });
  }
});

// ================== ŞUBE STOK ANALİZİ ==================

app.get('/sube-stok', async (req, res) => {
  const yil = 2025;
  const seciliAy = parseInt(req.query.ay || '1', 10);

  const sube1Key = req.query.sube1 || 'gaziemir';
  const sube2Key = req.query.sube2 || 'selcuk';

  const sube1 = BRANCHES.find((b) => b.key === sube1Key) || BRANCHES[0];
  const sube2 = BRANCHES.find((b) => b.key === sube2Key) || BRANCHES[4];

  try {
    const [rowsMonth] = await db.query(
      `
      SELECT ss.sube_id, s.sube_adi, ss.stok_gun
      FROM sube_stok_kullanim ss
      JOIN sube s ON ss.sube_id = s.sube_id
      WHERE ss.yil = ? AND ss.ay = ?
      ORDER BY ss.sube_id
    `,
      [yil, seciliAy]
    );

    const barLabels = BRANCHES.map((b) => b.name);
    const barData = BRANCHES.map((b) => {
      const r = rowsMonth.find((row) => row.sube_id === b.id);
      return r ? Number(r.stok_gun) : 0;
    });
    const barColors = BRANCHES.map((b) => b.color);

    const [rowsComp] = await db.query(
      `
      SELECT ss.sube_id, s.sube_adi, ss.ay, ss.stok_gun
      FROM sube_stok_kullanim ss
      JOIN sube s ON ss.sube_id = s.sube_id
      WHERE ss.yil = ?
        AND ss.sube_id IN (?, ?)
      ORDER BY ss.ay, ss.sube_id
    `,
      [yil, sube1.id, sube2.id]
    );

    const compareLabels = MONTHS;
    const data1 = [];
    const data2 = [];

    for (let ay = 1; ay <= 6; ay++) {
      const r1 = rowsComp.find(
        (r) => r.ay === ay && r.sube_id === sube1.id
      );
      const r2 = rowsComp.find(
        (r) => r.ay === ay && r.sube_id === sube2.id
      );
      data1.push(r1 ? Number(r1.stok_gun) : 0);
      data2.push(r2 ? Number(r2.stok_gun) : 0);
    }

    const dataset1 = {
      label: sube1.name,
      borderColor: sube1.color,
      backgroundColor: rgbaForBranch(sube1.key),
      data: data1,
      fill: true,
      tension: 0,
    };

    const dataset2 = {
      label: sube2.name,
      borderColor: sube2.color,
      backgroundColor: rgbaForBranch(sube2.key),
      data: data2,
      fill: true,
      tension: 0,
    };

    res.render('sube-stok', {
      title: 'Şube Stok Analizi',
      activePage: 'sube-stok',
      months: MONTHS,
      seciliAy,
      barLabels,
      barData,
      barColors,
      compareLabels,
      dataset1,
      dataset2,
      sube1Key,
      sube2Key,
    });
  } catch (err) {
    console.error('Şube stok hata:', err);
    res.render('sube-stok', {
      title: 'Şube Stok Analizi',
      activePage: 'sube-stok',
      months: MONTHS,
      seciliAy: 1,
      barLabels: [],
      barData: [],
      barColors: [],
      compareLabels: MONTHS,
      dataset1: null,
      dataset2: null,
      sube1Key,
      sube2Key,
    });
  }
});

// ================== İKİ ŞUBE KÂR KARŞILAŞTIRMA ==================

app.get('/kar-karsilastirma', async (req, res) => {
  const yil = 2025;
  const sube1Key = req.query.sube1 || 'gaziemir';
  const sube2Key = req.query.sube2 || 'selcuk';

  const sube1 = BRANCHES.find((b) => b.key === sube1Key) || BRANCHES[0];
  const sube2 = BRANCHES.find((b) => b.key === sube2Key) || BRANCHES[4];

  try {
    const [rows] = await db.query(
      `
      SELECT p.sube_id, s.sube_adi, p.ay, p.net_kar_milyon
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ?
        AND p.sube_id IN (?, ?)
      ORDER BY p.ay, p.sube_id
    `,
      [yil, sube1.id, sube2.id]
    );

    const labels = MONTHS;
    const data1 = [];
    const data2 = [];

    for (let ay = 1; ay <= 6; ay++) {
      const r1 = rows.find(
        (r) => r.ay === ay && r.sube_id === sube1.id
      );
      const r2 = rows.find(
        (r) => r.ay === ay && r.sube_id === sube2.id
      );
      data1.push(r1 ? Number(r1.net_kar_milyon) : 0);
      data2.push(r2 ? Number(r2.net_kar_milyon) : 0);
    }

    const dataset1 = {
      label: sube1.name,
      borderColor: sube1.color,
      backgroundColor: rgbaForBranch(sube1.key),
      data: data1,
      fill: true,
      tension: 0,
    };

    const dataset2 = {
      label: sube2.name,
      borderColor: sube2.color,
      backgroundColor: rgbaForBranch(sube2.key),
      data: data2,
      fill: true,
      tension: 0,
    };

    res.render('kar-karsilastirma', {
      title: 'İki Şube Kâr Karşılaştırma',
      activePage: 'kar-karsilastirma',
      labels,
      dataset1,
      dataset2,
      sube1Key,
      sube2Key,
    });
  } catch (err) {
    console.error('Kar karşılaştırma hata:', err);
    res.render('kar-karsilastirma', {
      title: 'İki Şube Kâr Karşılaştırma',
      activePage: 'kar-karsilastirma',
      labels: MONTHS,
      dataset1: null,
      dataset2: null,
      sube1Key,
      sube2Key,
    });
  }
});

// ================== ÜRÜNLER ==================

app.get('/urunler', async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT urun_id, urun_adi, satis_fiyati, stok
      FROM urunler
      ORDER BY urun_id
    `
    );
    res.render('urunler', {
      title: 'Ürünler',
      activePage: 'urunler',
      urunler: rows,
    });
  } catch (err) {
    console.error('Ürünler hata:', err);
    res.render('urunler', {
      title: 'Ürünler',
      activePage: 'urunler',
      urunler: [],
    });
  }
});

app.post('/urunler/ekle', async (req, res) => {
  const { urun_adi, satis_fiyati, stok } = req.body;
  try {
    await db.query(
      'INSERT INTO urunler (urun_adi, satis_fiyati, stok) VALUES (?, ?, ?)',
      [urun_adi, satis_fiyati || 0, stok || 0]
    );
    res.redirect('/urunler');
  } catch (err) {
    console.error('Ürün ekleme hata:', err);
    res.redirect('/urunler');
  }
});

app.post('/urunler/:id/sil', async (req, res) => {
  const id = req.params.id;
  try {
    await db.query('DELETE FROM urunler WHERE urun_id = ?', [id]);
  } catch (err) {
    console.error('Ürün silme hata:', err);
  }
  res.redirect('/urunler');
});

app.post('/urunler/:id/guncelle', async (req, res) => {
  const id = req.params.id;
  const { urun_adi, satis_fiyati, stok } = req.body;
  try {
    await db.query(
      'UPDATE urunler SET urun_adi = ?, satis_fiyati = ?, stok = ? WHERE urun_id = ?',
      [urun_adi, satis_fiyati || 0, stok || 0, id]
    );
  } catch (err) {
    console.error('Ürün güncelleme hata:', err);
  }
  res.redirect('/urunler');
});

// ================== LOGOUT ==================

app.get('/logout', (req, res) => {
  res.redirect('/login');
});

// ================== SUNUCU ==================

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});




