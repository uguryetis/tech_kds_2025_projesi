const db = require('../config/db');

exports.getProducts = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM urunler ORDER BY urun_id DESC');
    res.render('urunler', { title: 'Ürünler', activePage: 'urunler', urunler: rows });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};

exports.addProduct = async (req, res) => {
  const { urun_adi, satis_fiyati, stok } = req.body;
  
  // İŞ KURALI 1: Negatif fiyat veya stok engelleme
  if (parseFloat(satis_fiyati) < 0 || parseInt(stok) < 0) {
    console.log("HATA: Negatif değer girilemez.");
  
    return res.redirect('/urunler');
  }

  try {
    await db.query('INSERT INTO urunler (urun_adi, satis_fiyati, stok) VALUES (?, ?, ?)',
      [urun_adi, satis_fiyati || 0, stok || 0]);
    res.redirect('/urunler');
  } catch (err) {
    console.error(err);
    res.redirect('/urunler');
  }
};

exports.deleteProduct = async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await db.query('SELECT * FROM urunler WHERE urun_id = ?', [id]);
    const product = rows[0];

    // İŞ KURALI 2: Stokta ürün varsa silinemez
    if (product && product.stok > 0) {
      console.log(`HATA: Stok dolu (${product.stok}), silinemez.`);
      return res.redirect('/urunler');
    }

    await db.query('DELETE FROM urunler WHERE urun_id = ?', [id]);
    res.redirect('/urunler');
  } catch (err) {
    console.error(err);
    res.redirect('/urunler');
  }
};

exports.updateProduct = async (req, res) => {
  const id = req.params.id;
  const { urun_adi, satis_fiyati, stok } = req.body;
  try {
    await db.query('UPDATE urunler SET urun_adi = ?, satis_fiyati = ?, stok = ? WHERE urun_id = ?',
      [urun_adi, satis_fiyati || 0, stok || 0, id]);
    res.redirect('/urunler');
  } catch (err) {
    console.error(err);
    res.redirect('/urunler');
  }
};