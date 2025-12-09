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

// ================== LOGIN ==================

app.get('/login', (req, res) => {
  res.render('login', { title: 'Giriş Yap', error: null });
});

app.post('/login', (req, res) => {
  
  return res.redirect('/');
});

// ================== ANASAYFA ==================

app.get('/', async (req, res) => {
  const yil = 2025;

  try {
    const [rows] = await db.query(`
      SELECT s.sube_adi,
             SUM(p.ciro_milyon)    AS toplam_ciro_m,
             SUM(p.net_kar_milyon) AS toplam_kar_m
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ?
      GROUP BY s.sube_id, s.sube_adi
    `, [yil]);

    const toplamSube = rows.length;

    const enCokKar = [...rows]
      .sort((a, b) => Number(b.toplam_kar_m) - Number(a.toplam_kar_m))[0] || null;

    const enAzKar = [...rows]
      .sort((a, b) => Number(a.toplam_kar_m) - Number(b.toplam_kar_m))[0] || null;

    res.render('dashboard', {
      title: 'Anasayfa',
      activePage: 'dashboard',
      toplamSube,
      enCokKar,
      enAzKar,
    });
  } catch (err) {
    console.error('Anasayfa hata:', err);
    res.render('dashboard', {
      title: 'Anasayfa',
      activePage: 'dashboard',
      toplamSube: 0,
      enCokKar: null,
      enAzKar: null,
    });
  }
});

// ================== ŞUBE CİRO ANALİZİ ==================

app.get('/sube-ciro', async (req, res) => {
  const yil = 2025;
  const seciliAy = parseInt(req.query.ay || '1', 10);

  try {
    const [rows] = await db.query(`
      SELECT p.sube_id, s.sube_adi, p.ay, p.ciro_milyon
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ? AND p.ay = ?
      ORDER BY p.sube_id
    `, [yil, seciliAy]);

    const barLabels = BRANCHES.map(b => b.name);
    const barData = BRANCHES.map(b => {
      const row = rows.find(r => r.sube_id === b.id);
      return row ? Number(row.ciro_milyon) : 0;
    });
    const barColors = BRANCHES.map(b => b.color);

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
    const [rows] = await db.query(`
      SELECT p.sube_id, s.sube_adi, p.ay, p.net_kar_milyon
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ?
      ORDER BY p.ay, p.sube_id
    `, [yil]);

    
    const barLabels = BRANCHES.map(b => b.name);
    const barData = BRANCHES.map(b => {
      const row = rows.find(r => r.ay === seciliAy && r.sube_id === b.id);
      return row ? Number(row.net_kar_milyon) : 0;
    });
    const barColors = BRANCHES.map(b => b.color);

    
    const lineLabels = MONTHS;
    const totalData = [];

    for (let ay = 1; ay <= 6; ay++) {
      const aylikToplam = rows
        .filter(r => r.ay === ay)
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
  const seciliAy = parseInt(req.query.ay || '0', 10); 

  try {
    const params = [yil];
    let whereAy = '';
    if (seciliAy >= 1 && seciliAy <= 6) {
      whereAy = ' AND p.ay = ?';
      params.push(seciliAy);
    }

    const [rows] = await db.query(`
      SELECT p.sube_id, s.sube_adi,
             SUM(p.musteri_sayisi) AS toplam_musteri
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ? ${whereAy}
      GROUP BY p.sube_id, s.sube_adi
      ORDER BY p.sube_id
    `, params);

    const labels = rows.map(r => r.sube_adi);
    const data = rows.map(r => Number(r.toplam_musteri));
    const colors = rows.map(r => {
      const b = BRANCHES.find(b => b.name === r.sube_adi);
      return b ? b.color : '#999999';
    });
    const offsets = labels.map(label => (label === 'Selçuk' ? 15 : 0)); 

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

  const sube1 = BRANCHES.find(b => b.key === sube1Key) || BRANCHES[0];
  const sube2 = BRANCHES.find(b => b.key === sube2Key) || BRANCHES[4];

  try {
    
    const [rowsMonth] = await db.query(`
      SELECT ss.sube_id, s.sube_adi, ss.stok_gun
      FROM sube_stok_kullanim ss
      JOIN sube s ON ss.sube_id = s.sube_id
      WHERE ss.yil = ? AND ss.ay = ?
      ORDER BY ss.sube_id
    `, [yil, seciliAy]);

    const barLabels = BRANCHES.map(b => b.name);
    const barData = BRANCHES.map(b => {
      const r = rowsMonth.find(row => row.sube_id === b.id);
      return r ? Number(r.stok_gun) : 0;
    });
    const barColors = BRANCHES.map(b => b.color);

    
    const [rowsComp] = await db.query(`
      SELECT ss.sube_id, s.sube_adi, ss.ay, ss.stok_gun
      FROM sube_stok_kullanim ss
      JOIN sube s ON ss.sube_id = s.sube_id
      WHERE ss.yil = ?
        AND ss.sube_id IN (?, ?)
      ORDER BY ss.ay, ss.sube_id
    `, [yil, sube1.id, sube2.id]);

    const compareLabels = MONTHS;
    const data1 = [];
    const data2 = [];

    for (let ay = 1; ay <= 6; ay++) {
      const r1 = rowsComp.find(r => r.ay === ay && r.sube_id === sube1.id);
      const r2 = rowsComp.find(r => r.ay === ay && r.sube_id === sube2.id);
      data1.push(r1 ? Number(r1.stok_gun) : 0);
      data2.push(r2 ? Number(r2.stok_gun) : 0);
    }

    const dataset1 = {
      label: sube1.name,
      borderColor: sube1.color,
      backgroundColor: rgbaForBranch(sube1.key),
      data: data1,
      fill: true,
      tension: 0
    };

    const dataset2 = {
      label: sube2.name,
      borderColor: sube2.color,
      backgroundColor: rgbaForBranch(sube2.key),
      data: data2,
      fill: true,
      tension: 0
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

  const sube1 = BRANCHES.find(b => b.key === sube1Key) || BRANCHES[0];
  const sube2 = BRANCHES.find(b => b.key === sube2Key) || BRANCHES[4];

  try {
    const [rows] = await db.query(`
      SELECT p.sube_id, s.sube_adi, p.ay, p.net_kar_milyon
      FROM sube_aylik_performans p
      JOIN sube s ON p.sube_id = s.sube_id
      WHERE p.yil = ?
        AND p.sube_id IN (?, ?)
      ORDER BY p.ay, p.sube_id
    `, [yil, sube1.id, sube2.id]);

    const labels = MONTHS;
    const data1 = [];
    const data2 = [];

    for (let ay = 1; ay <= 6; ay++) {
      const r1 = rows.find(r => r.ay === ay && r.sube_id === sube1.id);
      const r2 = rows.find(r => r.ay === ay && r.sube_id === sube2.id);
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
    const [rows] = await db.query(`
      SELECT urun_id, urun_adi, satis_fiyati, stok
      FROM urunler
      ORDER BY urun_id
    `);
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

