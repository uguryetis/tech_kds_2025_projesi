const db = require('../config/db');
const scoreService = require('../services/scoreService');

const { BRANCHES, MONTHS, rgbaForBranch } = scoreService;

// 1. Dashboard (Anasayfa)
exports.getDashboard = async (req, res) => {
  const yil = 2025;
  try {
    const [rows] = await db.query(
      `SELECT s.sube_adi, SUM(p.ciro_milyon) AS toplam_ciro_m, SUM(p.net_kar_milyon) AS toplam_kar_m
       FROM sube_aylik_performans p JOIN sube s ON p.sube_id = s.sube_id
       WHERE p.yil = ? GROUP BY s.sube_id, s.sube_adi`, [yil]
    );

    const toplamSube = rows.length;
    const enCokKar = [...rows].sort((a, b) => b.toplam_kar_m - a.toplam_kar_m)[0] || null;
    const enAzKar = [...rows].sort((a, b) => a.toplam_kar_m - b.toplam_kar_m)[0] || null;

    let skorVerisi = null;
    let skorTablo = [];
    try {
      skorVerisi = await scoreService.hesaplaSubeSkorlari(yil);
      skorTablo = skorVerisi.subeAdlari.map((ad, i) => ({
        sube_adi: ad,
        skor: skorVerisi.base.skorlar[i],
        durum: skorVerisi.base.durumEtiketleri[i],
      }));
    } catch (e) {
      console.error('Skor hesaplama hatası:', e);
    }

    res.render('dashboard', {
      title: 'Anasayfa', activePage: 'dashboard',
      toplamSube, enCokKar, enAzKar, skorTablo,
      hasSkor: !!skorVerisi,
      skorJSON: skorVerisi ? JSON.stringify(skorVerisi) : 'null',
    });
  } catch (err) {
    console.error(err);
    res.render('dashboard', { title: 'Hata', activePage: 'dashboard', toplamSube:0, enCokKar:null, enAzKar:null, skorTablo:[], hasSkor:false });
  }
};

