const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const session = require('express-session');

const app = express();

// -------------------------
// 1) MIDDLEWARE & AYARLAR
// -------------------------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: 'tech_kds_secret',
    resave: false,
    saveUninitialized: false,
  })
);

// -------------------------
// 2) MYSQL BAĞLANTISI
// -------------------------

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',      
  password: '',      
  database: 'tech_kds',
  multipleStatements: true,
});

db.connect((err) => {
  if (err) {
    console.error('MySQL bağlantı hatası:', err);
  } else {
    console.log('MySQL bağlantısı başarılı');
  }
});

// -------------------------
// 3) AUTH MIDDLEWARE
// -------------------------

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  return res.redirect('/login');
}

// -------------------------
// 4) LOGIN / LOGOUT
// -------------------------

// Login sayfası
app.get('/login', (req, res) => {
  res.render('login', { title: 'Giriş', error: null });
});

// Login post
app.post('/login', (req, res) => {
  const { kullanici_id, sifre } = req.body;

  const sql = `
    SELECT * FROM admin
    WHERE kullanici_id = ? AND sifre = ?
  `;

  db.query(sql, [kullanici_id, sifre], (err, rows) => {
    if (err) {
      console.error('Login hatası:', err);
      return res.render('login', {
        title: 'Giriş',
        error: 'Veritabanı hatası',
      });
    }

    if (rows.length === 0) {
      return res.render('login', {
        title: 'Giriş',
        error: 'Kullanıcı adı veya şifre hatalı',
      });
    }

    req.session.loggedIn = true;
    req.session.username = kullanici_id;
    res.redirect('/');
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// -------------------------
// 5) ANASAYFA (GENEL İSTATİSTİKLER)
// -------------------------

app.get('/', requireAuth, (req, res) => {
  const yil = 2025;

  const sqlToplamSube = 'SELECT COUNT(*) AS toplamSube FROM sube';

  const sqlKarOzet = `
    SELECT s.sube_adi, SUM(k.kar) AS toplam_kar
    FROM sube_kar k
    JOIN sube s ON s.sube_id = k.sube_id
    WHERE k.yil = ?
      AND k.ay BETWEEN 1 AND 6
    GROUP BY s.sube_id, s.sube_adi
    ORDER BY toplam_kar DESC
  `;

  db.query(sqlToplamSube, (err1, rows1) => {
    if (err1) {
      console.error('Toplam şube sorgu hatası:', err1);
      return res.status(500).send('Veritabanı hatası');
    }

    const toplamSube = rows1[0]?.toplamSube || 0;

    db.query(sqlKarOzet, [yil], (err2, rows2) => {
      if (err2) {
        console.error('Kâr özet sorgu hatası:', err2);
        return res.status(500).send('Veritabanı hatası');
      }

      let enCokKar = null;
      let enAzKar = null;

      if (rows2.length > 0) {
        enCokKar = rows2[0];
        enAzKar = rows2[rows2.length - 1];
      }

      res.render('dashboard', {
        title: 'Anasayfa',
        activePage: 'dashboard',
        toplamSube,
        enCokKar,
        enAzKar,
      });
    });
  });
});

// -------------------------
// 6) ŞUBE CİRO ANALİZİ
// -------------------------

app.get('/sube-ciro', requireAuth, (req, res) => {
  const yil = 2025;
  const seciliAy = req.query.ay ? parseInt(req.query.ay, 10) : 1;

  const sql = `
    SELECT s.sube_adi, SUM(k.hasilat) AS toplam_ciro
    FROM sube_kar k
    JOIN sube s ON s.sube_id = k.sube_id
    WHERE k.yil = ? AND k.ay = ?
    GROUP BY s.sube_id, s.sube_adi
    ORDER BY toplam_ciro DESC
  `;

  db.query(sql, [yil, seciliAy], (err, rows) => {
    if (err) {
      console.error('Şube ciro sorgu hatası:', err);
      return res.status(500).send('Veritabanı hatası');
    }

    let toplamCiro = 0;
    const ciroData = rows.map((r) => {
      const ciro = Number(r.toplam_ciro || 0);
      toplamCiro += ciro;
      const renk = ciro < 100000 ? '#fecaca' : '#bbf7d0'; 
      return {
        sube: r.sube_adi,
        ciro,
        renk,
      };
    });

    res.render('sube-ciro', {
      title: 'Şube Ciro Analizi',
      activePage: 'sube-ciro',
      yil,
      seciliAy,
      ciroData,
      toplamCiro,
    });
  });
});

// -------------------------
// 7) ŞUBE KÂR ANALİZİ
// -------------------------

app.get('/sube-kar', requireAuth, (req, res) => {
  const yil = 2025;
  const seciliAy = req.query.ay ? parseInt(req.query.ay, 10) : 1;

  const sqlAylik = `
    SELECT s.sube_adi, SUM(k.kar) AS toplam_kar
    FROM sube_kar k
    JOIN sube s ON s.sube_id = k.sube_id
    WHERE k.yil = ? AND k.ay = ?
    GROUP BY s.sube_id, s.sube_adi
    ORDER BY toplam_kar DESC
  `;

  const sqlToplamKar = `
    SELECT k.ay, SUM(k.kar) AS toplam_kar
    FROM sube_kar k
    WHERE k.yil = ?
      AND k.ay BETWEEN 1 AND 6
    GROUP BY k.ay
    ORDER BY k.ay
  `;

  db.query(sqlAylik, [yil, seciliAy], (err1, rows1) => {
    if (err1) {
      console.error('Şube kâr aylık sorgu hatası:', err1);
      return res.status(500).send('Veritabanı hatası');
    }

    const karData = rows1.map((r) => ({
      sube: r.sube_adi,
      kar: Number(r.toplam_kar || 0),
    }));

    db.query(sqlToplamKar, [yil], (err2, rows2) => {
      if (err2) {
        console.error('Toplam kâr analizi sorgu hatası:', err2);
        return res.status(500).send('Veritabanı hatası');
      }

      const toplamKarAnalizi = rows2.map((r) => ({
        ay: r.ay,
        toplam_kar: Number(r.toplam_kar || 0),
      }));

      res.render('sube-kar', {
        title: 'Şube Kâr Analizi',
        activePage: 'sube-kar',
        yil,
        seciliAy,
        karData,
        toplamKarAnalizi,
      });
    });
  });
});

// -------------------------
// 8) ŞUBE MÜŞTERİ ANALİZİ
// -------------------------

app.get('/sube-musteri', requireAuth, (req, res) => {
  const yil = 2025;
  const seciliAy = req.query.ay ? parseInt(req.query.ay, 10) : 1;

  const sql = `
    SELECT s.sube_adi, m.toplam_ziyaret
    FROM sube_musteri_ziyaret m
    JOIN sube s ON s.sube_id = m.sube_id
    WHERE m.yil = ? AND m.ay = ?
    ORDER BY s.sube_id
  `;

  db.query(sql, [yil, seciliAy], (err, rows) => {
    if (err) {
      console.error('Şube müşteri sorgu hatası:', err);
      return res.status(500).send('Veritabanı hatası');
    }

    let toplamZiyaret = 0;
    const musteriData = rows.map((r) => {
      const ziyaret = Number(r.toplam_ziyaret || 0);
      toplamZiyaret += ziyaret;
      return {
        sube: r.sube_adi,
        ziyaret,
      };
    });

    res.render('sube-musteri', {
      title: 'Şube Müşteri Analizi',
      activePage: 'sube-musteri',
      yil,
      seciliAy,
      musteriData,
      toplamZiyaret,
    });
  });
});

// -------------------------
// 9) ŞUBE STOK ANALİZİ – STOKTA KALMA SÜRESİ (GÜN)
// -------------------------

app.get('/sube-stok', requireAuth, (req, res) => {
  const yil = 2025;
  const seciliAy = req.query.ay ? parseInt(req.query.ay, 10) : 1;

  const sql = `
    SELECT s.sube_adi, k.ay, k.stok_kullanilan, k.stok_eklenen
    FROM sube_stok_kullanim k
    JOIN sube s ON s.sube_id = k.sube_id
    WHERE k.yil = ? AND k.ay = ?
    ORDER BY s.sube_id
  `;

  db.query(sql, [yil, seciliAy], (err, rows) => {
    if (err) {
      console.error('Şube stok sorgu hatası:', err);
      return res.status(500).send('Veritabanı hatası');
    }

    const stokData = rows.map((r) => {
      const kullanilan = Number(r.stok_kullanilan || 0);
      const eklenen = Number(r.stok_eklenen || 0);

      let gun = null;
      if (kullanilan > 0) {
        const ortalamaStok = eklenen - kullanilan / 2; 
        gun = (ortalamaStok / kullanilan) * 30;        
      }

      return {
        sube: r.sube_adi,
        gun,
      };
    });

    // En uzun stokta kalma süresi (en düşük devir) olan şube
    let problemliSube = null;
    stokData.forEach((item) => {
      if (item.gun != null) {
        if (!problemliSube || item.gun > problemliSube.gun) {
          problemliSube = item;
        }
      }
    });

    res.render('sube-stok', {
      title: 'Şube Stok Analizi',
      activePage: 'sube-stok',
      yil,
      seciliAy,
      stokData,
      problemliSube,
    });
  });
});

// -------------------------
// 10) İKİ ŞUBE KÂR KARŞILAŞTIRMA
// -------------------------

app.get('/iki-sube-kar', requireAuth, (req, res) => {
  const yil = 2025;
  const sube1Id = req.query.sube1 ? parseInt(req.query.sube1, 10) : 1;
  const sube2Id = req.query.sube2 ? parseInt(req.query.sube2, 10) : 2;

  const sqlSubeler = 'SELECT sube_id, sube_adi FROM sube ORDER BY sube_id';

  const sqlKarKarsilastirma = `
    SELECT k.ay, s.sube_id, s.sube_adi, SUM(k.kar) AS toplam_kar
    FROM sube_kar k
    JOIN sube s ON s.sube_id = k.sube_id
    WHERE k.yil = ?
      AND k.ay BETWEEN 1 AND 6
      AND k.sube_id IN (?, ?)
    GROUP BY k.ay, s.sube_id, s.sube_adi
    ORDER BY k.ay, s.sube_id
  `;

  db.query(sqlSubeler, (err1, subeRows) => {
    if (err1) {
      console.error('Şube listesi sorgu hatası:', err1);
      return res.status(500).send('Veritabanı hatası');
    }

    db.query(sqlKarKarsilastirma, [yil, sube1Id, sube2Id], (err2, rows) => {
      if (err2) {
        console.error('İki şube kar karşılaştırma hatası:', err2);
        return res.status(500).send('Veritabanı hatası');
      }

      const aylarSet = new Set();
      const sube1KarlarMap = {};
      const sube2KarlarMap = {};
      let sube1Ad = '';
      let sube2Ad = '';

      rows.forEach((r) => {
        const ay = r.ay;
        const kar = Number(r.toplam_kar || 0);
        aylarSet.add(ay);

        if (r.sube_id === sube1Id) {
          sube1Ad = r.sube_adi;
          sube1KarlarMap[ay] = kar;
        } else if (r.sube_id === sube2Id) {
          sube2Ad = r.sube_adi;
          sube2KarlarMap[ay] = kar;
        }
      });

      const aylar = Array.from(aylarSet).sort((a, b) => a - b);
      const sube1Karlar = aylar.map((ay) => sube1KarlarMap[ay] || 0);
      const sube2Karlar = aylar.map((ay) => sube2KarlarMap[ay] || 0);

      res.render('iki-sube-kar', {
        title: 'İki Şube Kar Karşılaştırma',
        activePage: 'iki-sube-kar',
        yil,
        subeList: subeRows,
        sube1Id,
        sube2Id,
        sube1Ad,
        sube2Ad,
        aylar,
        sube1Karlar,
        sube2Karlar,
      });
    });
  });
});

// -------------------------
// 11) ÜRÜNLER – LİSTE / EKLE / GÜNCELLE / SİL
// -------------------------

// Liste
app.get('/urunler', requireAuth, (req, res) => {
  const sql = 'SELECT * FROM urunler ORDER BY urun_id';

  db.query(sql, (err, rows) => {
    if (err) {
      console.error('Ürün listeleme hatası:', err);
      return res.status(500).send('Veritabanı hatası');
    }

    res.render('urunler', {
      title: 'Ürünler',
      activePage: 'urunler',
      urunler: rows,
    });
  });
});

// Yeni ürün ekle
app.post('/urunler/ekle', requireAuth, (req, res) => {
  const { urun_adi, satis_fiyati, stok } = req.body;

  const sql = `
    INSERT INTO urunler (urun_adi, satis_fiyati, stok)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [urun_adi, satis_fiyati, stok], (err) => {
    if (err) {
      console.error('Ürün ekleme hatası:', err);
      return res.status(500).send('Veritabanı hatası');
    }
    res.redirect('/urunler');
  });
});

// Ürün güncelle
app.post('/urunler/guncelle/:id', requireAuth, (req, res) => {
  const urunId = parseInt(req.params.id, 10);
  const { urun_adi, satis_fiyati, stok } = req.body;

  const sql = `
    UPDATE urunler
    SET urun_adi = ?, satis_fiyati = ?, stok = ?
    WHERE urun_id = ?
  `;

  db.query(sql, [urun_adi, satis_fiyati, stok, urunId], (err) => {
    if (err) {
      console.error('Ürün güncelleme hatası:', err);
      return res.status(500).send('Veritabanı hatası');
    }
    res.redirect('/urunler');
  });
});

// Ürün sil
app.post('/urunler/sil/:id', requireAuth, (req, res) => {
  const urunId = parseInt(req.params.id, 10);

  const sql = 'DELETE FROM urunler WHERE urun_id = ?';

  db.query(sql, [urunId], (err) => {
    if (err) {
      console.error('Ürün silme hatası:', err);
      return res.status(500).send('Veritabanı hatası');
    }
    res.redirect('/urunler');
  });
});

// -------------------------
// 12) SUNUCU BAŞLATMA
// -------------------------

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});

