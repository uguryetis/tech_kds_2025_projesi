const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');
const productController = require('../controllers/productController');
const scoreService = require('../services/scoreService');


router.use((req, res, next) => {
    res.locals.BRANCHES = scoreService.BRANCHES;
    res.locals.MONTHS = scoreService.MONTHS;
    next();
});

// Auth
router.get('/login', (req, res) => res.render('login', { title: 'Giriş Yap', error: null }));
router.post('/login', (req, res) => res.redirect('/'));
router.get('/logout', (req, res) => res.redirect('/login'));

// Analiz Sayfaları (Analysis Controller)
router.get('/', analysisController.getDashboard);
router.get('/sube-ciro', analysisController.getCiroAnaliz);
router.get('/sube-kar', analysisController.getKarAnaliz);
router.get('/musteri-analiz', analysisController.getMusteriAnaliz);
router.get('/sube-stok', analysisController.getStokAnaliz);
router.get('/kar-karsilastirma', analysisController.getKarKarsilastirma);

// Ürün İşlemleri (Product Controller)
router.get('/urunler', productController.getProducts);
router.post('/urunler/ekle', productController.addProduct);
router.post('/urunler/:id/sil', productController.deleteProduct);
router.post('/urunler/:id/guncelle', productController.updateProduct);

module.exports = router;