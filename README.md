# Tech KDS - İndeks Bilgisayar Karar Destek Sistemi

Bu proje, **İndeks Bilgisayar** şubelerinin aylık performanslarını, stok durumlarını ve kârlılıklarını analiz eden web tabanlı bir Karar Destek Sistemidir.

Proje, **Strict MVC (Model-View-Controller)** mimarisine uygun olarak geliştirilmiş, güvenlik ve sürdürülebilirlik prensipleri gözetilmiştir.

## 🎯 Projenin Amacı
* Farklı şubelerin (Gaziemir, Bayraklı vb.) finansal verilerini görselleştirmek.
* Yöneticilere şube kapatma/geliştirme kararlarında destek olacak "Sağlık Skoru" üretmek.
* Ürün envanter yönetimini güvenli bir şekilde sağlamak.

## 🏗 Mimari Yapı (Strict MVC)
Proje klasör yapısı, iş mantığı ve sunum katmanını tamamen ayıracak şekilde tasarlanmıştır:

* **src/config:** Veritabanı bağlantı ayarları.
* **src/controllers:** Tüm iş mantığı ve istek karşılama (Analysis, Product).
* **src/services:** Karmaşık skorlama algoritmaları ve hesaplamalar.
* **src/routes:** URL yönlendirmeleri.
* **views:** Kullanıcı arayüzü (EJS şablonları).

## 🛡 İş Kuralları (Business Logic)
Proje içerisinde veri bütünlüğünü koruyan özel senaryolar kodlanmıştır:
1.  **Stok Güvenliği:** Stok adedi 0'dan büyük olan ürünlerin silinmesi sistem tarafından engellenir.
2.  **Veri Tutarlılığı:** Ürün eklerken negatif fiyat veya negatif stok girişi yapılamaz.

## 🚀 Kurulum Adımları

Projeyi kendi bilgisayarınızda çalıştırmak için:

1.  Repoyu klonlayın:
    ```bash
    git clone [https://github.com/KULLANICI_ADIN/REPO_ADIN.git](https://github.com/KULLANICI_ADIN/REPO_ADIN.git)
    cd REPO_ADIN
    ```

2.  Gerekli paketleri yükleyin:
    ```bash
    npm install
    ```

3.  Çevresel değişkenleri ayarlayın:
    * `.env.example` dosyasının adını `.env` olarak değiştirin.
    * İçerisindeki veritabanı bilgilerini kendi MySQL ayarlarınıza göre güncelleyin.

4.  Uygulamayı başlatın:
    ```bash
    npm start
    ```
    Tarayıcıda: `http://localhost:3000`

## 🔌 API Endpoint Listesi

| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/` | Dashboard ve Şube Skorları |
| GET | `/sube-ciro` | Şube Bazlı Ciro Analizi |
| GET | `/sube-kar` | Kârlılık Analizi |
| GET | `/urunler` | Ürün Listesi |
| POST | `/urunler/ekle` | Yeni Ürün Ekleme |
| POST | `/urunler/:id/sil` | Ürün Silme (Stok Kontrollü) |

## 📊 ER Diyagramı
Veritabanı şeması `erd.png` dosyasında mevcuttur.