// 2. Şube Ciro Analizi
exports.getCiroAnaliz = async (req, res) => {
  const yil = 2025;
  const seciliAy = parseInt(req.query.ay || '1', 10);

  try {
    const [rows] = await db.query(
      `SELECT p.sube_id, s.sube_adi, p.ay, p.ciro_milyon
       FROM sube_aylik_performans p JOIN sube s ON p.sube_id = s.sube_id
       WHERE p.yil = ? AND p.ay = ? ORDER BY p.sube_id`, [yil, seciliAy]
    );

    const barLabels = BRANCHES.map((b) => b.name);
    const barData = BRANCHES.map((b) => {
      const row = rows.find((r) => r.sube_id === b.id);
      return row ? Number(row.ciro_milyon) : 0;
    });
    const barColors = BRANCHES.map((b) => b.color);

    res.render('sube-ciro', {
      title: 'Şube Ciro Analizi', activePage: 'sube-ciro',
      months: MONTHS, seciliAy, barLabels, barData, barColors
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};

// 3. Şube Kar Analizi
exports.getKarAnaliz = async (req, res) => {
  const yil = 2025;
  const seciliAy = parseInt(req.query.ay || '1', 10);

  try {
    const [rows] = await db.query(
      `SELECT p.sube_id, s.sube_adi, p.ay, p.net_kar_milyon
       FROM sube_aylik_performans p JOIN sube s ON p.sube_id = s.sube_id
       WHERE p.yil = ? ORDER BY p.ay, p.sube_id`, [yil]
    );

    const barLabels = BRANCHES.map((b) => b.name);
    const barData = BRANCHES.map((b) => {
      const row = rows.find((r) => r.ay === seciliAy && r.sube_id === b.id);
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
      data: totalData, fill: true, tension: 0,
    };

    res.render('sube-kar', {
      title: 'Şube Kâr Analizi', activePage: 'sube-kar',
      months: MONTHS, seciliAy, barLabels, barData, barColors,
      lineLabels, totalLineDataset,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};

// 4. Müşteri Analizi
exports.getMusteriAnaliz = async (req, res) => {
  const yil = 2025;
  const seciliAy = parseInt(req.query.ay || '0', 10);

  try {
    const params = [yil];
    let whereAy = '';
    if (seciliAy >= 1 && seciliAy <= 6) {
      whereAy = ' AND p.ay = ?';
      params.push(seciliAy);
    }

    const [rows] = await db.query(
      `SELECT p.sube_id, s.sube_adi, SUM(p.musteri_sayisi) AS toplam_musteri
       FROM sube_aylik_performans p JOIN sube s ON p.sube_id = s.sube_id
       WHERE p.yil = ? ${whereAy}
       GROUP BY p.sube_id, s.sube_adi ORDER BY p.sube_id`, params
    );

    const labels = rows.map((r) => r.sube_adi);
    const data = rows.map((r) => Number(r.toplam_musteri));
    const colors = rows.map((r) => {
      const b = BRANCHES.find((b) => b.name === r.sube_adi);
      return b ? b.color : '#999999';
    });
    const offsets = labels.map((label) => (label === 'Selçuk' ? 15 : 0));

    res.render('musteri-analiz', {
      title: 'Şube Müşteri Analizi', activePage: 'musteri-analiz',
      months: MONTHS, seciliAy, labels, data, colors, offsets,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};

// 5. Stok Analizi
exports.getStokAnaliz = async (req, res) => {
  const yil = 2025;
  const seciliAy = parseInt(req.query.ay || '1', 10);
  const sube1Key = req.query.sube1 || 'gaziemir';
  const sube2Key = req.query.sube2 || 'selcuk';

  const sube1 = BRANCHES.find((b) => b.key === sube1Key) || BRANCHES[0];
  const sube2 = BRANCHES.find((b) => b.key === sube2Key) || BRANCHES[4];

  try {
    const [rowsMonth] = await db.query(
      `SELECT ss.sube_id, s.sube_adi, ss.stok_gun
       FROM sube_stok_kullanim ss JOIN sube s ON ss.sube_id = s.sube_id
       WHERE ss.yil = ? AND ss.ay = ? ORDER BY ss.sube_id`, [yil, seciliAy]
    );

    const barLabels = BRANCHES.map((b) => b.name);
    const barData = BRANCHES.map((b) => {
      const r = rowsMonth.find((row) => row.sube_id === b.id);
      return r ? Number(r.stok_gun) : 0;
    });
    const barColors = BRANCHES.map((b) => b.color);

    const [rowsComp] = await db.query(
      `SELECT ss.sube_id, s.sube_adi, ss.ay, ss.stok_gun
       FROM sube_stok_kullanim ss JOIN sube s ON ss.sube_id = s.sube_id
       WHERE ss.yil = ? AND ss.sube_id IN (?, ?) ORDER BY ss.ay, ss.sube_id`,
      [yil, sube1.id, sube2.id]
    );

    const compareLabels = MONTHS;
    const data1 = [];
    const data2 = [];

    for (let ay = 1; ay <= 6; ay++) {
      const r1 = rowsComp.find((r) => r.ay === ay && r.sube_id === sube1.id);
      const r2 = rowsComp.find((r) => r.ay === ay && r.sube_id === sube2.id);
      data1.push(r1 ? Number(r1.stok_gun) : 0);
      data2.push(r2 ? Number(r2.stok_gun) : 0);
    }

    res.render('sube-stok', {
      title: 'Şube Stok Analizi', activePage: 'sube-stok',
      months: MONTHS, seciliAy, barLabels, barData, barColors,
      compareLabels, sube1Key, sube2Key,
      dataset1: {
        label: sube1.name, borderColor: sube1.color, backgroundColor: rgbaForBranch(sube1.key),
        data: data1, fill: true, tension: 0,
      },
      dataset2: {
        label: sube2.name, borderColor: sube2.color, backgroundColor: rgbaForBranch(sube2.key),
        data: data2, fill: true, tension: 0,
      }
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};

// 6. Kâr Karşılaştırma
exports.getKarKarsilastirma = async (req, res) => {
  const yil = 2025;
  const sube1Key = req.query.sube1 || 'gaziemir';
  const sube2Key = req.query.sube2 || 'selcuk';

  const sube1 = BRANCHES.find((b) => b.key === sube1Key) || BRANCHES[0];
  const sube2 = BRANCHES.find((b) => b.key === sube2Key) || BRANCHES[4];

  try {
    const [rows] = await db.query(
      `SELECT p.sube_id, s.sube_adi, p.ay, p.net_kar_milyon
       FROM sube_aylik_performans p JOIN sube s ON p.sube_id = s.sube_id
       WHERE p.yil = ? AND p.sube_id IN (?, ?) ORDER BY p.ay, p.sube_id`,
      [yil, sube1.id, sube2.id]
    );

    const labels = MONTHS;
    const data1 = [];
    const data2 = [];

    for (let ay = 1; ay <= 6; ay++) {
      const r1 = rows.find((r) => r.ay === ay && r.sube_id === sube1.id);
      const r2 = rows.find((r) => r.ay === ay && r.sube_id === sube2.id);
      data1.push(r1 ? Number(r1.net_kar_milyon) : 0);
      data2.push(r2 ? Number(r2.net_kar_milyon) : 0);
    }

    res.render('kar-karsilastirma', {
      title: 'İki Şube Kâr Karşılaştırma', activePage: 'kar-karsilastirma',
      labels, sube1Key, sube2Key,
      dataset1: {
        label: sube1.name, borderColor: sube1.color, backgroundColor: rgbaForBranch(sube1.key),
        data: data1, fill: true, tension: 0,
      },
      dataset2: {
        label: sube2.name, borderColor: sube2.color, backgroundColor: rgbaForBranch(sube2.key),
        data: data2, fill: true, tension: 0,
      }
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};